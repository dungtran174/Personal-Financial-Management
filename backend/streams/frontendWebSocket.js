/**
 * Frontend WebSocket Server with Room-based Subscriptions
 * Allows clients to subscribe to specific symbols instead of receiving all data
 * 
 * Features:
 * - Room-based subscriptions (subscribe/unsubscribe to symbols)
 * - Efficient message broadcasting (only to interested clients)
 * - Rate limiting per client
 * - Connection management
 * - Redis pub/sub integration
 */

const WebSocket = require('ws');
const redis = require('../config/redis');
const { createClient } = require('redis');

// Create separate Redis subscriber client
const subscriber = createClient({
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  }
});

subscriber.on('error', (err) => console.error('Redis subscriber error:', err));

// Room management
// Map<symbol, Set<WebSocket>>
const rooms = new Map();

// Client subscriptions
// Map<WebSocket, Set<symbol>>
const clientSubscriptions = new Map();

// Rate limiting
// Map<WebSocket, { count: number, resetTime: number }>
const rateLimits = new Map();
const RATE_LIMIT_WINDOW = 1000; // 1 second
const RATE_LIMIT_MAX = 50; // max 50 messages per second per client

/**
 * Check if client exceeds rate limit
 */
function isRateLimited(ws) {
  const now = Date.now();
  let limitInfo = rateLimits.get(ws);
  
  if (!limitInfo || now > limitInfo.resetTime) {
    // Reset window
    rateLimits.set(ws, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW
    });
    return false;
  }
  
  limitInfo.count++;
  
  if (limitInfo.count > RATE_LIMIT_MAX) {
    return true;
  }
  
  return false;
}

/**
 * Subscribe client to symbol
 */
function subscribe(ws, symbol) {
  symbol = symbol.toUpperCase();
  
  // Add to room
  if (!rooms.has(symbol)) {
    rooms.set(symbol, new Set());
  }
  rooms.get(symbol).add(ws);
  
  // Track client subscriptions
  if (!clientSubscriptions.has(ws)) {
    clientSubscriptions.set(ws, new Set());
  }
  clientSubscriptions.get(ws).add(symbol);
  
  console.log(`📡 Client subscribed to ${symbol} (room size: ${rooms.get(symbol).size})`);
  
  // Send confirmation
  ws.send(JSON.stringify({
    type: 'subscribed',
    symbol,
    timestamp: Date.now()
  }));
}

/**
 * Unsubscribe client from symbol
 */
function unsubscribe(ws, symbol) {
  symbol = symbol.toUpperCase();
  
  // Remove from room
  if (rooms.has(symbol)) {
    rooms.get(symbol).delete(ws);
    
    // Clean up empty rooms
    if (rooms.get(symbol).size === 0) {
      rooms.delete(symbol);
    }
  }
  
  // Remove from client subscriptions
  if (clientSubscriptions.has(ws)) {
    clientSubscriptions.get(ws).delete(symbol);
  }
  
  console.log(`📡 Client unsubscribed from ${symbol}`);
  
  // Send confirmation
  ws.send(JSON.stringify({
    type: 'unsubscribed',
    symbol,
    timestamp: Date.now()
  }));
}

/**
 * Unsubscribe client from all symbols
 */
function unsubscribeAll(ws) {
  const symbols = clientSubscriptions.get(ws);
  
  if (!symbols) return;
  
  for (const symbol of symbols) {
    if (rooms.has(symbol)) {
      rooms.get(symbol).delete(ws);
      
      // Clean up empty rooms
      if (rooms.get(symbol).size === 0) {
        rooms.delete(symbol);
      }
    }
  }
  
  clientSubscriptions.delete(ws);
  rateLimits.delete(ws);
}

/**
 * Broadcast price update to subscribed clients only
 */
function broadcastToRoom(symbol, data) {
  const room = rooms.get(symbol);
  
  if (!room || room.size === 0) return;
  
  const message = JSON.stringify({
    type: 'price_update',
    symbol,
    price: data.price,
    volume: data.volume,
    timestamp: data.timestamp
  });
  
  let sent = 0;
  let failed = 0;
  
  for (const client of room) {
    if (client.readyState === WebSocket.OPEN) {
      // Check rate limit
      if (isRateLimited(client)) {
        failed++;
        continue;
      }
      
      try {
        client.send(message);
        sent++;
      } catch (err) {
        console.error('Broadcast error:', err.message);
        failed++;
      }
    }
  }
  
  // Log only if there are failures or for debugging
  if (failed > 0) {
    console.log(`📤 Broadcast ${symbol}: sent=${sent}, failed=${failed}, room=${room.size}`);
  }
}

