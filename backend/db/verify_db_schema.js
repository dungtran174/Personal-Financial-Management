/**
 * Database Schema Verification Script
 * Kiểm tra xem database hiện tại có khớp với schema/migrations không
 * 
 * Usage: node backend/db/verify_db_schema.js
 */

const pool = require('../config/pg');

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(color, symbol, message) {
  console.log(`${color}${symbol}${COLORS.reset} ${message}`);
}

async function checkTimescaleDB() {
  console.log('\n' + '='.repeat(60));
  console.log('📦 TIMESCALEDB EXTENSION');
  console.log('='.repeat(60));

  try {
    const { rows } = await pool.query(
      "SELECT extversion FROM pg_extension WHERE extname = 'timescaledb'"
    );
    
    if (rows.length === 0) {
      log(COLORS.red, '❌', 'TimescaleDB extension NOT installed!');
      return false;
    }
    
    log(COLORS.green, '✅', `TimescaleDB version: ${rows[0].extversion}`);
    return true;
  } catch (err) {
    log(COLORS.red, '❌', `Error checking TimescaleDB: ${err.message}`);
    return false;
  }
}

async function checkTables() {
  console.log('\n' + '='.repeat(60));
  console.log('📋 REQUIRED TABLES');
  console.log('='.repeat(60));

  const requiredTables = ['assets', 'price_ohlcv', 'price_ticks'];
  const results = {};

  for (const table of requiredTables) {
    try {
      const { rows } = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_name = $1
        ORDER BY ordinal_position
      `, [table]);

      if (rows.length === 0) {
        log(COLORS.red, '❌', `Table '${table}' NOT found!`);
        results[table] = null;
      } else {
        log(COLORS.green, '✅', `Table '${table}' exists (${rows.length} columns)`);
        results[table] = rows;
      }
    } catch (err) {
      log(COLORS.red, '❌', `Error checking table '${table}': ${err.message}`);
      results[table] = null;
    }
  }

  return results;
}

async function checkHypertables() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 HYPERTABLES (TimescaleDB)');
  console.log('='.repeat(60));

  try {
    const { rows } = await pool.query(`
      SELECT hypertable_name, num_chunks, compression_enabled
      FROM timescaledb_information.hypertables
      WHERE hypertable_schema = 'public'
    `);

    const expectedHypertables = ['price_ohlcv', 'price_ticks'];
    const found = rows.map(r => r.hypertable_name);

    for (const ht of expectedHypertables) {
      if (found.includes(ht)) {
        const info = rows.find(r => r.hypertable_name === ht);
        log(COLORS.green, '✅', `Hypertable '${ht}': ${info.num_chunks} chunks, compression=${info.compression_enabled}`);
      } else {
        log(COLORS.red, '❌', `Hypertable '${ht}' NOT found!`);
      }
    }

    return rows;
  } catch (err) {
    log(COLORS.red, '❌', `Error checking hypertables: ${err.message}`);
    return [];
  }
}

async function checkContinuousAggregates() {
  console.log('\n' + '='.repeat(60));
  console.log('📈 CONTINUOUS AGGREGATES (Views)');
  console.log('='.repeat(60));

  const expectedViews = ['price_ohlcv_1m', 'price_ohlcv_5m', 'price_ohlcv_15m', 'price_ohlcv_1h', 'price_ohlcv_4h'];

  try {
    const { rows } = await pool.query(`
      SELECT 
        view_name,
        materialized_only,
        compression_enabled,
        materialization_hypertable_schema,
        materialization_hypertable_name
      FROM timescaledb_information.continuous_aggregates
      WHERE view_schema = 'public'
    `);

    const found = rows.map(r => r.view_name);
    const issues = [];

    for (const view of expectedViews) {
      if (found.includes(view)) {
        const info = rows.find(r => r.view_name === view);
        log(COLORS.green, '✅', `View '${view}': materialized_only=${info.materialized_only}`);
      } else {
        log(COLORS.red, '❌', `View '${view}' NOT found!`);
        issues.push(`Missing view: ${view}`);
      }
    }

    // Check for extra views
    for (const row of rows) {
      if (!expectedViews.includes(row.view_name)) {
        log(COLORS.yellow, '⚠️', `Extra view found: '${row.view_name}'`);
      }
    }

    return { views: rows, issues };
  } catch (err) {
    log(COLORS.red, '❌', `Error checking continuous aggregates: ${err.message}`);
    return { views: [], issues: [err.message] };
  }
}

async function checkRefreshPolicies() {
  console.log('\n' + '='.repeat(60));
  console.log('🔄 REFRESH POLICIES');
  console.log('='.repeat(60));

  try {
    const { rows } = await pool.query(`
      SELECT 
        j.job_id,
        j.hypertable_name,
        j.schedule_interval,
        j.config
      FROM timescaledb_information.jobs j
      WHERE j.proc_name = 'policy_refresh_continuous_aggregate'
      ORDER BY j.job_id
    `);

    if (rows.length === 0) {
      log(COLORS.red, '❌', 'No refresh policies found!');
      return { policies: [], issues: ['No refresh policies'] };
    }

    const issues = [];
    
    for (const row of rows) {
      const config = row.config;
      const startOffset = config.start_offset;
      const endOffset = config.end_offset;
      
      // Check for problematic short start_offset
      if (startOffset && startOffset.includes(':') && !startOffset.includes('day')) {
        // This is a time-based offset like "00:20:00" (20 minutes)
        const parts = startOffset.split(':');
        const hours = parseInt(parts[0]) || 0;
        const minutes = parseInt(parts[1]) || 0;
        const totalMinutes = hours * 60 + minutes;
        
        if (totalMinutes < 60) {
          log(COLORS.red, '❌', `Job ${row.job_id} (${row.hypertable_name}): start_offset=${startOffset} TOO SHORT!`);
          issues.push(`Job ${row.job_id}: start_offset too short (${startOffset})`);
        } else {
          log(COLORS.yellow, '⚠️', `Job ${row.job_id} (${row.hypertable_name}): start_offset=${startOffset}, end_offset=${endOffset}`);
        }
      } else {
        log(COLORS.green, '✅', `Job ${row.job_id}: start_offset=${startOffset}, end_offset=${endOffset}`);
      }
    }

    return { policies: rows, issues };
  } catch (err) {
    log(COLORS.red, '❌', `Error checking refresh policies: ${err.message}`);
    return { policies: [], issues: [err.message] };
  }
}

async function checkCompressionPolicy() {
  console.log('\n' + '='.repeat(60));
  console.log('🗜️  COMPRESSION POLICY');
  console.log('='.repeat(60));

  try {
    const { rows } = await pool.query(`
      SELECT 
        j.job_id,
        j.hypertable_name,
        j.schedule_interval,
        j.config
      FROM timescaledb_information.jobs j
      WHERE j.proc_name = 'policy_compression'
    `);

    if (rows.length === 0) {
      log(COLORS.yellow, '⚠️', 'No compression policy found');
      return null;
    }

    for (const row of rows) {
      log(COLORS.green, '✅', `Compression on '${row.hypertable_name}': ${JSON.stringify(row.config)}`);
    }

    return rows;
  } catch (err) {
    log(COLORS.red, '❌', `Error checking compression: ${err.message}`);
    return null;
  }
}

async function checkRetentionPolicy() {
  console.log('\n' + '='.repeat(60));
  console.log('🗑️  RETENTION POLICY');
  console.log('='.repeat(60));

  try {
    const { rows } = await pool.query(`
      SELECT 
        j.job_id,
        j.hypertable_name,
        j.schedule_interval,
        j.config
      FROM timescaledb_information.jobs j
      WHERE j.proc_name = 'policy_retention'
    `);

    if (rows.length === 0) {
      log(COLORS.yellow, '⚠️', 'No retention policy found');
      return null;
    }

    for (const row of rows) {
      log(COLORS.green, '✅', `Retention on '${row.hypertable_name}': ${JSON.stringify(row.config)}`);
    }

    return rows;
  } catch (err) {
    log(COLORS.red, '❌', `Error checking retention: ${err.message}`);
    return null;
  }
}

async function checkDataStats() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 DATA STATISTICS');
  console.log('='.repeat(60));

  try {
    // Assets count
    const assetsResult = await pool.query('SELECT COUNT(*) as count FROM assets');
    log(COLORS.blue, '📌', `Assets: ${assetsResult.rows[0].count} records`);

    // Price ticks by date
    const ticksResult = await pool.query(`
      SELECT 
        DATE(ts) as date,
        COUNT(*) as count
      FROM price_ticks
      GROUP BY DATE(ts)
      ORDER BY date DESC
      LIMIT 7
    `);

    console.log('\n   Price ticks by date (last 7 days):');
    if (ticksResult.rows.length === 0) {
      log(COLORS.yellow, '   ⚠️', 'No tick data found');
    } else {
      for (const row of ticksResult.rows) {
        console.log(`   ${row.date}: ${row.count.toLocaleString()} ticks`);
      }
    }

    // Check views data
    const views = ['price_ohlcv_1m', 'price_ohlcv_5m', 'price_ohlcv_1h'];
    console.log('\n   Continuous aggregate data:');
    
    for (const view of views) {
      try {
        const result = await pool.query(`
          SELECT COUNT(*) as count, MIN(ts) as min_ts, MAX(ts) as max_ts
          FROM ${view}
        `);
        const row = result.rows[0];
        if (row.count > 0) {
          console.log(`   ${view}: ${parseInt(row.count).toLocaleString()} candles (${row.min_ts?.toISOString().split('T')[0]} to ${row.max_ts?.toISOString().split('T')[0]})`);
        } else {
          log(COLORS.yellow, `   ⚠️`, `${view}: No data`);
        }
      } catch (err) {
        log(COLORS.red, `   ❌`, `${view}: Error - ${err.message}`);
      }
    }

    return true;
  } catch (err) {
    log(COLORS.red, '❌', `Error checking data stats: ${err.message}`);
    return false;
  }
}

async function checkIndexes() {
  console.log('\n' + '='.repeat(60));
  console.log('🔍 INDEXES');
  console.log('='.repeat(60));

  const expectedIndexes = [
    'idx_assets_symbol',
    'idx_ohlcv_asset_ts',
    'idx_ticks_asset_ts',
    'idx_ohlcv_1m_asset_ts',
    'idx_ohlcv_5m_asset_ts',
    'idx_ohlcv_15m_asset_ts',
    'idx_ohlcv_1h_asset_ts',
    'idx_ohlcv_4h_asset_ts'
  ];

  try {
    const { rows } = await pool.query(`
      SELECT indexname, tablename
      FROM pg_indexes
      WHERE schemaname = 'public'
      AND indexname LIKE 'idx_%'
      ORDER BY indexname
    `);

    const found = rows.map(r => r.indexname);

    for (const idx of expectedIndexes) {
      if (found.includes(idx)) {
        log(COLORS.green, '✅', `Index '${idx}'`);
      } else {
        log(COLORS.yellow, '⚠️', `Index '${idx}' NOT found`);
      }
    }

    return rows;
  } catch (err) {
    log(COLORS.red, '❌', `Error checking indexes: ${err.message}`);
    return [];
  }
}

async function generateReport() {
  console.log('\n' + '='.repeat(60));
  console.log('📋 VERIFICATION SUMMARY');
  console.log('='.repeat(60));

  const issues = [];
  const warnings = [];

  // Run all checks
  const tsdb = await checkTimescaleDB();
  if (!tsdb) issues.push('TimescaleDB not installed');

  await checkTables();
  await checkHypertables();
  
  const { issues: caIssues } = await checkContinuousAggregates();
  issues.push(...caIssues);

  const { issues: rpIssues } = await checkRefreshPolicies();
  issues.push(...rpIssues);

  await checkCompressionPolicy();
  await checkRetentionPolicy();
  await checkDataStats();
  await checkIndexes();

  // Final summary
  console.log('\n' + '='.repeat(60));
  console.log('🏁 FINAL RESULT');
  console.log('='.repeat(60));

  if (issues.length === 0) {
    log(COLORS.green, '✅', 'Database schema is VALID and matches expected configuration!');
  } else {
    log(COLORS.red, '❌', `Found ${issues.length} issue(s):`);
    issues.forEach((issue, i) => {
      console.log(`   ${i + 1}. ${issue}`);
    });
  }

  console.log('\n');
  return issues.length === 0;
}

async function main() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     DATABASE SCHEMA VERIFICATION                           ║');
  console.log('║     Comparing current DB with expected schema              ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    const isValid = await generateReport();
    process.exit(isValid ? 0 : 1);
  } catch (err) {
    console.error('\n❌ Fatal error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
