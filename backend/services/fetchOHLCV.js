// backend/services/fetchOHLCV.js
const { fetchYahooOHLC } = require('./fetchYahoo');
const { fetchBinanceOHLC } = require('./fetchBinance');
const { fetchTwelveOHLC } = require('./fetchTwelve');
const { upsertOHLCBatch } = require('./utils/upsertOHLCV');
const pool = require('../config/pg');

async function getAssetId(symbol) {
  const { rows } = await pool.query('SELECT id, asset_type FROM assets WHERE symbol=$1 LIMIT 1', [symbol]);
  return rows[0] || null;
}

async function fetchAndStoreOHLC(symbol) {
  const asset = await getAssetId(symbol);
  if (!asset) { console.warn('No asset_id for', symbol); return 0; }

  let rows = [];
  if (asset.asset_type === 'crypto') rows = await fetchBinanceOHLC(symbol, '1d', 1000);
  else if (asset.asset_type === 'stock' || asset.asset_type === 'index' || asset.asset_type === 'forex' || asset.asset_type === 'commodity') {
    rows = await fetchTwelveOHLC(symbol, '1d', 5000);
  }

  if (rows.length === 0) return 0;

  const toInsert = rows.map(r => ({ ...r, asset_id: asset.id }));
  const inserted = await upsertOHLCBatch(toInsert);
  console.log(`Saved ${inserted} candles for ${symbol}`);
  return inserted;
}

// batch runner
async function runBatchFetch(symbols, batchSize=20) {
  let total = 0;
  for (let i=0; i<symbols.length; i+=batchSize) {
    const chunk = symbols.slice(i,i+batchSize);
    const promises = chunk.map(s => fetchAndStoreOHLC(s).catch(err=>{ console.error(err); return 0; }));
    const results = await Promise.all(promises);
    total += results.reduce((a,b)=>a+b,0);
    await new Promise(r => setTimeout(r,1200));
  }
  return total;
}

module.exports = { fetchAndStoreOHLC, runBatchFetch };