/**
 * Handle client message
 */
function handleClientMessage(ws, message) {
  try {
    const data = JSON.parse(message);
    
    switch (data.type) {
      case 'subscribe':
        if (data.symbol) {
          subscribe(ws, data.symbol);
        } else if (data.symbols && Array.isArray(data.symbols)) {
          // Bulk subscribe
          for (const symbol of data.symbols) {
            subscribe(ws, symbol);
          }
        }
        break;
        
      case 'unsubscribe':
        if (data.symbol) {
          unsubscribe(ws, data.symbol);
        } else if (data.symbols && Array.isArray(data.symbols)) {
          // Bulk unsubscribe
          for (const symbol of data.symbols) {
            unsubscribe(ws, symbol);
          }
        }
        break;
        
      case 'ping':
        ws.send(JSON.stringify({
          type: 'pong',
          timestamp: Date.now()
        }));
        break;
        
      default:
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Unknown message type'
        }));
    }
  } catch (err) {
    console.error('Message handling error:', err.message);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Invalid message format'
    }));
  }
}

/**
 * Start WebSocket server for frontend
 */
function startFrontendWebSocket(server) {
  const wss = new WebSocket.Server({ 
    server,
    path: '/ws/prices'
  });
  
  console.log('✅ Frontend WebSocket server started at /ws/prices');
  
  // Connect Redis subscriber
  subscriber.connect().then(() => {
    console.log('✅ Redis subscriber connected');
    
    // Subscribe to realtime_prices channel
    subscriber.subscribe('realtime_prices', (message) => {
      try {
        const data = JSON.parse(message);
        const symbol = data.symbol;
        
        // Broadcast to subscribed clients only
        broadcastToRoom(symbol, data);
      } catch (err) {
        console.error('Redis message error:', err.message);
      }
    });
  }).catch(err => {
    console.error('Failed to connect Redis subscriber:', err);
  });
  
  // Handle new connections
  wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    console.log(`📡 New WebSocket connection from ${ip}`);
    
    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'Welcome to price streaming. Send {"type":"subscribe","symbol":"BTCUSDT"} to start.',
      timestamp: Date.now()
    }));
    
    // Handle messages
    ws.on('message', (message) => {
      handleClientMessage(ws, message.toString());
    });
    
    // Handle disconnection
    ws.on('close', () => {
      console.log(`📡 Client disconnected from ${ip}`);
      unsubscribeAll(ws);
    });
    
    // Handle errors
    ws.on('error', (err) => {
      console.error('WebSocket error:', err.message);
    });
  });
  
  // Periodic cleanup
  setInterval(() => {
    // Clean up closed connections
    for (const [symbol, clients] of rooms.entries()) {
      for (const client of clients) {
        if (client.readyState !== WebSocket.OPEN) {
          clients.delete(client);
        }
      }
      
      // Clean up empty rooms
      if (clients.size === 0) {
        rooms.delete(symbol);
      }
    }
  }, 60000); // Every minute
  
  // Stats logging
  setInterval(() => {
    const totalClients = clientSubscriptions.size;
    const totalRooms = rooms.size;
    let totalSubscriptions = 0;
    
    for (const subs of clientSubscriptions.values()) {
      totalSubscriptions += subs.size;
    }
    
    if (totalClients > 0) {
      console.log(`📊 WebSocket Stats: ${totalClients} clients, ${totalRooms} rooms, ${totalSubscriptions} subscriptions`);
    }
  }, 5 * 60 * 1000); // Every 5 minutes
  
  return wss;
}

/**
 * Shutdown
 */
async function shutdown(wss) {
  console.log('🛑 Shutting down frontend WebSocket...');
  
  // Close all connections
  for (const ws of clientSubscriptions.keys()) {
    ws.close();
  }
  
  // Disconnect Redis
  if (subscriber.isOpen) {
    await subscriber.disconnect();
  }
  
  if (wss) {
    wss.close();
  }
  
  console.log('✅ Frontend WebSocket shutdown complete');
}

module.exports = {
  startFrontendWebSocket,
  shutdown,
  rooms,
  clientSubscriptions
};
