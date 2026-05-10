const axios = require('axios');
const redisClient = require('../config/redis');
const pool = require('../config/pg');

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:5001';
const CACHE_TTL = 3600; // 1 hour cache

/**
 * Get prediction for a symbol
 * Flow: Check Redis cache -> If miss, fetch OHLCV -> Call Python API -> Cache result
 */
exports.getPrediction = async (req, res) => {
  try {
    const { symbol } = req.params;
    
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    // Check Redis cache
    const cacheKey = `prediction:${symbol.toUpperCase()}`;
    const cachedData = await redisClient.get(cacheKey);
    
    if (cachedData) {
      console.log(`[Prediction] Cache hit for ${symbol}`);
      return res.json({
        ...JSON.parse(cachedData),
        cached: true
      });
    }

    console.log(`[Prediction] Cache miss for ${symbol}, fetching from Python API...`);

    // Fetch OHLCV data from PostgreSQL
    const ohlcvQuery = `
      SELECT 
        time_bucket('1 day', po.ts) as date,
        first(po.open, po.ts) as open,
        max(po.high) as high,
        min(po.low) as low,
        last(po.close, po.ts) as close,
        sum(po.volume) as volume
      FROM price_ohlcv po
      JOIN assets a ON po.asset_id = a.id
      WHERE a.symbol = $1
        AND po.ts >= NOW() - INTERVAL '90 days'
      GROUP BY date
      ORDER BY date ASC
      LIMIT 60
    `;

    const ohlcvResult = await pool.query(ohlcvQuery, [symbol.toUpperCase()]);
    
    if (ohlcvResult.rows.length < 26) {
      return res.status(400).json({ 
        error: 'Insufficient data',
        message: `Need at least 26 days of data, found ${ohlcvResult.rows.length}` 
      });
    }

    // Format OHLCV data for Python API
    const ohlcvData = ohlcvResult.rows.map(row => ({
      ts: row.date.toISOString(),
      open: parseFloat(row.open),
      high: parseFloat(row.high),
      low: parseFloat(row.low),
      close: parseFloat(row.close),
      volume: parseFloat(row.volume)
    }));

    // Call Python API
    const pythonResponse = await axios.post(
      `${PYTHON_API_URL}/predict`,
      {
        symbol: symbol.toUpperCase(),
        asset_type: 'stock',
        candles: ohlcvData
      },
      { timeout: 60000 } // 60 second timeout
    );

    const predictionData = pythonResponse.data;

    // Cache the result (ioredis uses setex with lowercase)
    await redisClient.setex(cacheKey, CACHE_TTL, JSON.stringify(predictionData));
    
    console.log(`[Prediction] Cached prediction for ${symbol}`);

    res.json({
      ...predictionData,
      cached: false
    });

  } catch (error) {
    console.error('[Prediction] Error:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({ 
        error: 'Prediction service unavailable',
        message: 'Unable to connect to prediction model. Please try again later.'
      });
    }

    if (error.response) {
      return res.status(error.response.status).json({
        error: 'Prediction failed',
        message: error.response.data.error || 'Unknown error from prediction service'
      });
    }

    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
};

/**
 * Clear cache for a specific symbol
 */
exports.clearPredictionCache = async (req, res) => {
  try {
    const { symbol } = req.params;
    const cacheKey = `prediction:${symbol.toUpperCase()}`;
    
    await redisClient.del(cacheKey);
    
    res.json({ 
      message: `Cache cleared for ${symbol}`,
      success: true 
    });
  } catch (error) {
    console.error('[Prediction] Clear cache error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get prediction health status
 */
exports.getHealth = async (req, res) => {
  try {
    const pythonHealth = await axios.get(`${PYTHON_API_URL}/health`, { timeout: 5000 });
    res.json({
      backend: 'ok',
      python_api: pythonHealth.data,
      redis: redisClient.status === 'ready' ? 'connected' : 'disconnected'
    });
  } catch (error) {
    res.status(503).json({
      backend: 'ok',
      python_api: 'unavailable',
      redis: redisClient.status === 'ready' ? 'connected' : 'disconnected',
      error: error.message
    });
  }
};
