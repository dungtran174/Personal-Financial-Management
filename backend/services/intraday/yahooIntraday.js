/**
 * Yahoo Finance Intraday Data Fetcher
 * Fetches 1m, 5m, 15m, 1h candles for stocks/forex
 */

const axios = require('axios');
const pool = require('../../config/pg');

const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

/**
 * Fetch intraday candles from Yahoo Finance
 * @param {string} symbol - Yahoo symbol (e.g., AAPL, EURUSD=X)
 * @param {string} interval - 1m, 5m, 15m, 1h
 * @param {string} range - 1d, 5d, 1mo
 */
async function fetchYahooIntraday(symbol, interval = '1m', range = '1d') {
  try {
    const url = `${YAHOO_BASE}/${symbol}`;
    const { data } = await axios.get(url, {
      params: { interval, range },
      timeout: 10000
    });

    const result = data?.chart?.result?.[0];
    if (!result || !result.timestamp) {
      return [];
    }

    const timestamps = result.timestamp;
    const quote = result.indicators.quote[0];
    
    const ticks = [];
    
    for (let i = 0; i < timestamps.length; i++) {
      // Skip invalid data
      if (!quote.close[i]) continue;
      
      ticks.push({
        ts: new Date(timestamps[i] * 1000),
        price: parseFloat(quote.close[i]),
        volume: parseFloat(quote.volume[i]) || 0,
        open: parseFloat(quote.open[i]),
        high: parseFloat(quote.high[i]),
        low: parseFloat(quote.low[i])
      });
    }

    return ticks;
  } catch (err) {
    console.error(`❌ Yahoo intraday fetch error (${symbol}, ${interval}):`, err.message);
    return [];
  }
}

/**
 * Insert ticks into price_ticks table
 */
async function insertTicksToDb(assetId, ticks) {
  if (!ticks || ticks.length === 0) return 0;

  const values = [];
  const placeholders = [];

  ticks.forEach((tick, i) => {
    const base = i * 4;
    placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
    values.push(assetId, tick.ts, tick.price, tick.volume);
  });

  const sql = `
    INSERT INTO price_ticks (asset_id, ts, price, volume)
    VALUES ${placeholders.join(',')}
    ON CONFLICT (asset_id, ts) DO NOTHING
  `;

  try {
    const result = await pool.query(sql, values);
    return result.rowCount;
  } catch (err) {
    console.error('❌ Insert ticks error:', err.message);
    return 0;
  }
}

/**
 * Clean Yahoo symbol (fix =X=X issues)
 */
function cleanYahooSymbol(symbol) {
  if (!symbol) return symbol;
  symbol = symbol.replace(/=X=X$/, '=X');
  const parts = symbol.split('=X');
  if (parts.length > 2) {
    symbol = parts[0] + '=X';
  }
  return symbol;
}

/**
 * Fetch and store intraday data for a stock/forex asset
 */
async function syncStockIntraday(assetId, symbol, interval = '1m', range = '1d') {
  const cleanSymbol = cleanYahooSymbol(symbol);
  console.log(`📊 Syncing ${cleanSymbol} ${interval} (range: ${range})...`);
  
  const ticks = await fetchYahooIntraday(cleanSymbol, interval, range);
  if (ticks.length === 0) {
    console.log(`⚠️ No data for ${cleanSymbol}`);
    return 0;
  }

  const inserted = await insertTicksToDb(assetId, ticks);
  console.log(`✅ ${cleanSymbol}: ${inserted}/${ticks.length} ticks inserted`);
  
  return inserted;
}

/**
 * Sync intraday for all stock/forex assets
 */
async function syncAllStockIntraday(interval = '5m', range = '5d', limit = 100) {
  console.log(`\n🚀 Starting stock/forex intraday sync (${interval}, range: ${range})...`);
  
  const { rows: stockAssets } = await pool.query(`
    SELECT id, symbol, asset_type, exchange FROM assets 
    WHERE asset_type IN ('stock', 'forex', 'index') 
      AND (status = 'OK' OR status IS NULL)
    ORDER BY 
      CASE WHEN exchange = 'VNSTOCK' THEN 0 ELSE 1 END,
      id
    LIMIT $1
  `, [limit]);

  console.log(`📦 Found ${stockAssets.length} stock/forex assets (including VN stocks)`);

  let totalInserted = 0;
  
  for (const asset of stockAssets) {
    try {
      const inserted = await syncStockIntraday(asset.id, asset.symbol, interval, range);
      totalInserted += inserted;
      
      // Rate limiting (Yahoo more strict)
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (err) {
      console.error(`❌ Error syncing ${asset.symbol}:`, err.message);
    }
  }

  console.log(`\n✅ Stock/forex intraday sync complete: ${totalInserted} ticks inserted`);
  return totalInserted;
}

module.exports = {
  fetchYahooIntraday,
  insertTicksToDb,
  syncStockIntraday,
  syncAllStockIntraday,
  cleanYahooSymbol
};
