/**
 * Run Database Migrations
 * Applies all SQL migration files in order
 * 
 * IMPORTANT: Some old migrations have incorrect configurations.
 * This script will skip deprecated migrations and only run the correct ones.
 * 
 * Migration order:
 * - 001_continuous_aggregates.sql (SKIP - superseded by 006)
 * - 002_add_price_ticks_pk.sql (RUN)
 * - 003_recreate_continuous_aggregates.sql (SKIP - has wrong start_offset!)
 * - 004_enable_compression.sql (SKIP - superseded by 006)
 * - 005_enable_retention.sql (SKIP - superseded by 006)
 * - 006_production_setup.sql (RUN - contains all correct configurations)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../config/pg');

// Migrations to SKIP (deprecated or have wrong configurations)
const SKIP_MIGRATIONS = [
  '001_continuous_aggregates.sql',      // Superseded by 006
  '003_recreate_continuous_aggregates.sql', // WRONG start_offset values!
  '004_enable_compression.sql',         // Superseded by 006
  '005_enable_retention.sql',           // Superseded by 006
];

// Recommended migration order
const RECOMMENDED_ORDER = [
  '002_add_price_ticks_pk.sql',
  '006_production_setup.sql',
];

async function runMigrations(options = {}) {
  const { skipDeprecated = true, forceAll = false } = options;
  
  console.log('🚀 Starting database migrations...\n');

  const migrationsDir = path.join(__dirname, 'migrations');
  
  // Check if migrations directory exists
  if (!fs.existsSync(migrationsDir)) {
    console.log('⚠️ No migrations directory found');
    return;
  }

  // Get all SQL files sorted
  let files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('⚠️ No migration files found');
    return;
  }

  console.log(`📁 Found ${files.length} migration(s) in directory:\n`);
  files.forEach((f, i) => {
    const isSkipped = SKIP_MIGRATIONS.includes(f);
    const status = isSkipped ? '⏭️  SKIP' : '▶️  RUN';
    console.log(`   ${i + 1}. ${f} ${skipDeprecated ? `[${status}]` : ''}`);
  });
  console.log('');

  // Filter out deprecated migrations unless forceAll is true
  if (skipDeprecated && !forceAll) {
    const originalCount = files.length;
    files = files.filter(f => !SKIP_MIGRATIONS.includes(f));
    console.log(`⚡ Skipping ${originalCount - files.length} deprecated migration(s)\n`);
  }

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');

    console.log(`📄 Running: ${file}...`);

    try {
      await pool.query(sql);
      console.log(`✅ ${file} completed\n`);
    } catch (err) {
      console.error(`❌ ${file} failed:`);
      console.error(err.message);
      
      // Check if error is about existing objects
      if (err.message.includes('already exists') || 
          err.message.includes('does not exist') ||
          err.message.includes('policy already exists')) {
        console.log('⚠️ Skipping (object already exists)\n');
        continue;
      }
      
      throw err;
    }
  }

  console.log('✅ All migrations completed successfully!\n');
}

async function verifyTimescaleDB() {
  console.log('🔍 Verifying TimescaleDB extension...\n');
  
  try {
    const { rows } = await pool.query(`
      SELECT extname, extversion 
      FROM pg_extension 
      WHERE extname = 'timescaledb'
    `);

    if (rows.length === 0) {
      console.log('❌ TimescaleDB extension not found!');
      console.log('   Run: CREATE EXTENSION IF NOT EXISTS timescaledb;\n');
      return false;
    }

    console.log(`✅ TimescaleDB ${rows[0].extversion} installed\n`);
    return true;
  } catch (err) {
    console.error('❌ Failed to verify TimescaleDB:', err.message);
    return false;
  }
}

async function verifyMigrations() {
  console.log('🔍 Verifying migrations...\n');

  const checks = [
    {
      name: 'price_ticks hypertable',
      query: `SELECT * FROM timescaledb_information.hypertables WHERE hypertable_name = 'price_ticks'`
    },
    {
      name: 'price_ohlcv_1m continuous aggregate',
      query: `SELECT * FROM timescaledb_information.continuous_aggregates WHERE view_name = 'price_ohlcv_1m'`
    },
    {
      name: 'price_ohlcv_5m continuous aggregate',
      query: `SELECT * FROM timescaledb_information.continuous_aggregates WHERE view_name = 'price_ohlcv_5m'`
    },
    {
      name: 'price_ohlcv_15m continuous aggregate',
      query: `SELECT * FROM timescaledb_information.continuous_aggregates WHERE view_name = 'price_ohlcv_15m'`
    },
    {
      name: 'price_ohlcv_1h continuous aggregate',
      query: `SELECT * FROM timescaledb_information.continuous_aggregates WHERE view_name = 'price_ohlcv_1h'`
    },
    {
      name: 'price_ohlcv_4h continuous aggregate',
      query: `SELECT * FROM timescaledb_information.continuous_aggregates WHERE view_name = 'price_ohlcv_4h'`
    }
  ];

  for (const check of checks) {
    try {
      const { rows } = await pool.query(check.query);
      if (rows.length > 0) {
        console.log(`✅ ${check.name}`);
      } else {
        console.log(`❌ ${check.name} - NOT FOUND`);
      }
    } catch (err) {
      console.log(`❌ ${check.name} - ERROR: ${err.message}`);
    }
  }

  console.log('');
  
  // Verify refresh policies have correct start_offset
  console.log('🔍 Verifying refresh policies (start_offset)...\n');
  
  const EXPECTED_OFFSETS = {
    'price_ohlcv_1m': '3 days',
    'price_ohlcv_5m': '7 days',
    'price_ohlcv_15m': '14 days',
    'price_ohlcv_1h': '30 days',
    'price_ohlcv_4h': '60 days',
  };
  
  try {
    const { rows } = await pool.query(`
      SELECT 
        ca.view_name,
        j.config->>'start_offset' as start_offset
      FROM timescaledb_information.jobs j
      JOIN timescaledb_information.continuous_aggregates ca 
        ON j.hypertable_name = ca.materialization_hypertable_name
      WHERE j.proc_name = 'policy_refresh_continuous_aggregate'
      ORDER BY ca.view_name
    `);
    
    for (const row of rows) {
      const expected = EXPECTED_OFFSETS[row.view_name];
      if (!expected) continue;
      
      const actual = row.start_offset;
      const isCorrect = actual === expected;
      
      if (isCorrect) {
        console.log(`✅ ${row.view_name}: start_offset = ${actual}`);
      } else {
        console.log(`❌ ${row.view_name}: start_offset = ${actual} (expected: ${expected})`);
      }
    }
  } catch (err) {
    console.log(`❌ Failed to verify refresh policies: ${err.message}`);
  }

  console.log('');
}

async function main() {
  try {
    const hasTimescaleDB = await verifyTimescaleDB();
    
    if (!hasTimescaleDB) {
      console.log('❌ Cannot proceed without TimescaleDB');
      process.exit(1);
    }

    await runMigrations();
    await verifyMigrations();

    console.log('🎉 Migration process complete!\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Migration failed:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { runMigrations, verifyTimescaleDB, verifyMigrations };
