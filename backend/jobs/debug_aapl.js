
require('dotenv').config();
const pool = require('../config/pg');

async function debugAAPL() {
  try {
    const symbol = 'AAPL';
    const { rows } = await pool.query(`
      SELECT p.close, a.exchange, a.asset_type
      FROM price_ohlcv p 
      JOIN assets a ON a.id = p.asset_id 
      WHERE a.symbol = $1 
      ORDER BY p.ts DESC 
      LIMIT 1
    `, [symbol]);
    
    console.log(`Thông tin giá AAPL:`);
    console.table(rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

debugAAPL();
