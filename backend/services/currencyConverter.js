// backend/services/currencyConverter.js
/**
 * Currency Converter Service with Redis Caching
 * Converts USD to VND with smart caching to minimize API calls
 */

const axios = require('axios');
const redis = require('../config/redis');

const CACHE_KEY = 'exchange_rate:USD_VND';
const CACHE_TTL = 6 * 60 * 60; // 6 hours
const FALLBACK_RATE = 25000; // Fallback rate if API fails

/**
 * Fetch USD/VND exchange rate from external API
 * Using exchangerate-api.com (free, no API key required)
 */
async function fetchExchangeRate() {
  try {
    const response = await axios.get(
      'https://open.er-api.com/v6/latest/USD',
      { timeout: 5000 }
    );
    
    if (response.data && response.data.rates && response.data.rates.VND) {
      const rate = parseFloat(response.data.rates.VND);
      console.log(`✅ Fetched exchange rate: 1 USD = ${rate} VND`);
      return rate;
    }
    
    throw new Error('Invalid response from exchange rate API');
  } catch (err) {
    console.error('❌ Failed to fetch exchange rate:', err.message);
    return null;
  }
}

/**
 * Get USD/VND exchange rate with Redis caching
 * Returns cached rate or fetches new one if cache expired
 */
async function getExchangeRate() {
  try {
    // Try cache first
    const cached = await redis.get(CACHE_KEY);
    
    if (cached) {
      const rate = parseFloat(cached);
      console.log(`💾 Using cached exchange rate: 1 USD = ${rate} VND`);
      return rate;
    }
    
    // Cache miss - fetch from API
    console.log('🔄 Cache miss - fetching exchange rate from API...');
    const rate = await fetchExchangeRate();
    
    if (rate && rate > 0) {
      // Cache for 6 hours
      await redis.setex(CACHE_KEY, CACHE_TTL, rate.toString());
      return rate;
    }
    
    // API failed - use fallback rate
    console.warn(`⚠️ Using fallback rate: 1 USD = ${FALLBACK_RATE} VND`);
    return FALLBACK_RATE;
    
  } catch (err) {
    console.error('❌ getExchangeRate error:', err.message);
    return FALLBACK_RATE;
  }
}

/**
 * Convert price based on exchange type
 * @param {number} price - Original price
 * @param {string} exchange - Exchange name (HOSE, BINANCE, etc.)
 * @param {number} exchangeRate - USD/VND rate (optional, will fetch if not provided)
 * @returns {Promise<{price: number, currency: string, original: number}>}
 */
async function convertPrice(price, exchange, exchangeRate = null) {
  if (!price || isNaN(price)) {
    return { price: 0, currency: 'VND', original: 0 };
  }
  
  const ex = exchange ? exchange.toUpperCase() : '';
  
  // Vietnamese exchanges or Indices = already priced in VND, no conversion needed
  const VND_EXCHANGES = ['HOSE', 'HNX', 'UPCOM', 'VNSTOCK', 'YAHOO'];
  
  if (VND_EXCHANGES.includes(ex) || ex === 'INDEX') {
    return {
      price: parseFloat(price),
      currency: 'VND',
      original: parseFloat(price)
    };
  }
  
  // Other exchanges = USD, need to convert to VND
  const rate = exchangeRate || await getExchangeRate();
  const convertedPrice = parseFloat(price) * rate;
  
  return {
    price: convertedPrice,
    currency: 'VND',
    original: parseFloat(price),
    originalCurrency: 'USD',
    exchangeRate: rate
  };
}

/**
 * Convert multiple prices in bulk (more efficient)
 * @param {Array} items - Array of items with price and exchange
 * @returns {Promise<Array>} Array of converted items
 */
async function convertPricesBulk(items) {
  if (!items || items.length === 0) return [];
  
  // Get exchange rate once for all conversions
  const exchangeRate = await getExchangeRate();
  
  return Promise.all(
    items.map(async item => {
      const converted = await convertPrice(item.price, item.exchange, exchangeRate);
      return {
        ...item,
        price: converted.price,
        currency: converted.currency,
        originalPrice: converted.original,
        originalCurrency: converted.originalCurrency,
        exchangeRate: converted.exchangeRate
      };
    })
  );
}

/**
 * Manual refresh of exchange rate (for admin/cron jobs)
 */
async function refreshExchangeRate() {
  console.log('🔄 Manually refreshing exchange rate...');
  const rate = await fetchExchangeRate();
  
  if (rate && rate > 0) {
    await redis.setex(CACHE_KEY, CACHE_TTL, rate.toString());
    console.log(`✅ Exchange rate refreshed: 1 USD = ${rate} VND`);
    return rate;
  }
  
  console.error('❌ Failed to refresh exchange rate');
  return null;
}

module.exports = {
  getExchangeRate,
  convertPrice,
  convertPricesBulk,
  refreshExchangeRate
};
