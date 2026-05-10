/**
 * Market Controller - Ticker, Stats, Movers
 * For financial dashboard
 */

const pool = require('../config/pg');
const redis = require('../config/redis');
const { convertPrice, getExchangeRate } = require('../services/currencyConverter');

/**
 * Calculate 24h stats for a symbol  
 * Smart fallback: price_ticks (crypto) → price_ohlcv (stocks/indexes)
 * WITH TIME RANGE FILTER to avoid "out of shared memory"
 */
async function calculate24hStats(symbol) {
  try {
    // Get asset info first
    const assetInfo = await pool.query(
      'SELECT id, asset_type, exchange FROM assets WHERE symbol = $1',
      [symbol]
    );
    
    if (assetInfo.rows.length === 0) return null;
    
    const { id: assetId, asset_type: assetType, exchange } = assetInfo.rows[0];
    const isCrypto = assetType === 'crypto' || (exchange && exchange.toUpperCase() === 'BINANCE');
    
    // OPTIMIZATION 1: Time-Boxing
    // Chỉ tìm tick trong 7 ngày gần nhất. Nếu cũ hơn thì coi như không có dữ liệu live.
    // Giúp TimescaleDB không phải scan toàn bộ lịch sử hàng chục triệu dòng.
    const tickQuery = `
      SELECT price, ts, volume 
      FROM price_ticks 
      WHERE asset_id = $1 
      AND ts > NOW() - INTERVAL '7 days' 
      ORDER BY ts DESC 
      LIMIT 1
    `;

    // 2. Logic Branching based on Asset Type
    if (isCrypto) {
      // === CRYPTO LOGIC (BINANCE) ===
      // Chạy song song lấy tick mới nhất và thống kê 24h
      
      const cryptoStatsQuery = `
        WITH old_tick AS (
          SELECT price FROM price_ticks 
          WHERE asset_id = $1 
          AND ts <= NOW() - INTERVAL '24 hours'
          AND ts > NOW() - INTERVAL '25 hours' -- Optimization: Limit scan range
          ORDER BY ts DESC LIMIT 1
        ),
        stats AS (
          SELECT MAX(price) as high, MIN(price) as low, SUM(volume) as vol
          FROM price_ticks
          WHERE asset_id = $1 
          AND ts >= NOW() - INTERVAL '24 hours'
        )
        SELECT old_tick.price as price_old, stats.high, stats.low, stats.vol
        FROM stats
        LEFT JOIN old_tick ON true
      `;
      
      // Parallel Execution
      const [tickResult, statsRes] = await Promise.all([
        pool.query(tickQuery, [assetId]),
        pool.query(cryptoStatsQuery, [assetId])
      ]);

      const latestTick = tickResult.rows[0];
      const stats = statsRes.rows[0] || {};
      
      // If no tick data at all, return null
      if (!latestTick) return null;

      const currentPrice = parseFloat(latestTick.price);
      const prevPrice = parseFloat(stats.price_old || currentPrice); 
      
      return {
        current_price: currentPrice,
        price_24h_ago: prevPrice,
        change_24h: currentPrice - prevPrice,
        change_percent_24h: prevPrice > 0 ? ((currentPrice - prevPrice) / prevPrice) * 100 : 0,
        high_24h: parseFloat(stats.high || currentPrice),
        low_24h: parseFloat(stats.low || currentPrice),
        volume_24h: parseFloat(stats.vol || 0),
        ts: latestTick.ts
      };
      
    } else {
      // === STOCK/INDEX LOGIC (HOSE, US, etc.) ===
      
      // OPTIMIZATION: Limit OHLCV scan to 30 days
      const ohlcvQuery = `
        SELECT close, ts, open, high, low, volume
        FROM price_ohlcv
        WHERE asset_id = $1
        AND ts > NOW() - INTERVAL '30 days'
        ORDER BY ts DESC
        LIMIT 2
      `;

      // OPTIMIZATION 2: Parallel Execution
      // Chạy cả 2 query cùng lúc vì Stock cần cả Tick (giá live) và OHLCV (giá tham chiếu)
      const [tickResult, ohlcvResult] = await Promise.all([
        pool.query(tickQuery, [assetId]),
        pool.query(ohlcvQuery, [assetId])
      ]);

      const latestTick = tickResult.rows[0];
      const ohlcv = ohlcvResult.rows; // [latest, previous]

      let currentPrice, ts, prevClose, high, low, volume, open;

      if (latestTick) {
        // Case A: Have Real-time Tick Data
        currentPrice = parseFloat(latestTick.price);
        ts = latestTick.ts;
        volume = parseFloat(latestTick.volume); 
        
        if (ohlcv.length > 0) {
          const tickDate = new Date(ts).toDateString();
          const ohlcvDate = new Date(ohlcv[0].ts).toDateString();
          
          if (tickDate === ohlcvDate) {
            // Tick cùng ngày với nến OHLCV mới nhất -> Lấy nến hôm qua làm tham chiếu
            prevClose = ohlcv[1] ? parseFloat(ohlcv[1].close) : parseFloat(ohlcv[0].open);
            high = parseFloat(ohlcv[0].high);
            low = parseFloat(ohlcv[0].low);
            open = parseFloat(ohlcv[0].open);
          } else {
            // Tick mới hơn nến OHLCV -> Lấy nến mới nhất làm tham chiếu
            prevClose = parseFloat(ohlcv[0].close);
            high = currentPrice; 
            low = currentPrice; 
            open = currentPrice;
          }
        } else {
          prevClose = currentPrice;
          high = currentPrice; low = currentPrice; open = currentPrice;
        }
      } else {
        // Case B: No Tick Data (Fallback to OHLCV)
        if (ohlcv.length === 0) return null;
        
        const latest = ohlcv[0];
        const prev = ohlcv[1] || latest;
        
        currentPrice = parseFloat(latest.close);
        ts = latest.ts;
        prevClose = parseFloat(prev.close);
        high = parseFloat(latest.high);
        low = parseFloat(latest.low);
        open = parseFloat(latest.open);
        volume = parseFloat(latest.volume);
      }

      return {
        current_price: currentPrice,
        price_24h_ago: prevClose,
        change_24h: currentPrice - prevClose,
        change_percent_24h: prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : 0,
        high_24h: high,
        low_24h: low,
        volume_24h: volume,
        open: open,
        ts: ts
      };
    }
    
  } catch (err) {
    console.error(`calculate24hStats error for ${symbol}:`, err.message);
    return null;
  }
}

