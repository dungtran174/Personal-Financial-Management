// backend/services/fetchYahoo.js
const axios = require('axios');
const { upsertOHLCBatch } = require('./utils/upsertOHLCV');

async function fetchYahooOHLC(symbol, interval='1d', range='5y') {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
  const { data } = await axios.get(url);
  const chart = data.chart.result?.[0];
  if (!chart) return [];

  const timestamps = chart.timestamp || [];
  const quote = chart.indicators?.quote?.[0] || {};
  const opens = quote.open || [];
  const highs = quote.high || [];
  const lows = quote.low || [];
  const closes = quote.close || [];
  const volumes = quote.volume || [];

  const rows = [];
  for (let i=0; i<timestamps.length; i++) {
    if (opens[i]==null || highs[i]==null || lows[i]==null || closes[i]==null) continue;
    rows.push({
      symbol,
      ts: new Date(timestamps[i]*1000).toISOString(),
      open: opens[i],
      high: highs[i],
      low: lows[i],
      close: closes[i],
      volume: volumes[i] || 0
    });
  }
  return rows;
}

async function fetchAndStore(symbol, interval='1d', range='5y') {
  const rows = await fetchYahooOHLC(symbol, interval, range);
  const saved = await upsertOHLCBatch(rows);
  console.log(`✅ ${saved} candles saved for ${symbol} (Yahoo)`);
  return saved;
}

module.exports = { fetchAndStore };
