/**
 * Multi-Provider Failover System
 * Automatically tries multiple data providers if one fails
 * 
 * Supported providers:
 * 1. Binance (crypto) - primary, free, no API key
 * 2. Yahoo Finance (stocks/forex) - primary, free, no API key
 * 3. Twelve Data (backup) - requires API key
 * 4. Alpha Vantage (backup) - requires API key
 * 
 * Failover order:
 * - Crypto: Binance → (future: CoinGecko, Kraken)
 * - Stocks/Forex: Yahoo → Twelve Data → Alpha Vantage
 */

const axios = require('axios');
const { fetchBinanceIntraday } = require('./intraday/binanceIntraday');
const { fetchYahooIntraday, cleanYahooSymbol } = require('./intraday/yahooIntraday');

// Provider status tracking
const providerStatus = {
  binance: { available: true, lastCheck: Date.now(), failures: 0 },
  yahoo: { available: true, lastCheck: Date.now(), failures: 0 },
  twelve: { available: false, lastCheck: Date.now(), failures: 0 }, // Disabled by default (needs API key)
  alphavantage: { available: false, lastCheck: Date.now(), failures: 0 } // Disabled by default (needs API key)
};

const MAX_FAILURES = 3; // Mark provider unavailable after 3 consecutive failures
const RECOVERY_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

/**
 * Mark provider as failed
 */
function markProviderFailed(providerName) {
  const provider = providerStatus[providerName];
  if (!provider) return;
  
  provider.failures++;
  provider.lastCheck = Date.now();
  
  if (provider.failures >= MAX_FAILURES) {
    provider.available = false;
    console.warn(`⚠️  Provider ${providerName} marked as unavailable (${provider.failures} failures)`);
  }
}

/**
 * Mark provider as successful
 */
function markProviderSuccess(providerName) {
  const provider = providerStatus[providerName];
  if (!provider) return;
  
  const wasUnavailable = !provider.available;
  
  provider.available = true;
  provider.failures = 0;
  provider.lastCheck = Date.now();
  
  if (wasUnavailable) {
    console.log(`✅ Provider ${providerName} recovered`);
  }
}

/**
 * Check if provider should be retried
 */
function shouldRetryProvider(providerName) {
  const provider = providerStatus[providerName];
  if (!provider) return false;
  
  // Always retry if available
  if (provider.available) return true;
  
  // Retry unavailable provider after recovery interval
  const timeSinceLastCheck = Date.now() - provider.lastCheck;
  return timeSinceLastCheck >= RECOVERY_CHECK_INTERVAL;
}

/**
 * Get provider status summary
 */
function getProviderStatus() {
  return { ...providerStatus };
}

/**
 * Fetch crypto data with failover (Binance primary)
 */
async function fetchCryptoWithFailover(symbol, interval = '1m', limit = 100) {
  // Try Binance first
  if (shouldRetryProvider('binance')) {
    try {
      const ticks = await fetchBinanceIntraday(symbol, interval, limit);
      
      if (ticks && ticks.length > 0) {
        markProviderSuccess('binance');
        return {
          provider: 'binance',
          ticks
        };
      }
    } catch (err) {
      console.error(`Binance fetch failed for ${symbol}:`, err.message);
      markProviderFailed('binance');
    }
  }
  
  // TODO: Add CoinGecko as backup
  // TODO: Add Kraken as backup
  
  console.error(`❌ All crypto providers failed for ${symbol}`);
  return {
    provider: null,
    ticks: []
  };
}

/**
 * Fetch stock/forex data with failover (Yahoo → Twelve Data → Alpha Vantage)
 */
