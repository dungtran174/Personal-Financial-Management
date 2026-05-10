const express = require("express");
const newsController = require("../controllers/newsController");

const router = express.Router();

// Endpoint lấy tin tức
router.get("/", newsController.getNews);

module.exports = router;
