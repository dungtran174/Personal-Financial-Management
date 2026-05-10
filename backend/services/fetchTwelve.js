// backend/services/fetchTwelve.js
const axios = require('axios');

const TWELVE_API_KEY = process.env.TWELVE_API_KEY;

function mapInterval(tf) {
  const mapping = { '1m':'1min','5m':'5min','15m':'15min','30m':'30min','1h':'1h','1d':'1day','1w':'1week','1M':'1month' };
  return mapping[tf] || tf;
}

async function fetchTwelveOHLC(symbol, tf='1d', outputsize=5000) {
  try {
    const interval = mapInterval(tf);
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&apikey=${TWELVE_API_KEY}&outputsize=${outputsize}`;
    const { data } = await axios.get(url, { timeout: 20000 });

    if (data.status === 'error') {
      console.error(`Twelve Data error for ${symbol}:`, data.message);
      return [];
    }

    const values = data.values || [];
    return values.map(r => ({
      symbol,
      ts: new Date(r.datetime).toISOString(),
      open: parseFloat(r.open),
      high: parseFloat(r.high),
      low: parseFloat(r.low),
      close: parseFloat(r.close),
      volume: r.volume != null ? parseFloat(r.volume) : 0
    }));
  } catch (err) {
    console.error(`fetchTwelveOHLC error for ${symbol}:`, err.message);
    return [];
  }
}

module.exports = { fetchTwelveOHLC };