/**
 * GET /api/v1/market/ticker?symbol=BTCUSDT
 * Get full ticker with 24h stats
 */
exports.getTicker = async (req, res) => {
  const symbol = (req.query.symbol || '').toUpperCase();
  
  if (!symbol) {
    return res.status(400).json({ error: 'symbol required' });
  }
  
  try {
    // Try cache first
    const cacheKey = `ticker:${symbol}`;
    const cached = await redis.get(cacheKey);
    
    if (cached) {
      return res.json({
        ...JSON.parse(cached),
        source: 'cache'
      });
    }
    
    // Get asset info
    const assetQuery = await pool.query(
      'SELECT id, symbol, name, exchange, asset_type FROM assets WHERE symbol = $1',
      [symbol]
    );
    
    if (assetQuery.rows.length === 0) {
      return res.status(404).json({ error: 'symbol not found' });
    }
    
    const asset = assetQuery.rows[0];
    
    // Calculate 24h stats
    const stats = await calculate24hStats(symbol);
    
    if (!stats) {
      return res.status(404).json({ error: 'no price data' });
    }
    
    // Convert prices to VND
    const exchangeRate = await getExchangeRate();
    const priceConverted = await convertPrice(stats.current_price, asset.exchange, exchangeRate);
    const openConverted = await convertPrice(stats.open || stats.current_price, asset.exchange, exchangeRate);
    const high24hConverted = await convertPrice(stats.high_24h || 0, asset.exchange, exchangeRate);
    const low24hConverted = await convertPrice(stats.low_24h || 0, asset.exchange, exchangeRate);
    const prevCloseConverted = await convertPrice(stats.price_24h_ago || stats.current_price, asset.exchange, exchangeRate);
    
    const ticker = {
      symbol: asset.symbol,
      name: asset.name,
      exchange: asset.exchange,
      asset_type: asset.asset_type,
      price: priceConverted.price,
      open: openConverted.price,
      change24h: priceConverted.price - prevCloseConverted.price,
      changePercent24h: parseFloat(stats.change_percent_24h || 0),
      high24h: high24hConverted.price,
      low24h: low24hConverted.price,
      volume24h: parseFloat(stats.volume_24h || 0),
      prevClose: prevCloseConverted.price,
      currency: 'VND',
      timestamp: stats.ts
    };
    
    // Cache for 30 seconds
    await redis.setex(cacheKey, 30, JSON.stringify(ticker));
    
    res.json({
      ...ticker,
      source: 'db'
    });
    
  } catch (err) {
    console.error('getTicker error:', err);
    res.status(500).json({ error: 'failed', message: err.message });
  }
};

