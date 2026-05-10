const express = require("express");
const router = express.Router();
const pool = require("../config/pg");

router.get("/db-stats", async (req, res) => {
  try {
    // Tổng số Asset
    const totalAssets = await pool.query("SELECT COUNT(*) FROM assets");

    // Số lượng Asset theo loại
    const byType = await pool.query(`
      SELECT asset_type, COUNT(*) 
      FROM assets 
      GROUP BY asset_type
      ORDER BY COUNT(*) DESC
    `);

    // Tổng số dòng OHLCV
    const totalOHLCV = await pool.query("SELECT COUNT(*) FROM price_ohlcv");

    // Top 10 asset có nhiều dữ liệu nhất
    const topAssets = await pool.query(`
      SELECT a.symbol, a.asset_type, COUNT(*) AS candles
      FROM price_ohlcv p
      JOIN assets a ON p.asset_id = a.id
      GROUP BY a.id
      ORDER BY candles DESC
      LIMIT 10
    `);

    // 5 dòng OHLCV mới nhất
    const recent = await pool.query(`
      SELECT a.symbol, p.ts, p.open, p.close 
      FROM price_ohlcv p
      JOIN assets a ON p.asset_id = a.id
      ORDER BY p.ts DESC
      LIMIT 5
    `);

    res.json({
      total_assets: Number(totalAssets.rows[0].count),
      assets_by_type: byType.rows,
      total_ohlcv: Number(totalOHLCV.rows[0].count),
      top_assets_by_candles: topAssets.rows,
      recent_ohlcv: recent.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
