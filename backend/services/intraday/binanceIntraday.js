/**
 * Binance Intraday Data Fetcher
 * Fetches 1m, 5m, 15m, 1h candles from Binance
 */

const axios = require('axios');
const pool = require('../../config/pg');

const BINANCE_BASE = 'https://api.binance.com/api/v3';

/**
 * Fetch intraday candles and convert to ticks
 * @param {string} symbol - Binance symbol (e.g., BTCUSDT)
 * @param {string} interval - 1m, 5m, 15m, 1h
 * @param {number} limit - number of candles (max 1000)
 */
async function fetchBinanceIntraday(symbol, interval = '1m', limit = 1000) {
  try {
    const url = `${BINANCE_BASE}/klines`;
    const { data } = await axios.get(url, {
      params: { symbol, interval, limit },
      timeout: 10000
    });

    // Binance klines format:
    // [openTime, open, high, low, close, volume, closeTime, ...]
    const ticks = [];
    
    for (const kline of data) {
      const [openTime, open, high, low, close, volume] = kline;
      
      // Create tick for each candle (use close as tick price)
      ticks.push({
        ts: new Date(openTime),
        price: parseFloat(close),
        volume: parseFloat(volume),
        open: parseFloat(open),
        high: parseFloat(high),
        low: parseFloat(low)
      });
    }

    return ticks;
  } catch (err) {
    console.error(`❌ Binance intraday fetch error (${symbol}, ${interval}):`, err.message);
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
 * Fetch and store intraday data for a crypto asset
 */
async function syncCryptoIntraday(assetId, symbol, interval = '1m', limit = 1000) {
  console.log(`📊 Syncing ${symbol} ${interval} (last ${limit} candles)...`);
  
  const ticks = await fetchBinanceIntraday(symbol, interval, limit);
  if (ticks.length === 0) {
    console.log(`⚠️ No data for ${symbol}`);
    return 0;
  }

  const inserted = await insertTicksToDb(assetId, ticks);
  console.log(`✅ ${symbol}: ${inserted}/${ticks.length} ticks inserted`);
  
  return inserted;
}

/**
 * Sync intraday for all crypto assets
 */
async function syncAllCryptoIntraday(interval = '1m', limit = 500) {
  console.log(`\n🚀 Starting crypto intraday sync (${interval})...`);
  
  const { rows: cryptoAssets } = await pool.query(`
    SELECT id, symbol FROM assets 
    WHERE asset_type = 'crypto' AND status = 'OK'
    ORDER BY id
  `);

  console.log(`📦 Found ${cryptoAssets.length} crypto assets`);

  let totalInserted = 0;
  
  for (const asset of cryptoAssets) {
    try {
      const inserted = await syncCryptoIntraday(asset.id, asset.symbol, interval, limit);
      totalInserted += inserted;
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (err) {
      console.error(`❌ Error syncing ${asset.symbol}:`, err.message);
    }
  }

  console.log(`\n✅ Crypto intraday sync complete: ${totalInserted} ticks inserted`);
  return totalInserted;
}

module.exports = {
  fetchBinanceIntraday,
  insertTicksToDb,
  syncCryptoIntraday,
  syncAllCryptoIntraday
};
