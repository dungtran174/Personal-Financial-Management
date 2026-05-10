// backend/routes/priceRoutes.js
const express = require('express');
const { getLatestPrice, getPriceHistory, getCandles } = require('../controllers/priceController');

const router = express.Router();

router.get('/latest', getLatestPrice);
router.get('/history', getPriceHistory); // Legacy endpoint
router.get('/candles', getCandles); // Standard TradingView-style endpoint

module.exports = router;
