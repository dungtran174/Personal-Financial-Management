// backend/streams/binanceStream.js
// Production-grade Binance WebSocket stream with TimescaleDB optimization
const WebSocket = require('ws');
const redis = require('../config/redis');
const pool = require('../config/pg');
const {
  alertWebSocketDisconnect,
  alertWebSocketReconnect,
  alertWebSocketFailed
} = require('../services/alertSystem');

// ============================================================================
// ASSET ID CACHE with -1 for non-existent assets (avoid DB spam)
// ============================================================================
const assetIdCache = new Map();
const ASSET_NOT_FOUND = -1;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Get asset ID from cache or DB
 * Returns: asset_id (number) or -1 if not found
 */
async function getAssetId(symbol) {
  const cached = assetIdCache.get(symbol);
  
  // Check if cached (including -1 for not found)
  if (cached !== undefined) {
    if (cached === ASSET_NOT_FOUND) return null;
    return cached;
  }

  // Query DB
  try {
    const { rows } = await pool.query(
      'SELECT id FROM assets WHERE symbol = $1',
      [symbol]
    );

    if (rows[0]) {
      const assetId = rows[0].id;
      assetIdCache.set(symbol, assetId);
      return assetId;
    }

    // Asset not found - cache -1 to avoid repeated queries
    assetIdCache.set(symbol, ASSET_NOT_FOUND);
    
    // Clear cache after TTL
    setTimeout(() => assetIdCache.delete(symbol), CACHE_TTL_MS);
    
    return null;
  } catch (err) {
    console.error(`❌ DB query error for ${symbol}:`, err.message);
    return null;
  }
}

// ============================================================================
// TICK BUFFER - Optimized for high-frequency writes
// ============================================================================
const tickBuffer = [];
const BUFFER_SIZE = 200; // Larger batch = better DB performance
const BUFFER_FLUSH_INTERVAL = 1000; // 1 second - fast enough for realtime

let flushTimer = null;
let isFlushingBuffer = false;

/**
 * Flush tick buffer to database
 * Deduplicates ticks with same (asset_id, ts) before insert
 */
async function flushTickBuffer() {
  if (isFlushingBuffer || tickBuffer.length === 0) return;
  
  isFlushingBuffer = true;
  const batch = tickBuffer.splice(0, tickBuffer.length);
  
  // CRITICAL: Deduplicate by (asset_id, ts) and aggregate volumes
  // Multiple trades can happen in same millisecond
  const tickMap = new Map();
  
  for (const tick of batch) {
    const key = `${tick.asset_id}:${tick.ts.getTime()}`;
    
    if (tickMap.has(key)) {
      // Merge: keep last price, sum volumes
      const existing = tickMap.get(key);
      existing.price = tick.price; // Last price wins
      existing.volume += tick.volume; // Sum volumes
    } else {
      tickMap.set(key, { ...tick });
    }
  }
  
  // Convert map back to array
  const dedupedBatch = Array.from(tickMap.values());
  
  if (dedupedBatch.length === 0) {
    isFlushingBuffer = false;
    return;
  }

  const values = [];
  const placeholders = [];

  dedupedBatch.forEach((tick, i) => {
    const base = i * 4;
    placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
    values.push(tick.asset_id, tick.ts, tick.price, tick.volume);
  });

  const sql = `
    INSERT INTO price_ticks (asset_id, ts, price, volume)
    VALUES ${placeholders.join(',')}
    ON CONFLICT (asset_id, ts) DO UPDATE
    SET price = EXCLUDED.price, volume = price_ticks.volume + EXCLUDED.volume
  `;

  try {
    const result = await pool.query(sql, values);
    const dupCount = batch.length - dedupedBatch.length;
    console.log(`✅ [${new Date().toISOString()}] Flushed ${dedupedBatch.length} ticks (${batch.length} total, ${dupCount} merged, ${result.rowCount} inserted/updated)`);
  } catch (err) {
    console.error('❌ Tick flush error:', err.message);
    console.error('   First tick:', dedupedBatch[0]);
    console.error('   Batch size:', dedupedBatch.length);
  } finally {
    isFlushingBuffer = false;
  }
}

/**
 * Start periodic buffer flush
 */
function startBufferFlush() {
  if (flushTimer) return;
  
  flushTimer = setInterval(async () => {
    if (tickBuffer.length > 0) {
      await flushTickBuffer();
    }
  }, BUFFER_FLUSH_INTERVAL);
  
  console.log(`🔄 Buffer flush started (every ${BUFFER_FLUSH_INTERVAL}ms, size: ${BUFFER_SIZE})`);
}

/**
 * Stop buffer flush (for graceful shutdown)
 */
function stopBufferFlush() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

/**
 * Add tick to buffer (using Binance trade timestamp)
 */
async function addTick(symbol, price, volume, timestamp) {
  const assetId = await getAssetId(symbol);
  
  if (!assetId) {
    // Asset not found - already cached as -1, won't spam logs
    return;
  }

  tickBuffer.push({
    asset_id: assetId,
    ts: new Date(timestamp), // Use Binance trade timestamp (data.T)
    price: parseFloat(price),
    volume: parseFloat(volume) || 0
  });

  // Flush immediately if buffer full
  if (tickBuffer.length >= BUFFER_SIZE) {
    await flushTickBuffer();
  }
}

// ============================================================================
// WEBSOCKET STREAM
// ============================================================================
let wsConnection = null;
let reconnectTimeout = null;

/**
 * Start Binance WebSocket stream for multiple symbols
 * Uses trade stream (@trade) for precise tick data with exact timestamps
 */