/**
 * GET /api/v1/market/tickers?symbols=BTCUSDT,ETHUSDT,BNBUSDT
 * Get multiple tickers at once (bulk)
 */
exports.getTickersBulk = async (req, res) => {
  const symbolsParam = req.query.symbols || '';
  const symbols = symbolsParam.split(',').map(s => s.trim().toUpperCase()).filter(s => s);
  
  if (symbols.length === 0) {
    return res.status(400).json({ error: 'symbols required (comma-separated)' });
  }
  
  if (symbols.length > 50) {
    return res.status(400).json({ error: 'max 50 symbols at once' });
  }
  
  try {
    const tickers = [];
    
    // Get exchange rate once for all conversions
    const exchangeRate = await getExchangeRate();
    
    for (const symbol of symbols) {
      try {
        // Try cache first
        const cacheKey = `ticker:${symbol}`;
        const cached = await redis.get(cacheKey);
        
        if (cached) {
          tickers.push(JSON.parse(cached));
          continue;
        }
        
        // Get from DB
        const assetQuery = await pool.query(
          'SELECT id, symbol, name, exchange, asset_type FROM assets WHERE symbol = $1',
          [symbol]
        );
        
        if (assetQuery.rows.length === 0) continue;
        
        const asset = assetQuery.rows[0];
        const stats = await calculate24hStats(symbol);
        
        if (!stats) continue;
        
        // Convert prices to VND
        const priceConverted = await convertPrice(stats.current_price, asset.exchange, exchangeRate);
        const high24hConverted = await convertPrice(stats.high_24h || 0, asset.exchange, exchangeRate);
        const low24hConverted = await convertPrice(stats.low_24h || 0, asset.exchange, exchangeRate);
        const prevCloseConverted = await convertPrice(stats.price_24h_ago || stats.current_price, asset.exchange, exchangeRate);
        
        const ticker = {
          symbol: asset.symbol,
          name: asset.name,
          exchange: asset.exchange,
          asset_type: asset.asset_type,
          price: priceConverted.price,
          change24h: priceConverted.price - prevCloseConverted.price,
          changePercent24h: parseFloat(stats.change_percent_24h || 0),
          high24h: high24hConverted.price,
          low24h: low24hConverted.price,
          volume24h: parseFloat(stats.volume_24h || 0),
          currency: 'VND',
          timestamp: stats.ts
        };
        
        // Cache for 30 seconds
        await redis.setex(cacheKey, 30, JSON.stringify(ticker));
        
        tickers.push(ticker);
        
      } catch (err) {
        console.error(`Error fetching ticker for ${symbol}:`, err.message);
        // Skip this symbol and continue
      }
    }
    
    res.json({
      count: tickers.length,
      tickers
    });
    
  } catch (err) {
    console.error('getTickersBulk error:', err);
    res.status(500).json({ error: 'failed', message: err.message });
  }
};

/**
 * GET /api/v1/market/movers?type=gainers&limit=10&asset_type=crypto
 * Get market movers (top gainers, losers, active)
 */
