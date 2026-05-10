/**
 * Market Routes - Tickers, Stats, Movers
 */

const express = require('express');
const {
  getTicker,
  getTickersBulk,
  getMarketMovers,
  getMarketStats,
  getTickerDetail,
  getVNGainers,
  getVNLosers,
  getTickerSummary
} = require('../controllers/marketController');
const { refreshExchangeRate, getExchangeRate } = require('../services/currencyConverter');

const router = express.Router();

// Single ticker with 24h stats
router.get('/ticker', getTicker);

// Ticker summary (formatted for specific UI requirements)
router.get('/summary', getTickerSummary);

// Detailed ticker with historical performance
router.get('/ticker-detail', getTickerDetail);

// Bulk tickers
router.get('/tickers', getTickersBulk);

// Market movers (gainers, losers, most active)
router.get('/movers', getMarketMovers);

// Vietnamese market movers
router.get('/vn-gainers', getVNGainers);
router.get('/vn-losers', getVNLosers);

// Overall market statistics
router.get('/stats', getMarketStats);

// Exchange rate utilities
router.get('/exchange-rate', async (req, res) => {
  try {
    const rate = await getExchangeRate();
    res.json({ 
      rate, 
      pair: 'USD/VND',
      timestamp: new Date().toISOString() 
    });
  } catch (err) {
    res.status(500).json({ error: 'failed', message: err.message });
  }
});

router.post('/exchange-rate/refresh', async (req, res) => {
  try {
    const rate = await refreshExchangeRate();
    res.json({ 
      success: true,
      rate, 
      pair: 'USD/VND',
      message: 'Exchange rate refreshed',
      timestamp: new Date().toISOString() 
    });
  } catch (err) {
    res.status(500).json({ error: 'failed', message: err.message });
  }
});

module.exports = router;
