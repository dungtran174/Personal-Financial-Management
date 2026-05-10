// backend\services\utils\upsertAsset.js
const pool = require('../../config/pg');

async function upsertAsset(symbol, exchange, assetType, name, currency, metadata = {}) {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `INSERT INTO assets (symbol, exchange, asset_type, name, currency, metadata)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (symbol) DO UPDATE
       SET exchange = EXCLUDED.exchange,
           asset_type = EXCLUDED.asset_type,
           name = EXCLUDED.name,
           currency = EXCLUDED.currency,
           metadata = EXCLUDED.metadata
       RETURNING id`,
      [symbol, exchange, assetType, name, currency, metadata]
    );
    return res.rows[0].id;
  } finally {
    client.release();
  }
}

module.exports = upsertAsset;