exports.getMarketMovers = async (req, res) => {
  const type = (req.query.type || 'gainers').toLowerCase(); // gainers, losers, active
  const limit = parseInt(req.query.limit || '10', 10);
  const assetType = req.query.asset_type; // optional filter
  
  if (!['gainers', 'losers', 'active'].includes(type)) {
    return res.status(400).json({ 
      error: 'invalid type', 
      valid: ['gainers', 'losers', 'active'] 
    });
  }
  
  if (limit > 100) {
    return res.status(400).json({ error: 'max limit is 100' });
  }
  
  try {
    // Try cache first
    const cacheKey = `movers:${type}:${assetType || 'all'}:${limit}`;
    const cached = await redis.get(cacheKey);
    
    if (cached) {
      return res.json({
        ...JSON.parse(cached),
        source: 'cache'
      });
    }
    
    // Get all active assets
    let assetFilter = 'a.status = $1';
    let params = ['OK'];
    
    if (assetType) {
      assetFilter += ' AND a.asset_type = $2';
      params.push(assetType);
    }
    
    const assetsQuery = `
      SELECT a.id, a.symbol, a.name, a.exchange, a.asset_type
      FROM assets a
      WHERE ${assetFilter}
      ORDER BY a.id
      LIMIT 200
    `;
    
    const { rows: assets } = await pool.query(assetsQuery, params);
    
    if (assets.length === 0) {
      return res.json({ type, data: [] });
    }
    
    // Calculate stats for each
    const results = [];
    
    for (const asset of assets) {
      try {
        const stats = await calculate24hStats(asset.symbol);
        
        if (!stats || !stats.current_price) continue;
        
        results.push({
          symbol: asset.symbol,
          name: asset.name,
          exchange: asset.exchange,
          asset_type: asset.asset_type,
          price: parseFloat(stats.current_price),
          change24h: parseFloat(stats.change_24h || 0),
          changePercent24h: parseFloat(stats.change_percent_24h || 0),
          high24h: parseFloat(stats.high_24h || 0),
          low24h: parseFloat(stats.low_24h || 0),
          volume24h: parseFloat(stats.volume_24h || 0),
          timestamp: stats.ts
        });
      } catch (err) {
        // Skip this symbol
        continue;
      }
    }
    
    // Sort based on type
    if (type === 'gainers') {
      results.sort((a, b) => b.changePercent24h - a.changePercent24h);
    } else if (type === 'losers') {
      results.sort((a, b) => a.changePercent24h - b.changePercent24h);
    } else if (type === 'active') {
      results.sort((a, b) => b.volume24h - a.volume24h);
    }
    
    // Take top N
    const topResults = results.slice(0, limit);
    
    const response = {
      type,
      asset_type: assetType || 'all',
      count: topResults.length,
      data: topResults
    };
    
    // Cache for 1 minute
    await redis.setex(cacheKey, 60, JSON.stringify(response));
    
    res.json({
      ...response,
      source: 'db'
    });
    
  } catch (err) {
    console.error('getMarketMovers error:', err);
    res.status(500).json({ error: 'failed', message: err.message });
  }
};

/**
 * GET /api/v1/market/stats
 * Get overall market statistics
 */
exports.getMarketStats = async (req, res) => {
  try {
    const cacheKey = 'market:stats';
    const cached = await redis.get(cacheKey);
    
    if (cached) {
      return res.json({
        ...JSON.parse(cached),
        source: 'cache'
      });
    }
    
    // Count assets by type
    const countQuery = `
      SELECT 
        asset_type,
        COUNT(*) as count
      FROM assets
      WHERE status = 'OK'
      GROUP BY asset_type
    `;
    
    const { rows: counts } = await pool.query(countQuery);
    
    // Get total market cap (crypto only, from metadata)
    const marketCapQuery = `
      SELECT 
        SUM((metadata->>'market_cap')::BIGINT) as total_market_cap
      FROM assets
      WHERE asset_type = 'crypto' 
      AND status = 'OK'
      AND metadata->>'market_cap' IS NOT NULL
    `;
    
    const { rows: mcRows } = await pool.query(marketCapQuery);
    
    const stats = {
      assets_by_type: counts,
      total_assets: counts.reduce((sum, c) => sum + parseInt(c.count), 0),
      total_market_cap: mcRows[0]?.total_market_cap || 0,
      timestamp: new Date().toISOString()
    };
    
    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, JSON.stringify(stats));
    
    res.json({
      ...stats,
      source: 'db'
    });
    
  } catch (err) {
    console.error('getMarketStats error:', err);
    res.status(500).json({ error: 'failed', message: err.message });
  }
};