async function fetchStockWithFailover(symbol, interval = '5m', range = '1d') {
  const cleanSymbol = cleanYahooSymbol(symbol);
  
  // Try Yahoo Finance first
  if (shouldRetryProvider('yahoo')) {
    try {
      const ticks = await fetchYahooIntraday(cleanSymbol, interval, range);
      
      if (ticks && ticks.length > 0) {
        markProviderSuccess('yahoo');
        return {
          provider: 'yahoo',
          ticks
        };
      }
    } catch (err) {
      console.error(`Yahoo fetch failed for ${cleanSymbol}:`, err.message);
      markProviderFailed('yahoo');
    }
  }
  
  // Try Twelve Data (if API key configured)
  if (process.env.TWELVE_DATA_API_KEY && shouldRetryProvider('twelve')) {
    try {
      const ticks = await fetchTwelveData(cleanSymbol, interval, limit);
      
      if (ticks && ticks.length > 0) {
        markProviderSuccess('twelve');
        return {
          provider: 'twelve',
          ticks
        };
      }
    } catch (err) {
      console.error(`Twelve Data fetch failed for ${cleanSymbol}:`, err.message);
      markProviderFailed('twelve');
    }
  }
  
  // Try Alpha Vantage (if API key configured)
  if (process.env.ALPHA_VANTAGE_API_KEY && shouldRetryProvider('alphavantage')) {
    try {
      const ticks = await fetchAlphaVantage(cleanSymbol, interval);
      
      if (ticks && ticks.length > 0) {
        markProviderSuccess('alphavantage');
        return {
          provider: 'alphavantage',
          ticks
        };
      }
    } catch (err) {
      console.error(`Alpha Vantage fetch failed for ${cleanSymbol}:`, err.message);
      markProviderFailed('alphavantage');
    }
  }
  
  console.error(`❌ All stock/forex providers failed for ${cleanSymbol}`);
  return {
    provider: null,
    ticks: []
  };
}

/**
 * Fetch from Twelve Data (backup provider)
 */
async function fetchTwelveData(symbol, interval, outputsize = 100) {
  const url = 'https://api.twelvedata.com/time_series';
  
  const { data } = await axios.get(url, {
    params: {
      symbol,
      interval,
      outputsize,
      apikey: process.env.TWELVE_DATA_API_KEY
    },
    timeout: 10000
  });
  
  if (!data.values) {
    throw new Error('No data from Twelve Data');
  }
  
  const ticks = data.values.map(item => ({
    ts: new Date(item.datetime),
    open: parseFloat(item.open),
    high: parseFloat(item.high),
    low: parseFloat(item.low),
    close: parseFloat(item.close),
    price: parseFloat(item.close),
    volume: parseFloat(item.volume) || 0
  }));
  
  return ticks;
}

/**
 * Fetch from Alpha Vantage (backup provider)
 */
async function fetchAlphaVantage(symbol, interval) {
  const url = 'https://www.alphavantage.co/query';
  
  // Map interval to Alpha Vantage format
  const avInterval = interval === '5m' ? '5min' :
                     interval === '15m' ? '15min' :
                     interval === '1h' ? '60min' : '1min';
  
  const { data } = await axios.get(url, {
    params: {
      function: 'TIME_SERIES_INTRADAY',
      symbol,
      interval: avInterval,
      apikey: process.env.ALPHA_VANTAGE_API_KEY
    },
    timeout: 10000
  });
  
  const timeSeriesKey = `Time Series (${avInterval})`;
  const timeSeries = data[timeSeriesKey];
  
  if (!timeSeries) {
    throw new Error('No data from Alpha Vantage');
  }
  
  const ticks = [];
  
  for (const [timestamp, values] of Object.entries(timeSeries)) {
    ticks.push({
      ts: new Date(timestamp),
      open: parseFloat(values['1. open']),
      high: parseFloat(values['2. high']),
      low: parseFloat(values['3. low']),
      close: parseFloat(values['4. close']),
      price: parseFloat(values['4. close']),
      volume: parseFloat(values['5. volume']) || 0
    });
  }
  
  return ticks;
}

/**
 * Smart fetch with automatic provider selection
 */
async function fetchWithFailover(assetType, symbol, interval, rangeOrLimit) {
  if (assetType === 'crypto') {
    return fetchCryptoWithFailover(symbol, interval, rangeOrLimit);
  } else {
    return fetchStockWithFailover(symbol, interval, rangeOrLimit);
  }
}

/**
 * Periodic health check for providers
 */
function startProviderHealthCheck(intervalMinutes = 5) {
  console.log(`🔍 Starting provider health checks (every ${intervalMinutes} minutes)`);
  
  const interval = setInterval(() => {
    const status = getProviderStatus();
    const unavailable = Object.entries(status)
      .filter(([_, info]) => !info.available)
      .map(([name, _]) => name);
    
    if (unavailable.length > 0) {
      console.log(`⚠️  Unavailable providers: ${unavailable.join(', ')}`);
    }
  }, intervalMinutes * 60 * 1000);
  
  return interval;
}

module.exports = {
  fetchCryptoWithFailover,
  fetchStockWithFailover,
  fetchWithFailover,
  getProviderStatus,
  startProviderHealthCheck,
  markProviderFailed,
  markProviderSuccess
};
