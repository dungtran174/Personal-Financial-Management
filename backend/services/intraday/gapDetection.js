/**
 * Smart Gap Detection for Intraday Data
 * Automatically detects gaps and fetches missing data
 */

const pool = require('../../config/pg');

/**
 * Get last tick timestamp for each asset
 * @returns {Map<assetId, {symbol, lastTs, assetType}>}
 */
async function getLastTickTimestamps() {
  const query = `
    SELECT 
      a.id as asset_id,
      a.symbol,
      a.asset_type,
      MAX(pt.ts) as last_ts
    FROM assets a
    LEFT JOIN price_ticks pt ON a.id = pt.asset_id
    WHERE a.status = 'OK'
    GROUP BY a.id, a.symbol, a.asset_type
    ORDER BY a.id
  `;

  const { rows } = await pool.query(query);
  
  const assetMap = new Map();
  
  for (const row of rows) {
    assetMap.set(row.asset_id, {
      symbol: row.symbol,
      lastTs: row.last_ts ? new Date(row.last_ts) : null,
      assetType: row.asset_type
    });
  }

  return assetMap;
}

/**
 * Calculate number of candles needed based on gap
 * @param {Date|null} lastTs - last tick timestamp
 * @param {string} interval - 1m, 5m, 15m, 1h
 * @param {number} maxLimit - max candles allowed by API (1000 for Binance, unlimited for Yahoo)
 * @returns {number|string} - number of candles for Binance, or range string for Yahoo
 */
function calculateCandlesNeeded(lastTs, interval, maxLimit = 1000) {
  const now = new Date();
  
  // If no data exists, fetch max allowed
  if (!lastTs) {
    console.log(`   ℹ️ No previous data - will fetch max ${maxLimit} candles`);
    return maxLimit;
  }

  // Calculate gap in milliseconds
  const gapMs = now - lastTs;
  const gapHours = gapMs / (1000 * 60 * 60);
  const gapMinutes = gapMs / (1000 * 60);

  // Map interval to minutes
  const intervalMap = {
    '1m': 1,
    '5m': 5,
    '15m': 15,
    '1h': 60
  };

  const intervalMinutes = intervalMap[interval] || 1;
  
  // Calculate candles needed
  let candlesNeeded = Math.ceil(gapMinutes / intervalMinutes);
  
  // Add 10% safety margin
  candlesNeeded = Math.ceil(candlesNeeded * 1.1);
  
  // Cap at max limit
  if (candlesNeeded > maxLimit) {
    console.log(`   ⚠️ Gap is ${gapHours.toFixed(1)}h (${candlesNeeded} candles), capped at ${maxLimit}`);
    return maxLimit;
  }

  console.log(`   ℹ️ Gap detected: ${gapHours.toFixed(1)}h → need ${candlesNeeded} candles`);
  return candlesNeeded;
}

/**
 * Calculate Yahoo range string based on gap
 * @param {Date|null} lastTs - last tick timestamp
 * @returns {string} - range string (1d, 5d, 1mo, 3mo, 6mo, 1y)
 */
function calculateYahooRange(lastTs) {
  if (!lastTs) {
    return '1mo'; // Default 1 month for new assets
  }

  const now = new Date();
  const gapMs = now - lastTs;
  const gapDays = gapMs / (1000 * 60 * 60 * 24);

  if (gapDays < 1) return '1d';
  if (gapDays < 5) return '5d';
  if (gapDays < 30) return '1mo';
  if (gapDays < 90) return '3mo';
  if (gapDays < 180) return '6mo';
  
  console.log(`   ⚠️ Gap is ${gapDays.toFixed(0)} days, using max range (1y)`);
  return '1y';
}

/**
 * Analyze gaps for all assets
 * @returns {Object} - gap analysis summary
 */
async function analyzeGaps() {
  console.log('\n🔍 Analyzing data gaps...\n');
  
  const assetMap = await getLastTickTimestamps();
  
  const analysis = {
    crypto: [],
    stock: [],
    forex: [],
    stats: {
      totalAssets: assetMap.size,
      noData: 0,
      recentData: 0, // < 1 hour gap
      needSync: 0    // > 1 hour gap
    }
  };

  const now = new Date();
  
  for (const [assetId, info] of assetMap.entries()) {
    const gapInfo = {
      assetId,
      symbol: info.symbol,
      lastTs: info.lastTs,
      gapHours: info.lastTs ? (now - info.lastTs) / (1000 * 60 * 60) : null
    };

    // Categorize by asset type
    if (info.assetType === 'crypto') {
      analysis.crypto.push(gapInfo);
    } else if (info.assetType === 'stock') {
      analysis.stock.push(gapInfo);
    } else if (info.assetType === 'forex') {
      analysis.forex.push(gapInfo);
    }

    // Stats
    if (!info.lastTs) {
      analysis.stats.noData++;
    } else {
      const gapHours = (now - info.lastTs) / (1000 * 60 * 60);
      if (gapHours < 1) {
        analysis.stats.recentData++;
      } else {
        analysis.stats.needSync++;
      }
    }
  }

  // Print summary
  console.log('📊 Gap Analysis Summary:');
  console.log(`   Total assets: ${analysis.stats.totalAssets}`);
  console.log(`   No data: ${analysis.stats.noData}`);
  console.log(`   Recent data (< 1h): ${analysis.stats.recentData}`);
  console.log(`   Need sync (> 1h): ${analysis.stats.needSync}`);
  console.log(`   Crypto: ${analysis.crypto.length}, Stock: ${analysis.stock.length}, Forex: ${analysis.forex.length}`);
  console.log('');

  return analysis;
}

