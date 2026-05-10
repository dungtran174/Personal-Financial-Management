// backend/services/fetchBinance.js
const axios = require('axios');
const { upsertOHLCBatch } = require('./utils/upsertOHLCV');
const pool = require('../config/pg');

async function fetchBinanceOHLC(symbol, interval='1d', limit=1000) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const { data } = await axios.get(url);
  const rows = data.map(k => ({
    ts: new Date(k[0]).toISOString(),
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
    symbol
  }));
  return rows;
}

async function fetchAndStore(symbol, interval='1d', limit=1000) {
  const rows = await fetchBinanceOHLC(symbol, interval, limit);
  const saved = await upsertOHLCBatch(rows);
  console.log(`✅ ${saved} candles saved for ${symbol} (Binance)`);
  return saved;
}

module.exports = { fetchAndStore };
