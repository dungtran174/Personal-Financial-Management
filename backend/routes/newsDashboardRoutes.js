const express = require("express");
const { getTickerBar } = require("../controllers/newsDashboardController");

const router = express.Router();

router.get("/get-bar", getTickerBar);

module.exports = router;
