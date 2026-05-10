/**
 * Health Monitoring Routes
 */

const express = require('express');
const router = express.Router();
const {
  getHealthReport,
  checkChunkHealth,
  checkAggregatesLag,
  checkJobStatus,
  checkDatabaseSize,
  checkDataIngestion
} = require('../services/healthMonitoring');

const {
  getAlertHistory,
  clearAlertHistory
} = require('../services/alertSystem');

/**
 * GET /api/v1/health
 * Get comprehensive health report
 */
router.get('/', async (req, res) => {
  try {
    const report = await getHealthReport();
    
    // Set HTTP status based on health
    let httpStatus = 200;
    if (report.overall_status === 'warning') {
      httpStatus = 200; // Still OK, but with warnings
    } else if (report.overall_status === 'critical') {
      httpStatus = 503; // Service degraded
    } else if (report.overall_status === 'error') {
      httpStatus = 500; // Error
    }
    
    res.status(httpStatus).json(report);
  } catch (err) {
    console.error('Health check error:', err);
    res.status(500).json({
      overall_status: 'error',
      error: err.message
    });
  }
});

/**
 * GET /api/v1/health/chunks
 * Check chunk health only
 */
router.get('/chunks', async (req, res) => {
  try {
    const result = await checkChunkHealth();
    res.json(result);
  } catch (err) {
    console.error('Chunk health check error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/v1/health/aggregates
 * Check continuous aggregate lag
 */
router.get('/aggregates', async (req, res) => {
  try {
    const result = await checkAggregatesLag();
    res.json(result);
  } catch (err) {
    console.error('Aggregate check error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/v1/health/jobs
 * Check TimescaleDB job status
 */
router.get('/jobs', async (req, res) => {
  try {
    const result = await checkJobStatus();
    res.json(result);
  } catch (err) {
    console.error('Job status check error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/v1/health/database
 * Check database size
 */
router.get('/database', async (req, res) => {
  try {
    const result = await checkDatabaseSize();
    res.json(result);
  } catch (err) {
    console.error('Database check error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/v1/health/ingestion
 * Check data ingestion status
 */
router.get('/ingestion', async (req, res) => {
  try {
    const result = await checkDataIngestion();
    res.json(result);
  } catch (err) {
    console.error('Ingestion check error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/v1/health/alerts
 * Get alert history
 */
router.get('/alerts', (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '50', 10);
    const alerts = getAlertHistory(limit);
    res.json({
      count: alerts.length,
      alerts
    });
  } catch (err) {
    console.error('Alert history error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/v1/health/alerts
 * Clear alert history
 */
router.delete('/alerts', (req, res) => {
  try {
    clearAlertHistory();
    res.json({ message: 'Alert history cleared' });
  } catch (err) {
    console.error('Clear alerts error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