/**
 * GET /api/v1/market/vn-gainers?limit=10
 * Get top gainers for Vietnamese stocks (symbols ending with .VN)
 */
exports.getVNGainers = async (req, res) => {
  const limit = parseInt(req.query.limit || '10', 10);
  
  if (limit > 100) {
    return res.status(400).json({ error: 'max limit is 100' });
  }
  
  try {
    // Try cache first
    const cacheKey = `vn:gainers:${limit}`;
    const cached = await redis.get(cacheKey);
    
    if (cached) {
      return res.json({
        ...JSON.parse(cached),
        source: 'cache'
      });
    }
    
    // Get Vietnamese stocks (ending with .VN)
    const assetsQuery = `
      SELECT a.id, a.symbol, a.name, a.exchange, a.asset_type
      FROM assets a
      WHERE a.status = 'OK'
      AND a.symbol LIKE '%.VN'
      ORDER BY a.id
      LIMIT 200
    `;
    
    const { rows: assets } = await pool.query(assetsQuery);
    
    if (assets.length === 0) {
      return res.json({ type: 'vn-gainers', data: [] });
    }
    
    // Calculate stats for each
    const results = [];
    
    for (const asset of assets) {
      try {
        const stats = await calculate24hStats(asset.symbol);
        
        if (!stats || !stats.current_price) continue;
        
        results.push({
          symbol: asset.symbol,
          name: asset.name,
          exchange: asset.exchange,
          asset_type: asset.asset_type,
          price: parseFloat(stats.current_price),
          change24h: parseFloat(stats.change_24h || 0),
          changePercent24h: parseFloat(stats.change_percent_24h || 0),
          high24h: parseFloat(stats.high_24h || 0),
          low24h: parseFloat(stats.low_24h || 0),
          volume24h: parseFloat(stats.volume_24h || 0),
          timestamp: stats.ts
        });
      } catch (err) {
        continue;
      }
    }
    
    // Sort by highest changePercent24h
    results.sort((a, b) => b.changePercent24h - a.changePercent24h);
    
    // Take top N
    const topResults = results.slice(0, limit);
    
    const response = {
      type: 'vn-gainers',
      count: topResults.length,
      data: topResults
    };
    
    // Cache for 1 minute
    await redis.setex(cacheKey, 60, JSON.stringify(response));
    
    res.json({
      ...response,
      source: 'db'
    });
    
  } catch (err) {
    console.error('getVNGainers error:', err);
    res.status(500).json({ error: 'failed', message: err.message });
  }
};

/**
 * GET /api/v1/market/vn-losers?limit=10
 * Get top losers for Vietnamese stocks (symbols ending with .VN)
 */
