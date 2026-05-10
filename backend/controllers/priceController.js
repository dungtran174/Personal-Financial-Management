// backend/controllers/priceController.js
// Production-grade price API for TradingView-like charts
const pool = require('../config/pg');
const { getPriceLatest, setCandlesCache, getCandlesCache } = require('../services/redisCache');
const { convertPrice, getExchangeRate } = require('../services/currencyConverter');

/**
 * Map timeframe to correct table/view
 */
function getTableForTimeframe(tf) {
  const tfMap = {
    '1m': 'price_ohlcv_1m',
    '5m': 'price_ohlcv_5m',
    '15m': 'price_ohlcv_15m',
    '1h': 'price_ohlcv_1h',
    '4h': 'price_ohlcv_4h',
    '1d': 'price_ohlcv'
  };
  return tfMap[tf] || 'price_ohlcv';
}

/**
 * Get timeframe duration in milliseconds
 * Used to filter out incomplete (current) candles
 */
function getTimeframeDuration(tf) {
  const durations = {
    '1m': 60 * 1000,           // 1 minute
    '5m': 5 * 60 * 1000,       // 5 minutes
    '15m': 15 * 60 * 1000,     // 15 minutes
    '1h': 60 * 60 * 1000,      // 1 hour
    '4h': 4 * 60 * 60 * 1000,  // 4 hours
    '1d': 24 * 60 * 60 * 1000  // 1 day
  };
  return durations[tf] || 60 * 1000;
}

/**
 * GET /api/v1/price/latest?symbol=BTCUSDT
 */
exports.getLatestPrice = async (req, res) => {
  const symbol = (req.query.symbol || '').toUpperCase();
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  try {
    // Get asset info for exchange
    const assetQuery = await pool.query(
      'SELECT exchange FROM assets WHERE symbol = $1',
      [symbol]
    );
    
    if (assetQuery.rows.length === 0) {
      return res.status(404).json({ error: 'symbol not found' });
    }
    
    const exchange = assetQuery.rows[0].exchange;
    const exchangeRate = await getExchangeRate();
    
    // try redis cache first
    const cached = await getPriceLatest(symbol);
    if (cached) {
      const priceConverted = await convertPrice(parseFloat(cached), exchange, exchangeRate);
      return res.json({ 
        symbol, 
        price: priceConverted.price, 
        currency: 'VND',
        source: 'redis' 
      });
    }

    // fallback to DB: try price_ticks first (most recent), then price_ohlcv
    let q = `
      SELECT p.price, p.ts FROM price_ticks p
      JOIN assets a ON a.id = p.asset_id
      WHERE a.symbol = $1
      ORDER BY p.ts DESC LIMIT 1
    `;
    let { rows } = await pool.query(q, [symbol]);
    
    if (rows[0]) {
      const priceConverted = await convertPrice(rows[0].price, exchange, exchangeRate);
      return res.json({ 
        symbol, 
        price: priceConverted.price,
        currency: 'VND',
        ts: rows[0].ts, 
        source: 'ticks' 
      });
    }

    // fallback to price_ohlcv
    q = `
      SELECT p.close as price, p.ts FROM price_ohlcv p
      JOIN assets a ON a.id = p.asset_id
      WHERE a.symbol = $1
      ORDER BY p.ts DESC LIMIT 1
    `;
    ({ rows } = await pool.query(q, [symbol]));
    
    if (!rows[0]) return res.status(404).json({ error: 'no price' });
    
    const priceConverted = await convertPrice(rows[0].price, exchange, exchangeRate);
    return res.json({ 
      symbol, 
      price: priceConverted.price,
      currency: 'VND',
      ts: rows[0].ts, 
      source: 'ohlcv' 
    });
  } catch (err) {
    console.error('getLatestPrice err', err);
    res.status(500).json({ error: 'failed' });
  }
};

/**
 * GET /api/v1/price/candles?symbol=BTCUSDT&timeframe=1m&limit=500&start=&end=
 * Standard TradingView-style candles endpoint
 * 
 * Features:
 * - Filters out incomplete (current) candles
 * - Returns candles in ascending order (oldest → newest)
 * - Smart caching with TTL based on timeframe
 * - Standard parameter names (timeframe, start, end)
 * - Fixed time window calculation to cover multiple trading days
 * 
 * Supports: 1m, 5m, 15m, 1h, 4h, 1d
 */
