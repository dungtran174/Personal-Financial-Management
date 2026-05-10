// backend/services/calculatePriceChange.js
// Calculate price changes for different asset types with specific formulas

const pool = require('../config/pg');
const redis = require('../config/redis');

/**
 * Get current price for an asset (from Redis cache or DB)
 * @param {number} assetId - Asset ID from database
 * @param {string} symbol - Asset symbol (e.g., BTCUSDT, AAPL)
 * @returns {number|null} Current price or null if not found
 */
async function getCurrentPrice(assetId, symbol) {
  try {
    // Try Redis cache first (populated by Binance stream)
    const cached = await redis.get(`price:latest:${symbol}`);
    if (cached) {
      return parseFloat(cached);
    }
    
    // Fallback to DB - try price_ticks first (most recent)
    const { rows } = await pool.query(`
      SELECT price FROM price_ticks
      WHERE asset_id = $1
      AND ts >= NOW() - INTERVAL '7 days'
      ORDER BY ts DESC LIMIT 1
    `, [assetId]);
    
    if (rows[0]) {
      return parseFloat(rows[0].price);
    }
    
    // Fallback to daily OHLCV (if no intraday data)
    const { rows: ohlcvRows } = await pool.query(`
      SELECT close FROM price_ohlcv
      WHERE asset_id = $1
      AND ts >= NOW() - INTERVAL '30 days'
      ORDER BY ts DESC LIMIT 1
    `, [assetId]);
    
    return ohlcvRows[0] ? parseFloat(ohlcvRows[0].close) : null;
  } catch (err) {
    console.error(`Error getting current price for ${symbol}:`, err.message);
    return null;
  }
}

/**
 * Calculate % change for stock/index (vs previous close)
 * Formula: (Current - Previous Close) / Previous Close × 100%
 * 
 * @param {number} assetId - Asset ID
 * @param {number} currentPrice - Current price (can be null for auto-detection)
 * @returns {Object} {currentPrice, changePercent, previousPrice}
 */
async function calculateStockChange(assetId, currentPrice) {
  try {
    // Get last 2 days of data to compare
    const { rows } = await pool.query(`
      SELECT close FROM price_ohlcv
      WHERE asset_id = $1
      AND ts >= NOW() - INTERVAL '30 days'
      ORDER BY ts DESC LIMIT 2
    `, [assetId]);
    
    if (rows.length === 0) {
      return { currentPrice: currentPrice || null, changePercent: 0, previousPrice: currentPrice || null };
    }
    
    // If we only have 1 day, no change to calculate
    if (rows.length === 1) {
      const latestClose = parseFloat(rows[0].close);
      return { 
        currentPrice: latestClose, 
        changePercent: 0, 
        previousPrice: latestClose 
      };
    }
    
    // If we have 2 days, compare them (latest vs previous)
    const latestClose = parseFloat(rows[0].close);
    const previousClose = parseFloat(rows[1].close);
    const changePercent = ((latestClose - previousClose) / previousClose) * 100;
    
    return { 
      currentPrice: latestClose, 
      changePercent, 
      previousPrice: previousClose 
    };
  } catch (err) {
    console.error(`Error calculating stock change for asset ${assetId}:`, err.message);
    return { currentPrice: currentPrice || null, changePercent: 0, previousPrice: currentPrice || null };
  }
}

/**
 * Calculate % change for forex (vs today's open)
 * Formula: (Current - Today's Open) / Today's Open × 100%
 * 
 * @param {number} assetId - Asset ID
 * @param {number} currentPrice - Current price
 * @returns {Object} {changePercent, previousPrice}
 */
async function calculateForexChange(assetId, currentPrice) {
  try {
    // Try to get today's open
    const { rows } = await pool.query(`
      SELECT open FROM price_ohlcv
      WHERE asset_id = $1
      AND ts >= NOW() - INTERVAL '7 days'
      AND DATE(ts) = DATE(NOW())
      ORDER BY ts DESC LIMIT 1
    `, [assetId]);
    
    // If no data today (weekend/holiday), get most recent open
    if (!rows[0]) {
      const { rows: fallbackRows } = await pool.query(`
        SELECT open FROM price_ohlcv
        WHERE asset_id = $1
        AND ts >= NOW() - INTERVAL '30 days'
        ORDER BY ts DESC LIMIT 1
      `, [assetId]);
      
      if (!fallbackRows[0]) {
        return { changePercent: 0, previousPrice: currentPrice };
      }
      
      const todayOpen = parseFloat(fallbackRows[0].open);
      const changePercent = ((currentPrice - todayOpen) / todayOpen) * 100;
      return { changePercent, previousPrice: todayOpen };
    }
    
    const todayOpen = parseFloat(rows[0].open);
    const changePercent = ((currentPrice - todayOpen) / todayOpen) * 100;
    
    return { changePercent, previousPrice: todayOpen };
  } catch (err) {
    console.error(`Error calculating forex change for asset ${assetId}:`, err.message);
    return { changePercent: 0, previousPrice: currentPrice };
  }
}

