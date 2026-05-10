// backend/controllers/assetsController.js
const pool = require('../config/pg');
const redis = require('../config/redis');

/**
 * GET /api/v1/assets?q=BTC&limit=20&asset_type=crypto
 * Search assets for autocomplete
 */
exports.searchAssets = async (req, res) => {
  const q = (req.query.q || '').trim().toUpperCase();
  const limit = parseInt(req.query.limit || '20', 10);
  const assetType = req.query.asset_type; // optional filter
  
  try {
    // If no query, return popular assets
    if (!q) {
      let query = 'SELECT id, symbol, name, exchange, asset_type FROM assets WHERE status = $1';
      let params = ['OK'];
      
      if (assetType) {
        query += ' AND asset_type = $2';
        params.push(assetType);
      }
      
      query += ' ORDER BY id LIMIT $' + (params.length + 1);
      params.push(limit);
      
      const { rows } = await pool.query(query, params);
      return res.json({
        count: rows.length,
        results: rows
      });
    }
    
    // Search by symbol prefix or name contains
    let query = `
      SELECT 
        id, 
        symbol, 
        name, 
        exchange, 
        asset_type,
        CASE 
          WHEN symbol = $1 THEN 1
          WHEN symbol LIKE $2 THEN 2
          WHEN name ILIKE $2 THEN 3
          ELSE 4
        END as rank
      FROM assets
      WHERE status = 'OK'
      AND (symbol ILIKE $2 OR name ILIKE $3)
    `;
    
    let params = [q, `${q}%`, `%${q}%`];
    
    if (assetType) {
      query += ' AND asset_type = $4';
      params.push(assetType);
    }
    
    query += ' ORDER BY rank, symbol LIMIT $' + (params.length + 1);
    params.push(limit);
    
    const { rows } = await pool.query(query, params);
    
    res.json({
      query: q,
      count: rows.length,
      results: rows.map(r => ({
        id: r.id,
        symbol: r.symbol,
        name: r.name,
        exchange: r.exchange,
        asset_type: r.asset_type
      }))
    });
    
  } catch (err) {
    console.error('searchAssets error:', err);
    res.status(500).json({ error: 'search failed', message: err.message });
  }
};

/**
 * GET /api/v1/assets/:symbol
 * Get full asset metadata
 */
exports.getAssetBySymbol = async (req, res) => {
  const symbol = (req.params.symbol || '').toUpperCase();
  
  if (!symbol) {
    return res.status(400).json({ error: 'symbol required' });
  }
  
  try {
    // Try cache first
    const cacheKey = `asset:${symbol}`;
    const cached = await redis.get(cacheKey);
    
    if (cached) {
      return res.json({
        ...JSON.parse(cached),
        source: 'cache'
      });
    }
    
    const { rows } = await pool.query(
      'SELECT * FROM assets WHERE symbol = $1 LIMIT 1', 
      [symbol]
    );
    
    if (!rows[0]) {
      return res.status(404).json({ error: 'asset not found' });
    }
    
    const asset = rows[0];
    
    // Parse metadata
    const metadata = asset.metadata || {};
    
    // Build response
    const response = {
      id: asset.id,
      symbol: asset.symbol,
      name: asset.name,
      fullName: `${asset.name} / ${asset.currency || 'USD'}`,
      exchange: asset.exchange,
      asset_type: asset.asset_type,
      currency: asset.currency,
      sector: asset.sector,
      status: asset.status,
      
      // From metadata
      logo: metadata.logo || null,
      description: metadata.description || null,
      website: metadata.website || null,
      marketCap: metadata.market_cap || null,
      
      // Trading info
      precision: metadata.price_precision || 2,
      minTradeAmount: metadata.min_trade_amount || 0.0001,
      tradingHours: asset.asset_type === 'crypto' ? '24/7' : metadata.trading_hours || 'Market hours',
      
      created_at: asset.created_at,
      last_fetched: asset.last_fetched
    };
    
    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, JSON.stringify(response));
    
    res.json({
      ...response,
      source: 'db'
    });
    
  } catch (err) {
    console.error('getAssetBySymbol error:', err);
    res.status(500).json({ error: 'failed', message: err.message });
  }
};

/**
 * GET /api/v1/assets/:symbol/similar
 * Get similar assets (same exchange, same type)
 */
exports.getSimilarAssets = async (req, res) => {
  const symbol = (req.params.symbol || '').toUpperCase();
  const limit = parseInt(req.query.limit || '10', 10);
  
  try {
    // Get base asset
    const baseQuery = await pool.query(
      'SELECT exchange, asset_type FROM assets WHERE symbol = $1 AND status = $2',
      [symbol, 'OK']
    );
    
    if (baseQuery.rows.length === 0) {
      return res.status(404).json({ error: 'asset not found' });
    }
    
    const { exchange, asset_type } = baseQuery.rows[0];
    
    // Get similar assets
    const { rows } = await pool.query(
      `SELECT id, symbol, name, exchange, asset_type
       FROM assets
       WHERE exchange = $1 
       AND asset_type = $2 
       AND symbol != $3
       AND status = 'OK'
       ORDER BY id
       LIMIT $4`,
      [exchange, asset_type, symbol, limit]
    );
    
    res.json({
      symbol,
      count: rows.length,
      similar: rows
    });
    
  } catch (err) {
    console.error('getSimilarAssets error:', err);
    res.status(500).json({ error: 'failed', message: err.message });
  }
};