exports.getCandles = async (req, res) => {
  const symbol = (req.query.symbol || '').toUpperCase();
  const timeframe = (req.query.timeframe || '1d').toLowerCase();
  const limit = parseInt(req.query.limit || '500', 10);
  const startParam = req.query.start; // ISO timestamp or unix timestamp (keep original for cache check)
  const endParam = req.query.end;     // ISO timestamp or unix timestamp

  if (!symbol) {
    return res.status(400).json({ error: 'symbol required' });
  }

  const validTfs = ['1m', '5m', '15m', '1h', '4h', '1d'];
  if (!validTfs.includes(timeframe)) {
    return res.status(400).json({ 
      error: 'invalid timeframe', 
      validTfs,
      message: `Supported timeframes: ${validTfs.join(', ')}`
    });
  }

  try {
    // Get asset info for exchange
    const assetQuery = await pool.query(
      'SELECT exchange FROM assets WHERE symbol = $1',
      [symbol]
    );
    
    if (assetQuery.rows.length === 0) {
      return res.status(404).json({ error: 'symbol not found' });
    }
    
    const exchange = assetQuery.rows[0].exchange;
    
    // Convert unix timestamps to ISO if needed
    let startISO = startParam;
    let endISO = endParam;
    
    if (startParam && !isNaN(startParam)) {
      // Unix timestamp (seconds or milliseconds)
      const timestamp = parseInt(startParam);
      startISO = new Date(timestamp > 9999999999 ? timestamp : timestamp * 1000).toISOString();
    }
    
    if (endParam && !isNaN(endParam)) {
      const timestamp = parseInt(endParam);
      endISO = new Date(timestamp > 9999999999 ? timestamp : timestamp * 1000).toISOString();
    }

    // Check cache (only if no time range specified by user)
    if (!startParam && !endParam) {
      const cached = await getCandlesCache(symbol, timeframe);
      if (cached && Array.isArray(cached) && cached.length > 0) {
        // Return last N candles from cache
        const cachedCandles = cached.slice(-limit);
        
        // Convert prices to VND
        const exchangeRate = await getExchangeRate();
        const convertedCandles = await Promise.all(
          cachedCandles.map(async (candle) => {
            const openConverted = await convertPrice(candle.open, exchange, exchangeRate);
            const highConverted = await convertPrice(candle.high, exchange, exchangeRate);
            const lowConverted = await convertPrice(candle.low, exchange, exchangeRate);
            const closeConverted = await convertPrice(candle.close, exchange, exchangeRate);
            
            return {
              ts: candle.ts,
              open: openConverted.price,
              high: highConverted.price,
              low: lowConverted.price,
              close: closeConverted.price,
              volume: candle.volume
            };
          })
        );
        
        // Calculate change percent: (last close - first open) / first open * 100
        let changePercent = null;
        if (convertedCandles.length > 0) {
          const firstOpen = convertedCandles[0].open;
          const lastClose = convertedCandles[convertedCandles.length - 1].close;
          if (firstOpen !== 0) {
            changePercent = parseFloat(((lastClose - firstOpen) / firstOpen * 100).toFixed(2));
          }
        }
        
        return res.json({ 
          symbol, 
          timeframe, 
          count: convertedCandles.length,
          changePercent,
          currency: 'VND',
          candles: convertedCandles, 
          source: 'cache' 
        });
      }
    }

    const table = getTableForTimeframe(timeframe);
    const tfDuration = getTimeframeDuration(timeframe);
    
    // Calculate cutoff time for incomplete candle
    const now = new Date();
    const cutoffTime = endISO || now.toISOString();
    
    // Build query with optional time range
    let whereClauses = ['a.symbol = $1'];
    let params = [symbol];
    let paramIndex = 2;

    // FIX: Use fixed time windows based on timeframe to ensure enough data
    // This covers multiple trading days regardless of limit
    if (!startISO) {
      const windowDays = {
        '1m': 3,    // 3 days for 1m data (covers ~3 trading sessions)
        '5m': 7,    // 7 days for 5m data
        '15m': 14,  // 14 days for 15m data
        '1h': 30,   // 30 days for 1h data
        '4h': 60,   // 60 days for 4h data
        '1d': 365   // 365 days for daily data
      };
      
      const days = windowDays[timeframe] || 7;
      const defaultStart = new Date(new Date(cutoffTime).getTime() - (days * 24 * 60 * 60 * 1000));
      startISO = defaultStart.toISOString();
    }

    whereClauses.push(`p.ts >= $${paramIndex}`);
    params.push(startISO);
    paramIndex++;

    // Filter out incomplete (current) candle - only when no end time specified
    let maxTs;
    if (!endISO) {
      // Exclude the current incomplete candle
      maxTs = new Date(new Date(cutoffTime).getTime() - tfDuration);
    } else {
      // User specified end time, use it directly
      maxTs = new Date(endISO);
    }
    
    whereClauses.push(`p.ts <= $${paramIndex}`);
    params.push(maxTs.toISOString());
    paramIndex++;

    const q = `
      SELECT p.ts, p.open, p.high, p.low, p.close, p.volume
      FROM ${table} p
      JOIN assets a ON a.id = p.asset_id
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY p.ts DESC
      LIMIT ${limit}
    `;

    const { rows } = await pool.query(q, params);
    
    if (rows.length === 0) {
      return res.json({ 
        symbol, 
        timeframe, 
        table,
        count: 0,
        changePercent: null,
        candles: [],
        source: 'db',
        message: 'No data available for this timeframe',
        debug: {
          startISO,
          endISO: maxTs.toISOString(),
          limit
        }
      });
    }

    // Map to candle objects
    const candles = rows.map(r => ({
      ts: r.ts,
      open: parseFloat(r.open),
      high: parseFloat(r.high),
      low: parseFloat(r.low),
      close: parseFloat(r.close),
      volume: parseFloat(r.volume)
    }));

    // Reverse to get oldest → newest (TradingView standard)
    candles.reverse();

    // Convert prices to VND
    const exchangeRate = await getExchangeRate();
    const convertedCandles = await Promise.all(
      candles.map(async (candle) => {
        const openConverted = await convertPrice(candle.open, exchange, exchangeRate);
        const highConverted = await convertPrice(candle.high, exchange, exchangeRate);
        const lowConverted = await convertPrice(candle.low, exchange, exchangeRate);
        const closeConverted = await convertPrice(candle.close, exchange, exchangeRate);
        
        return {
          ts: candle.ts,
          open: openConverted.price,
          high: highConverted.price,
          low: lowConverted.price,
          close: closeConverted.price,
          volume: candle.volume
        };
      })
    );

    // Calculate change percent: (last close - first open) / first open * 100
    let changePercent = null;
    if (convertedCandles.length > 0) {
      const firstOpen = convertedCandles[0].open;
      const lastClose = convertedCandles[convertedCandles.length - 1].close;
      if (firstOpen !== 0) {
        changePercent = parseFloat(((lastClose - firstOpen) / firstOpen * 100).toFixed(2));
      }
    }

    // Cache if no time range specified by user (use original params)
    if (!startParam && !endParam && convertedCandles.length > 0) {
      const cacheTTL = timeframe === '1m' ? 30 :
                       timeframe === '5m' ? 60 :
                       timeframe === '15m' ? 180 :
                       timeframe === '1h' ? 300 :
                       timeframe === '4h' ? 600 :
                       1800;
      
      await setCandlesCache(symbol, timeframe, convertedCandles, cacheTTL).catch(err => {
        console.error('Cache set error:', err.message);
      });
    }

    return res.json({ 
      symbol, 
      timeframe, 
      table,
      count: convertedCandles.length,
      changePercent,
      currency: 'VND',
      candles: convertedCandles, 
      source: 'db',
      cutoffTime: maxTs.toISOString()
    });

  } catch (err) {
    console.error('getCandles error:', err);
    res.status(500).json({ 
      error: 'failed', 
      message: err.message,
      symbol,
      timeframe
    });
  }
};

/**
 * GET /api/v1/price/history?symbol=BTCUSDT&tf=1m&limit=500&from=&to=
 * Legacy endpoint - redirects to getCandles
 * Maintained for backward compatibility
 * 
 * @deprecated Use /candles endpoint instead
 */
exports.getPriceHistory = async (req, res) => {
  // Map legacy parameters to new ones
  const symbol = (req.query.symbol || '').toUpperCase();
  const timeframe = (req.query.tf || '1d').toLowerCase();
  const limit = parseInt(req.query.limit || '500', 10);
  const start = req.query.from; // ISO timestamp
  const end = req.query.to;     // ISO timestamp
  
  // Call getCandles with mapped parameters
  req.query.timeframe = timeframe;
  req.query.start = start;
  req.query.end = end;
  
  return exports.getCandles(req, res);

}
