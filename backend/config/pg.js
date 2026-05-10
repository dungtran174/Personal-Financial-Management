// backend/config/pg.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.PG_CONN || 'postgresql://postgres:postgres@127.0.0.1:5432/finance',
  // optional: max, idleTimeoutMillis
  max: 20,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('Unexpected PG error', err);
});

module.exports = pool;