/**
 * Get smart sync parameters for an asset
 * @param {number} assetId
 * @param {string} interval - for crypto: 1m, 5m, etc.
 * @returns {Object|null} - {candlesNeeded, range (for Yahoo)}
 */
async function getSmartSyncParams(assetId, interval = '1m') {
  const assetMap = await getLastTickTimestamps();
  const info = assetMap.get(assetId);
  
  if (!info) return null;

  if (info.assetType === 'crypto') {
    const candlesNeeded = calculateCandlesNeeded(info.lastTs, interval, 1000);
    return { candlesNeeded, assetType: 'crypto' };
  } else {
    const range = calculateYahooRange(info.lastTs);
    return { range, assetType: info.assetType };
  }
}

/**
 * Smart sync for crypto assets with gap detection
 * @param {string} interval - 1m, 5m, 15m, 1h
 * @returns {number} - total ticks inserted
 */
async function smartSyncCrypto(interval = '1m') {
  const { syncCryptoIntraday } = require('./binanceIntraday');
  
  console.log(`\n🧠 Smart sync crypto (${interval})...`);
  
  const assetMap = await getLastTickTimestamps();
  
  const cryptoAssets = Array.from(assetMap.entries())
    .filter(([_, info]) => info.assetType === 'crypto');

  if (cryptoAssets.length === 0) {
    console.log('⚠️ No crypto assets found');
    return 0;
  }

  console.log(`📦 Found ${cryptoAssets.length} crypto assets\n`);

  let totalInserted = 0;
  
  for (const [assetId, info] of cryptoAssets) {
    try {
      // Calculate smart limit based on gap
      const candlesNeeded = calculateCandlesNeeded(info.lastTs, interval, 1000);
      
      console.log(`📊 ${info.symbol}:`);
      
      const inserted = await syncCryptoIntraday(assetId, info.symbol, interval, candlesNeeded);
      totalInserted += inserted;
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (err) {
      console.error(`❌ Error syncing ${info.symbol}:`, err.message);
    }
  }

  console.log(`\n✅ Smart crypto sync complete: ${totalInserted} ticks inserted`);
  return totalInserted;
}

/**
 * Smart sync for stock/forex assets with gap detection
 * @param {string} interval - 5m, 15m, 1h
 * @param {number} limit - max number of assets to sync
 * @returns {number} - total ticks inserted
 */
async function smartSyncStocks(interval = '5m', limit = 100) {
  const { syncStockIntraday } = require('./yahooIntraday');
  
  console.log(`\n🧠 Smart sync stocks/forex (${interval})...`);
  
  const assetMap = await getLastTickTimestamps();
  
  const stockAssets = Array.from(assetMap.entries())
    .filter(([_, info]) => info.assetType === 'stock' || info.assetType === 'forex')
    .slice(0, limit);

  if (stockAssets.length === 0) {
    console.log('⚠️ No stock/forex assets found');
    return 0;
  }

  console.log(`📦 Found ${stockAssets.length} stock/forex assets\n`);

  let totalInserted = 0;
  
  for (const [assetId, info] of stockAssets) {
    try {
      // Calculate smart range based on gap
      const range = calculateYahooRange(info.lastTs);
      
      console.log(`📊 ${info.symbol}:`);
      
      const inserted = await syncStockIntraday(assetId, info.symbol, interval, range);
      totalInserted += inserted;
      
      // Rate limiting (Yahoo is more strict)
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (err) {
      console.error(`❌ Error syncing ${info.symbol}:`, err.message);
    }
  }

  console.log(`\n✅ Smart stock sync complete: ${totalInserted} ticks inserted`);
  return totalInserted;
}

/**
 * Main function: Detect gaps and fill missing data
 * This is the primary function to use for smart sync
 */
async function detectAndFillGaps() {
  console.log('\n🚀 Smart Gap Detection & Sync Started\n');
  console.log('='.repeat(60));
  
  try {
    // 1. Analyze gaps first
    const analysis = await analyzeGaps();
    
    // 2. Smart sync crypto (1m interval)
    const cryptoInserted = await smartSyncCrypto('1m');
    
    // 3. Smart sync stocks/forex (5m interval)
    const stockInserted = await smartSyncStocks('5m', 50);
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 Smart Sync Summary:');
    console.log(`   Crypto ticks: ${cryptoInserted}`);
    console.log(`   Stock ticks: ${stockInserted}`);
    console.log(`   Total: ${cryptoInserted + stockInserted}`);
    console.log('='.repeat(60) + '\n');
    
    return {
      analysis,
      cryptoInserted,
      stockInserted,
      total: cryptoInserted + stockInserted
    };
  } catch (err) {
    console.error('❌ Smart sync failed:', err.message);
    throw err;
  }
}

module.exports = {
  getLastTickTimestamps,
  calculateCandlesNeeded,
  calculateYahooRange,
  analyzeGaps,
  getSmartSyncParams,
  smartSyncCrypto,
  smartSyncStocks,
  detectAndFillGaps
};