exports.getVNLosers = async (req, res) => {
  const limit = parseInt(req.query.limit || '10', 10);
  
  if (limit > 100) {
    return res.status(400).json({ error: 'max limit is 100' });
  }
  
  try {
    // Try cache first
    const cacheKey = `vn:losers:${limit}`;
    const cached = await redis.get(cacheKey);
    
    if (cached) {
      return res.json({
        ...JSON.parse(cached),
        source: 'cache'
      });
    }
    
    // Get Vietnamese stocks (ending with .VN)
    const assetsQuery = `
      SELECT a.id, a.symbol, a.name, a.exchange, a.asset_type
      FROM assets a
      WHERE a.status = 'OK'
      AND a.symbol LIKE '%.VN'
      ORDER BY a.id
      LIMIT 200
    `;
    
    const { rows: assets } = await pool.query(assetsQuery);
    
    if (assets.length === 0) {
      return res.json({ type: 'vn-losers', data: [] });
    }
    
    // Calculate stats for each
    const results = [];
    
    for (const asset of assets) {
      try {
        const stats = await calculate24hStats(asset.symbol);
        
        if (!stats || !stats.current_price) continue;
        
        results.push({
          symbol: asset.symbol,
          name: asset.name,
          exchange: asset.exchange,
          asset_type: asset.asset_type,
          price: parseFloat(stats.current_price),
          change24h: parseFloat(stats.change_24h || 0),
          changePercent24h: parseFloat(stats.change_percent_24h || 0),
          high24h: parseFloat(stats.high_24h || 0),
          low24h: parseFloat(stats.low_24h || 0),
          volume24h: parseFloat(stats.volume_24h || 0),
          timestamp: stats.ts
        });
      } catch (err) {
        continue;
      }
    }
    
    // Sort by lowest changePercent24h
    results.sort((a, b) => a.changePercent24h - b.changePercent24h);
    
    // Take top N
    const topResults = results.slice(0, limit);
    
    const response = {
      type: 'vn-losers',
      count: topResults.length,
      data: topResults
    };
    
    // Cache for 1 minute
    await redis.setex(cacheKey, 60, JSON.stringify(response));
    
    res.json({
      ...response,
      source: 'db'
    });
    
  } catch (err) {
    console.error('getVNLosers error:', err);
    res.status(500).json({ error: 'failed', message: err.message });
  }
};

/**
 * GET /api/v1/market/ticker-detail?symbol=BTCUSDT
 * Get detailed ticker information with historical performance
 */