function startBinanceStream(symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT']) {
  // Clear any pending reconnect
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  // Build multi-stream URL
  const streams = symbols.map(s => `${s.toLowerCase()}@trade`).join('/');
  const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;
  
  wsConnection = new WebSocket(url);

  wsConnection.on('open', () => {
    console.log('✅ Binance WS connected');
    console.log(`📊 Streaming ${symbols.length} symbols: ${symbols.slice(0, 5).join(', ')}${symbols.length > 5 ? '...' : ''}`);
    startBufferFlush();
    
    // Alert if this was a reconnection
    if (reconnectAttempts > 0) {
      alertWebSocketReconnect(reconnectAttempts).catch(err => {
        console.error('Alert failed:', err.message);
      });
    }
    
    // Reset reconnect counter after successful connection
    lastSuccessfulConnection = Date.now();
    resetReconnectCounter();
  });

  wsConnection.on('message', async (msg) => {
    try {
      const { data } = JSON.parse(msg);
      if (!data || !data.s || !data.p) return;

      const symbol = data.s;      // BTCUSDT
      const price = data.p;        // Trade price
      const volume = data.q;       // Trade quantity
      const timestamp = data.T;    // Trade timestamp (CRITICAL: use Binance time, not local time)

      // Update Redis cache (for latest price API)
      redis.set(`price:${symbol}`, price, 'EX', 60).catch(err => {
        console.error('Redis set error:', err.message);
      });
      
      // Publish to Redis pub/sub (for WebSocket broadcast to frontend)
      redis.publish('realtime_prices', JSON.stringify({ 
        symbol, 
        price: parseFloat(price),
        volume: parseFloat(volume),
        timestamp 
      })).catch(err => {
        console.error('Redis publish error:', err.message);
      });

      // Add to buffer for DB write (using Binance timestamp)
      await addTick(symbol, price, volume, timestamp);
      
    } catch (err) {
      console.error('❌ Message parse error:', err.message);
    }
  });

  wsConnection.on('error', (err) => {
    console.error('❌ Binance WS error:', err.message);
    
    // Alert about error
    alertWebSocketDisconnect(`Error: ${err.message}`).catch(e => {
      console.error('Alert failed:', e.message);
    });
  });

  wsConnection.on('close', () => {
    console.warn('⚠️ Binance WS closed');
    
    // Alert about disconnection
    alertWebSocketDisconnect('Connection closed').catch(err => {
      console.error('Alert failed:', err.message);
    });
    
    stopBufferFlush();
    
    // Flush remaining buffer before reconnect
    if (tickBuffer.length > 0) {
      console.log('🔄 Flushing remaining buffer before reconnect...');
      flushTickBuffer().then(() => {
        reconnect(symbols);
      });
    } else {
      reconnect(symbols);
    }
  });

  return wsConnection;
}

/**
 * Reconnect with exponential backoff and max attempts
 */
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 30000; // 30 seconds max
const MAX_RECONNECT_ATTEMPTS = 10; // Stop after 10 failed attempts
const RECONNECT_RESET_TIMEOUT = 5 * 60 * 1000; // Reset counter after 5 minutes of stable connection

let lastSuccessfulConnection = null;
let resetReconnectTimer = null;

function reconnect(symbols) {
  reconnectAttempts++;
  
  // Check if max attempts reached
  if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
    console.error(`❌ Max reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Giving up.`);
    console.error('   Please check network connection or Binance API status');
    console.error('   Restart the server to try again');
    
    // Alert critical failure
    alertWebSocketFailed(MAX_RECONNECT_ATTEMPTS).catch(err => {
      console.error('Alert failed:', err.message);
    });
    
    return;
  }
  
  const delay = Math.min(5000 * reconnectAttempts, MAX_RECONNECT_DELAY);
  
  console.log(`🔄 Reconnecting in ${delay/1000}s (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
  
  reconnectTimeout = setTimeout(() => {
    startBinanceStream(symbols);
  }, delay);
}

/**
 * Reset reconnect counter after stable connection
 */
function resetReconnectCounter() {
  if (resetReconnectTimer) {
    clearTimeout(resetReconnectTimer);
  }
  
  // Reset counter after 5 minutes of stable connection
  resetReconnectTimer = setTimeout(() => {
    if (reconnectAttempts > 0) {
      console.log('✅ Connection stable for 5 minutes, resetting reconnect counter');
      reconnectAttempts = 0;
    }
  }, RECONNECT_RESET_TIMEOUT);
}

/**
 * Start stream for all crypto assets from DB
 */
async function startBinanceStreamAll() {
  try {
    const { rows } = await pool.query(`
      SELECT symbol FROM assets 
      WHERE asset_type = 'crypto' AND status = 'OK'
      ORDER BY id
      LIMIT 50
    `);

    const symbols = rows.map(r => r.symbol);
    
    if (symbols.length === 0) {
      console.warn('⚠️ No crypto assets found for streaming');
      return null;
    }

    console.log(`🚀 Starting Binance stream for ${symbols.length} crypto assets`);
    return startBinanceStream(symbols);
    
  } catch (err) {
    console.error('❌ Failed to load crypto assets:', err.message);
    return null;
  }
}

/**
 * Graceful shutdown
 */
async function shutdown() {
  console.log('🛑 Shutting down Binance stream...');
  
  stopBufferFlush();
  
  if (wsConnection) {
    wsConnection.close();
  }
  
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
  }
  
  if (resetReconnectTimer) {
    clearTimeout(resetReconnectTimer);
  }
  
  // Final flush
  if (tickBuffer.length > 0) {
    console.log(`🔄 Final flush: ${tickBuffer.length} ticks`);
    await flushTickBuffer();
  }
  
  console.log('✅ Binance stream shutdown complete');
}

// Handle process signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = { 
  startBinanceStream,
  startBinanceStreamAll,
  flushTickBuffer,
  shutdown
};
