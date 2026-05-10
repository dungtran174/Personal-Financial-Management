// backend/services/redisCache.js
const redis = require('../config/redis');

async function setPriceLatest(symbol, price, ttl = 15) {
  try {
    await redis.set(`price:latest:${symbol}`, String(price), 'EX', ttl);
  } catch (err) {
    console.error('redis setPriceLatest err', err.message);
  }
}

async function getPriceLatest(symbol) {
  try {
    return await redis.get(`price:latest:${symbol}`);
  } catch (err) {
    console.error('redis getPriceLatest err', err.message);
    return null;
  }
}

async function setCandlesCache(symbol, tf, data, ttl = 300) {
  try {
    await redis.set(`candles:${symbol}:${tf}`, JSON.stringify(data), 'EX', ttl);
  } catch (err) {
    console.error('redis setCandlesCache err', err.message);
  }
}

async function getCandlesCache(symbol, tf) {
  try {
    const x = await redis.get(`candles:${symbol}:${tf}`);
    return x ? JSON.parse(x) : null;
  } catch (err) {
    console.error('redis getCandlesCache err', err.message);
    return null;
  }
}

async function setTickerBarCache(data, ttl = 30) {
  try {
    await redis.set('ticker:bar:all', JSON.stringify(data), 'EX', ttl);
  } catch (err) {
    console.error('redis setTickerBarCache err', err.message);
  }
}

async function getTickerBarCache() {
  try {
    const data = await redis.get('ticker:bar:all');
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.error('redis getTickerBarCache err', err.message);
    return null;
  }
}

module.exports = { 
  setPriceLatest, 
  getPriceLatest, 
  setCandlesCache, 
  getCandlesCache,
  setTickerBarCache,
  getTickerBarCache
};