exports.getTickerDetail = async (req, res) => {
  const symbol = (req.query.symbol || '').toUpperCase();
  
  if (!symbol) {
    return res.status(400).json({ error: 'symbol required' });
  }
  
  try {
    // Try cache first
    const cacheKey = `ticker:detail:${symbol}`;
    const cached = await redis.get(cacheKey);
    
    if (cached) {
      return res.json({
        ...JSON.parse(cached),
        source: 'cache'
      });
    }
    
    // Get asset info
    const assetQuery = await pool.query(
      'SELECT id, symbol, name, exchange, asset_type FROM assets WHERE symbol = $1',
      [symbol]
    );
    
    if (assetQuery.rows.length === 0) {
      return res.status(404).json({ error: 'symbol not found' });
    }
    
    const asset = assetQuery.rows[0];
    const assetId = asset.id;
    
    // Get latest OHLCV data
    const latestQuery = `
      SELECT open, high, low, close, volume, ts
      FROM price_ohlcv
      WHERE asset_id = $1
      AND ts >= NOW() - INTERVAL '30 days'
      ORDER BY ts DESC
      LIMIT 1
    `;
    
    const { rows: latestRows } = await pool.query(latestQuery, [assetId]);
    
    if (latestRows.length === 0) {
      return res.status(404).json({ error: 'no price data' });
    }
    
    const latest = latestRows[0];
    
    // Get previous close
    const prevCloseQuery = `
      SELECT close
      FROM price_ohlcv
      WHERE asset_id = $1
      AND ts >= NOW() - INTERVAL '30 days'
      ORDER BY ts DESC
      LIMIT 1 OFFSET 1
    `;
    
    const { rows: prevRows } = await pool.query(prevCloseQuery, [assetId]);
    const prevClose = prevRows[0]?.close || latest.close;
    
    // Get 52-week high and low
    const fiftyTwoWeekQuery = `
      SELECT 
        MAX(high) as week_52_high,
        MIN(low) as week_52_low
      FROM price_ohlcv
      WHERE asset_id = $1
      AND ts >= NOW() - INTERVAL '365 days'
    `;
    
    const { rows: yearRows } = await pool.query(fiftyTwoWeekQuery, [assetId]);
    const yearData = yearRows[0] || {};
    
    // Calculate profit for different periods (1M, 3M, 6M, 1Y)
    const profitQuery = `
      SELECT 
        (SELECT close FROM price_ohlcv 
         WHERE asset_id = $1 AND ts >= NOW() - INTERVAL '30 days' 
         ORDER BY ts ASC LIMIT 1) as price_1m_ago,
        (SELECT close FROM price_ohlcv 
         WHERE asset_id = $1 AND ts >= NOW() - INTERVAL '90 days' 
         ORDER BY ts ASC LIMIT 1) as price_3m_ago,
        (SELECT close FROM price_ohlcv 
         WHERE asset_id = $1 AND ts >= NOW() - INTERVAL '180 days' 
         ORDER BY ts ASC LIMIT 1) as price_6m_ago,
        (SELECT close FROM price_ohlcv 
         WHERE asset_id = $1 AND ts >= NOW() - INTERVAL '365 days' 
         ORDER BY ts ASC LIMIT 1) as price_1y_ago
    `;
    
    const { rows: profitRows } = await pool.query(profitQuery, [assetId]);
    const profitData = profitRows[0] || {};
    
    const currentPrice = parseFloat(latest.close);
    
    const profit = {
      '1M': profitData.price_1m_ago 
        ? parseFloat((((currentPrice - profitData.price_1m_ago) / profitData.price_1m_ago) * 100).toFixed(2))
        : 0,
      '3M': profitData.price_3m_ago 
        ? parseFloat((((currentPrice - profitData.price_3m_ago) / profitData.price_3m_ago) * 100).toFixed(2))
        : 0,
      '6M': profitData.price_6m_ago 
        ? parseFloat((((currentPrice - profitData.price_6m_ago) / profitData.price_6m_ago) * 100).toFixed(2))
        : 0,
      '1Y': profitData.price_1y_ago 
        ? parseFloat((((currentPrice - profitData.price_1y_ago) / profitData.price_1y_ago) * 100).toFixed(2))
        : 0
    };
    
    // Convert prices to VND
    const exchangeRate = await getExchangeRate();
    const openConverted = await convertPrice(latest.open, asset.exchange, exchangeRate);
    const highConverted = await convertPrice(latest.high, asset.exchange, exchangeRate);
    const lowConverted = await convertPrice(latest.low, asset.exchange, exchangeRate);
    const closeConverted = await convertPrice(currentPrice, asset.exchange, exchangeRate);
    const prevCloseConverted = await convertPrice(prevClose, asset.exchange, exchangeRate);
    const fiftyTwoWeekHighConverted = await convertPrice(yearData.week_52_high || currentPrice, asset.exchange, exchangeRate);
    const fiftyTwoWeekLowConverted = await convertPrice(yearData.week_52_low || currentPrice, asset.exchange, exchangeRate);
    
    const tickerDetail = {
      symbol: asset.symbol,
      name: asset.name,
      exchange: asset.exchange,
      asset_type: asset.asset_type,
      open: openConverted.price,
      high: highConverted.price,
      low: lowConverted.price,
      close: closeConverted.price,
      prevClose: prevCloseConverted.price,
      volume: parseFloat(latest.volume),
      fiftyTwoWeekHigh: fiftyTwoWeekHighConverted.price,
      fiftyTwoWeekLow: fiftyTwoWeekLowConverted.price,
      profit,
      currency: 'VND',
      timestamp: latest.ts
    };
    
    // Cache for 1 minute
    await redis.setex(cacheKey, 60, JSON.stringify(tickerDetail));
    
    res.json({
      ...tickerDetail,
      source: 'db'
    });
    
  } catch (err) {
    console.error('getTickerDetail error:', err);
    res.status(500).json({ error: 'failed', message: err.message });
  }
};

/**
 * Helper: Check if market is open
 */
