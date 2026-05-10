const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const {
    getWatchlist,
    addToWatchlist,
    updateStarredStatus,
    removeFromWatchlist
} = require("../controllers/watchlistController");

const router = express.Router();

router.get("/", protect, getWatchlist);
router.post("/add", protect, addToWatchlist);
router.patch("/star", protect, updateStarredStatus);
router.delete("/remove/:symbol", protect, removeFromWatchlist);

module.exports = router;
