/**
 * Alert System
 * Monitors health metrics and sends alerts when thresholds are exceeded
 * 
 * Alert channels:
 * - Console logging (always enabled)
 * - Email (if configured)
 * - Webhook (if configured)
 * - Database log (for audit trail)
 */

const pool = require('../config/pg');
const {
  checkChunkHealth,
  checkAggregatesLag,
  checkJobStatus,
  checkDataIngestion
} = require('./healthMonitoring');

// Alert severity levels
const SEVERITY = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical'
};

// Alert history (in-memory for quick access)
const alertHistory = [];
const MAX_ALERT_HISTORY = 100;

// Cooldown to prevent alert spam (5 minutes)
const ALERT_COOLDOWN_MS = 5 * 60 * 1000;
const lastAlertTime = new Map();

/**
 * Check if alert is in cooldown period
 */
function isInCooldown(alertKey) {
  const lastTime = lastAlertTime.get(alertKey);
  if (!lastTime) return false;
  
  const now = Date.now();
  return (now - lastTime) < ALERT_COOLDOWN_MS;
}

/**
 * Record alert time
 */
function recordAlertTime(alertKey) {
  lastAlertTime.set(alertKey, Date.now());
}

/**
 * Create alert object
 */
function createAlert(severity, category, message, data = null) {
  return {
    timestamp: new Date().toISOString(),
    severity,
    category,
    message,
    data
  };
}

/**
 * Send alert (console, email, webhook, etc.)
 */
async function sendAlert(alert) {
  const icon = alert.severity === SEVERITY.CRITICAL ? '🚨' :
               alert.severity === SEVERITY.WARNING ? '⚠️' : 'ℹ️';
  
  console.log(`\n${icon} ALERT [${alert.severity.toUpperCase()}] ${alert.category}`);
  console.log(`   ${alert.message}`);
  if (alert.data) {
    console.log(`   Data:`, JSON.stringify(alert.data, null, 2));
  }
  console.log('');
  
  // Add to history
  alertHistory.unshift(alert);
  if (alertHistory.length > MAX_ALERT_HISTORY) {
    alertHistory.pop();
  }
  
  // TODO: Send email if configured
  // TODO: Send webhook if configured
  // TODO: Log to database
  
  return alert;
}

/**
 * Emit alert with cooldown check
 */
async function emitAlert(severity, category, message, data = null, cooldownKey = null) {
  const key = cooldownKey || `${category}:${message}`;
  
  // Check cooldown
  if (isInCooldown(key)) {
    return null; // Skip alert if in cooldown
  }
  
  const alert = createAlert(severity, category, message, data);
  recordAlertTime(key);
  
  return sendAlert(alert);
}

/**
 * Check chunk health and alert if needed
 */
async function checkAndAlertChunks() {
  try {
    const result = await checkChunkHealth();
    
    if (result.status === 'warning' || result.status === 'critical') {
      const severity = result.status === 'critical' ? SEVERITY.CRITICAL : SEVERITY.WARNING;
      
      for (const warning of result.warnings) {
        await emitAlert(
          severity,
          'chunks',
          warning,
          result.data,
          'chunks'
        );
      }
    }
  } catch (err) {
    console.error('Chunk health check failed:', err.message);
  }
}

/**
 * Check aggregate lag and alert if needed
 */
async function checkAndAlertAggregates() {
  try {
    const result = await checkAggregatesLag();
    
    if (result.status === 'warning' || result.status === 'critical') {
      const severity = result.status === 'critical' ? SEVERITY.CRITICAL : SEVERITY.WARNING;
      
      for (const warning of result.warnings) {
        await emitAlert(
          severity,
          'continuous_aggregates',
          warning,
          result.data,
          'aggregates'
        );
      }
    }
  } catch (err) {
    console.error('Aggregate lag check failed:', err.message);
  }
}

/**
 * Check job status and alert if needed
 */
async function checkAndAlertJobs() {
  try {
    const result = await checkJobStatus();
    
    if (result.status === 'warning' || result.status === 'critical') {
      const severity = result.status === 'critical' ? SEVERITY.CRITICAL : SEVERITY.WARNING;
      
      for (const warning of result.warnings) {
        await emitAlert(
          severity,
          'timescaledb_jobs',
          warning,
          result.data,
          'jobs'
        );
      }
    }
  } catch (err) {
    console.error('Job status check failed:', err.message);
  }
}

/**
 * Check data ingestion and alert if needed
 */
async function checkAndAlertIngestion() {
  try {
    const result = await checkDataIngestion();
    
    if (result.status === 'warning' || result.status === 'critical') {
      const severity = result.status === 'critical' ? SEVERITY.CRITICAL : SEVERITY.WARNING;
      
      for (const warning of result.warnings) {
        await emitAlert(
          severity,
          'data_ingestion',
          warning,
          result.data,
          'ingestion'
        );
      }
    }
  } catch (err) {
    console.error('Ingestion check failed:', err.message);
  }
}

/**
 * Alert when WebSocket disconnects
 */
async function alertWebSocketDisconnect(reason = 'Unknown') {
  await emitAlert(
    SEVERITY.WARNING,
    'websocket',
    `WebSocket disconnected: ${reason}`,
    { reason },
    'ws_disconnect'
  );
}

/**
 * Alert when WebSocket reconnects successfully
 */
async function alertWebSocketReconnect(attemptCount) {
  await emitAlert(
    SEVERITY.INFO,
    'websocket',
    `WebSocket reconnected after ${attemptCount} attempts`,
    { attemptCount },
    'ws_reconnect'
  );
}

/**
 * Alert when WebSocket fails to reconnect
 */
async function alertWebSocketFailed(attempts) {
  await emitAlert(
    SEVERITY.CRITICAL,
    'websocket',
    `WebSocket failed to reconnect after ${attempts} attempts`,
    { attempts },
    'ws_failed'
  );
}

/**
 * Run all health checks and send alerts
 */
async function runHealthChecksWithAlerts() {
  console.log('\n🔍 Running health checks with alerts...');
  
  await checkAndAlertChunks();
  await checkAndAlertAggregates();
  await checkAndAlertJobs();
  await checkAndAlertIngestion();
  
  console.log('✅ Health checks complete\n');
}

/**
 * Start periodic alert monitoring
 */
function startAlertMonitoring(intervalMinutes = 10) {
  console.log(`🔔 Starting alert monitoring (every ${intervalMinutes} minutes)`);
  
  // Run immediately
  runHealthChecksWithAlerts();
  
  // Schedule periodic checks
  const interval = setInterval(async () => {
    await runHealthChecksWithAlerts();
  }, intervalMinutes * 60 * 1000);
  
  return interval;
}

/**
 * Get alert history
 */
function getAlertHistory(limit = 50) {
  return alertHistory.slice(0, limit);
}

/**
 * Clear alert history
 */
function clearAlertHistory() {
  alertHistory.length = 0;
  lastAlertTime.clear();
}

module.exports = {
  SEVERITY,
  emitAlert,
  alertWebSocketDisconnect,
  alertWebSocketReconnect,
  alertWebSocketFailed,
  runHealthChecksWithAlerts,
  startAlertMonitoring,
  getAlertHistory,
  clearAlertHistory
};