/**
 * Calculate % change for crypto (vs 24h ago)
 * Formula: (Current - Price 24h ago) / Price 24h ago × 100%
 * 
 * @param {number} assetId - Asset ID
 * @param {number} currentPrice - Current price
 * @returns {Object} {changePercent, previousPrice}
 */
async function calculateCryptoChange(assetId, currentPrice) {
  try {
    // Try to get price from exactly 24h ago from ticks
    const { rows } = await pool.query(`
      SELECT price FROM price_ticks
      WHERE asset_id = $1
      AND ts >= NOW() - INTERVAL '30 days'
      AND ts <= NOW() - INTERVAL '24 hours'
      ORDER BY ts DESC LIMIT 1
    `, [assetId]);
    
    if (!rows[0]) {
      // Fallback: use 1h aggregate if ticks not available
      const { rows: hourlyRows } = await pool.query(`
        SELECT close FROM price_ohlcv_1h
        WHERE asset_id = $1
        AND ts >= NOW() - INTERVAL '30 days'
        AND ts <= NOW() - INTERVAL '24 hours'
        ORDER BY ts DESC LIMIT 1
      `, [assetId]);
      
      if (!hourlyRows[0]) {
        // Last fallback: use daily OHLCV
        const { rows: dailyRows } = await pool.query(`
          SELECT close FROM price_ohlcv
          WHERE asset_id = $1
          AND ts >= NOW() - INTERVAL '30 days'
          ORDER BY ts DESC LIMIT 1 OFFSET 1
        `, [assetId]);
        
        if (!dailyRows[0]) {
          return { changePercent: 0, previousPrice: currentPrice };
        }
        
        const price24hAgo = parseFloat(dailyRows[0].close);
        const changePercent = ((currentPrice - price24hAgo) / price24hAgo) * 100;
        return { changePercent, previousPrice: price24hAgo };
      }
      
      const price24hAgo = parseFloat(hourlyRows[0].close);
      const changePercent = ((currentPrice - price24hAgo) / price24hAgo) * 100;
      return { changePercent, previousPrice: price24hAgo };
    }
    
    const price24hAgo = parseFloat(rows[0].price);
    const changePercent = ((currentPrice - price24hAgo) / price24hAgo) * 100;
    
    return { changePercent, previousPrice: price24hAgo };
  } catch (err) {
    console.error(`Error calculating crypto change for asset ${assetId}:`, err.message);
    return { changePercent: 0, previousPrice: currentPrice };
  }
}

/**
 * Calculate % change for commodity (vs previous settlement/close)
 * Formula: (Current - Previous Settlement) / Previous Settlement × 100%
 * Note: Settlement price = previous close for commodities
 * 
 * @param {number} assetId - Asset ID
 * @param {number} currentPrice - Current price
 * @returns {Object} {changePercent, previousPrice}
 */
async function calculateCommodityChange(assetId, currentPrice) {
  // Same as stock - previous close is settlement price
  return calculateStockChange(assetId, currentPrice);
}

/**
 * Main function: Calculate price change based on asset type
 * @param {number} assetId - Asset ID from database
 * @param {string} symbol - Asset symbol
 * @param {string} assetType - Asset type (stock, index, forex, crypto, commodity)
 * @returns {Object|null} {currentPrice, changePercent, previousPrice, positive} or null
 */
async function calculatePriceChange(assetId, symbol, assetType) {
  try {
    let currentPrice, result;
    
    // For stocks/indexes/commodities: get current price from latest OHLCV close
    // (they don't have real-time ticks like crypto)
    if (assetType === 'stock' || assetType === 'index' || assetType === 'commodity') {
      result = await calculateStockChange(assetId, null);
      if (!result || result.changePercent === 0 && result.previousPrice === null) {
        return null;
      }
      currentPrice = result.currentPrice || result.previousPrice;
    } else {
      // For crypto/forex: get current price from ticks/cache
      currentPrice = await getCurrentPrice(assetId, symbol);
      
      if (!currentPrice) {
        return null; // No price data available
      }
      
      switch (assetType) {
        case 'forex':
          result = await calculateForexChange(assetId, currentPrice);
          break;
          
        case 'crypto':
          result = await calculateCryptoChange(assetId, currentPrice);
          break;
          
        default:
          console.warn(`Unknown asset type: ${assetType}`);
          result = { changePercent: 0, previousPrice: currentPrice };
      }
    }
    
    return {
      currentPrice,
      changePercent: result.changePercent,
      previousPrice: result.previousPrice,
      positive: result.changePercent >= 0
    };
  } catch (err) {
    console.error(`Error calculating price change for ${symbol}:`, err.message);
    return null;
  }
}

module.exports = {
  calculatePriceChange,
  getCurrentPrice,
  calculateStockChange,
  calculateForexChange,
  calculateCryptoChange,
  calculateCommodityChange
};
