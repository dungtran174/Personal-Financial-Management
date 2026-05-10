// backend/services/utils/upsertOHLC.js
const pool = require('../../config/pg');

/**
 * Normalize a single row: accepts either { asset_id, ts, open,... }
 * or { symbol, ts, open,... } -> will resolve asset_id from DB.
 */
async function normalizeRow(row, client) {
  if (row.asset_id) return {
    asset_id: row.asset_id,
    ts: (row.ts instanceof Date) ? row.ts : new Date(row.ts),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: row.volume == null ? 0 : Number(row.volume)
  };

  if (!row.symbol) throw new Error('Row must have asset_id or symbol');

  // lookup asset_id by symbol
  const symbol = row.symbol.toUpperCase();
  // If client provided (inside transaction) use it, otherwise create query via pool
  const qClient = client || pool;
  const res = await qClient.query('SELECT id FROM assets WHERE symbol = $1 LIMIT 1', [symbol]);
  if (!res.rows[0]) {
    // symbol not found -> skip by returning null
    return null;
  }
  const asset_id = res.rows[0].id;
  return {
    asset_id,
    ts: (row.ts instanceof Date) ? row.ts : new Date(row.ts),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: row.volume == null ? 0 : Number(row.volume)
  };
}

/**
 * Upsert a batch of OHLC rows into price_ohlcv.
 * rows: array of { asset_id OR symbol, ts, open, high, low, close, volume }
 *
 * Returns number of rows inserted/updated.
 */
async function upsertOHLCBatch(rows) {
  if (!rows || rows.length === 0) return 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const q = `
      INSERT INTO price_ohlcv (asset_id, ts, open, high, low, close, volume)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (asset_id, ts) DO UPDATE
        SET open = EXCLUDED.open,
            high = EXCLUDED.high,
            low = EXCLUDED.low,
            close = EXCLUDED.close,
            volume = EXCLUDED.volume
    `;

    let count = 0;
    for (const r of rows) {
      const nr = await normalizeRow(r, client);
      if (!nr) {
        // symbol not present in assets table -> skip
        console.warn('skip upsertOHLCBatch: unknown symbol', r.symbol);
        continue;
      }
      await client.query(q, [
        nr.asset_id,
        nr.ts,
        nr.open,
        nr.high,
        nr.low,
        nr.close,
        nr.volume
      ]);
      count++;
    }

    await client.query('COMMIT');
    return count;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Convenience single-row upsert
 */
async function upsertOHLCRow(row) {
  const n = await upsertOHLCBatch([row]);
  return n;
}

module.exports = { upsertOHLCBatch, upsertOHLCRow };
