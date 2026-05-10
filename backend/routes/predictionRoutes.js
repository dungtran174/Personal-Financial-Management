const express = require('express');
const router = express.Router();
const predictionController = require('../controllers/predictionController');
const { protect } = require('../middleware/authMiddleware');

// Health check endpoint (no auth required)
router.get('/health', predictionController.getHealth);

// Get prediction for a symbol (requires authentication)
router.get('/:symbol', protect, predictionController.getPrediction);

// Clear cache for a symbol (requires authentication)
router.delete('/cache/:symbol', protect, predictionController.clearPredictionCache);

module.exports = router;
