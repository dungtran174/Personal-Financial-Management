// backend/routes/financeRoutes.js
const express = require('express');
const { testConnection } = require('../controllers/financeController');

const router = express.Router();

router.get('/test', testConnection);

module.exports = router;
