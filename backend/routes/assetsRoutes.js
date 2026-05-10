// backend/routes/assetsRoutes.js
const express = require('express');
const { 
  searchAssets, 
  getAssetBySymbol,
  getSimilarAssets 
} = require('../controllers/assetsController');

const router = express.Router();

// Search assets (autocomplete)
router.get('/', searchAssets);

// Get similar assets
router.get('/:symbol/similar', getSimilarAssets);

// Get asset by symbol (must be last to avoid conflict)
router.get('/:symbol', getAssetBySymbol);

module.exports = router;