function isMarketOpen(exchange) {
  if (!exchange) return false;
  const ex = exchange.toUpperCase();
  
  if (ex === 'BINANCE') return true;
  
  const now = new Date();
  
  if (ex === 'HOSE') {
    // Vietnam Time (UTC+7)
    const options = { timeZone: 'Asia/Ho_Chi_Minh', hour12: false, weekday: 'short', hour: 'numeric', minute: 'numeric' };
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(now);
    const partMap = {};
    parts.forEach(p => partMap[p.type] = p.value);
    
    if (partMap.weekday === 'Sat' || partMap.weekday === 'Sun') return false;
    
    const h = parseInt(partMap.hour, 10);
    const m = parseInt(partMap.minute, 10);
    const time = h * 100 + m;
    
    // 09:00 - 11:30
    if (time >= 900 && time <= 1130) return true;
    // 13:00 - 14:45
    if (time >= 1300 && time <= 1445) return true;
    
    return false;
  }
  
  // Default: US Market (NYSE/NASDAQ)
  // Eastern Time
  const options = { timeZone: 'America/New_York', hour12: false, weekday: 'short', hour: 'numeric', minute: 'numeric' };
  const formatter = new Intl.DateTimeFormat('en-US', options);
  const parts = formatter.formatToParts(now);
  const partMap = {};
  parts.forEach(p => partMap[p.type] = p.value);
  
  if (partMap.weekday === 'Sat' || partMap.weekday === 'Sun') return false;
  
  const h = parseInt(partMap.hour, 10);
  const m = parseInt(partMap.minute, 10);
  const time = h * 100 + m;
  
  // 09:30 - 16:00
  return time >= 930 && time < 1600;
}

/**
 * Helper: Format date to "HH:mm d Thg M UTC+07:00"
 */
function formatLastUpdate(date) {
  if (!date) return '';
  
  // Convert to UTC+7
  const vnTime = new Date(new Date(date).getTime() + 7 * 60 * 60 * 1000);
  
  const h = vnTime.getUTCHours().toString().padStart(2, '0');
  const m = vnTime.getUTCMinutes().toString().padStart(2, '0');
  const d = vnTime.getUTCDate();
  const mo = vnTime.getUTCMonth() + 1;
  
  return `${h}:${m} ${d} Thg ${mo} UTC+07:00`;
}

/**
 * GET /api/v1/market/summary?symbol=^VNI
 * Get ticker summary with specific formatting
 */
exports.getTickerSummary = async (req, res) => {
  const symbol = (req.query.symbol || '').toUpperCase();
  
  if (!symbol) {
    return res.status(400).json({ error: 'symbol required' });
  }
  
  try {
    // Get asset info
    const assetQuery = await pool.query(
      'SELECT id, symbol, name, exchange, asset_type FROM assets WHERE symbol = $1',
      [symbol]
    );
    
    if (assetQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Asset not found' });
    }
    
    const asset = assetQuery.rows[0];
    const exchange = asset.exchange ? asset.exchange.toUpperCase() : 'US';
    
    // Calculate stats
    const stats = await calculate24hStats(symbol);
    
    const priceFormatter = new Intl.NumberFormat('vi-VN', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
    
    if (!stats) {
      return res.json({
        name: asset.name,
        symbol: asset.symbol,
        priceNow: "0,00",
        changeNow: 0,
        percentChangeNow: 0,
        isMarketOpen: isMarketOpen(exchange),
        lastUpdate: formatLastUpdate(new Date()),
        currency: 'VND'
      });
    }
    
    // Convert prices to VND
    const exchangeRate = await getExchangeRate();
    const priceConverted = await convertPrice(stats.current_price, asset.exchange, exchangeRate);
    const changeConverted = await convertPrice(stats.change_24h, asset.exchange, exchangeRate);
    
    const response = {
      name: asset.name,
      symbol: asset.symbol,
      priceNow: priceFormatter.format(priceConverted.price),
      changeNow: parseFloat(changeConverted.price.toFixed(2)),
      percentChangeNow: parseFloat(stats.change_percent_24h.toFixed(2)),
      isMarketOpen: isMarketOpen(exchange),
      lastUpdate: formatLastUpdate(stats.ts),
      currency: 'VND'
    };
    
    res.json(response);
    
  } catch (err) {
    console.error('getTickerSummary error:', err);
    res.status(500).json({ error: 'failed', message: err.message });
  }
};
