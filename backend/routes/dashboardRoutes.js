const express = require("express")
const { protect } = require("../middleware/authMiddleware");
const { getDashboardData } = require("../controllers/dashboardController");
const { getDashboardDataByTime } = require("../controllers/dashboardSearch");

const router = express.Router();

router.get("/", protect, getDashboardData);
router.get("/search", protect, getDashboardDataByTime);

module.exports = router;