/**
 * Health Monitoring Service
 * Monitors database health, chunk growth, continuous aggregate lag, and job status
 */

const pool = require('../config/pg');

/**
 * Check TimescaleDB chunk health
 * Returns chunk count, sizes, and growth rate
 */
async function checkChunkHealth() {
  const query = `
    SELECT 
      c.hypertable_name,
      COUNT(*) as total_chunks,
      COUNT(*) FILTER (WHERE c.is_compressed = TRUE) as compressed_chunks,
      COUNT(*) FILTER (WHERE c.is_compressed = FALSE) as uncompressed_chunks,
      pg_size_pretty(SUM(pg_total_relation_size(format('%I.%I', c.chunk_schema, c.chunk_name)::regclass))) as total_size,
      pg_size_pretty(SUM(pg_total_relation_size(format('%I.%I', c.chunk_schema, c.chunk_name)::regclass)) 
        FILTER (WHERE c.is_compressed = FALSE)) as uncompressed_size,
      MIN(c.range_start) as oldest_chunk,
      MAX(c.range_end) as newest_chunk,
      AVG(pg_total_relation_size(format('%I.%I', c.chunk_schema, c.chunk_name)::regclass)) as avg_chunk_size
    FROM timescaledb_information.chunks c
    WHERE c.hypertable_name = 'price_ticks'
    GROUP BY c.hypertable_name;
  `;
  
  const { rows } = await pool.query(query);
  
  if (rows.length === 0) {
    return {
      status: 'warning',
      message: 'No chunks found',
      data: null
    };
  }
  
  const chunk = rows[0];
  
  // Calculate chunk growth rate (chunks per day)
  const oldestDate = new Date(chunk.oldest_chunk);
  const newestDate = new Date(chunk.newest_chunk);
  const daysDiff = (newestDate - oldestDate) / (1000 * 60 * 60 * 24);
  const chunksPerDay = daysDiff > 0 ? chunk.total_chunks / daysDiff : 0;
  
  // Compression ratio
  const compressionRatio = chunk.total_chunks > 0 
    ? (chunk.compressed_chunks / chunk.total_chunks * 100).toFixed(1)
    : 0;
  
  // Health status
  let status = 'healthy';
  const warnings = [];
  
  // Check if uncompressed chunks are growing too fast
  if (chunk.uncompressed_chunks > 100) {
    status = 'warning';
    warnings.push(`High uncompressed chunk count: ${chunk.uncompressed_chunks}`);
  }
  
  // Check if compression ratio is too low
  if (chunk.total_chunks > 50 && compressionRatio < 50) {
    status = 'warning';
    warnings.push(`Low compression ratio: ${compressionRatio}%`);
  }
  
  return {
    status,
    warnings,
    data: {
      total_chunks: parseInt(chunk.total_chunks),
      compressed_chunks: parseInt(chunk.compressed_chunks),
      uncompressed_chunks: parseInt(chunk.uncompressed_chunks),
      compression_ratio: `${compressionRatio}%`,
      total_size: chunk.total_size,
      uncompressed_size: chunk.uncompressed_size,
      oldest_chunk: chunk.oldest_chunk,
      newest_chunk: chunk.newest_chunk,
      chunks_per_day: chunksPerDay.toFixed(2),
      avg_chunk_size_mb: (chunk.avg_chunk_size / (1024 * 1024)).toFixed(2)
    }
  };
}

/**
 * Check continuous aggregate lag
 * Returns how far behind the aggregates are from raw data
 */
async function checkAggregatesLag() {
  const query = `
    SELECT 
      ca.view_name,
      ca.materialization_hypertable_name,
      pg_size_pretty(pg_total_relation_size(ca.view_name::regclass)) as size
    FROM timescaledb_information.continuous_aggregates ca
    WHERE ca.view_name LIKE 'price_ohlcv%'
    ORDER BY ca.view_name;
  `;
  
  const { rows } = await pool.query(query);
  
  if (rows.length === 0) {
    return {
      status: 'warning',
      message: 'No continuous aggregates found',
      data: []
    };
  }
  
  let status = 'healthy';
  const warnings = [];
  const aggregates = [];
  
  // Check last refresh time for each continuous aggregate
  for (const row of rows) {
    // Get last refresh time from job_stats
    const refreshQuery = `
      SELECT 
        js.last_successful_finish,
        NOW() - js.last_successful_finish as lag
      FROM timescaledb_information.jobs j
      LEFT JOIN timescaledb_information.job_stats js ON j.job_id = js.job_id
      WHERE j.proc_name = 'policy_refresh_continuous_aggregate'
      AND j.config->>'mat_hypertable_id' = (
        SELECT oid::text FROM pg_class WHERE relname = $1
      )
      ORDER BY js.last_successful_finish DESC
      LIMIT 1;
    `;
    
    let lagInfo = { lagSeconds: 0, lagMinutes: 0, lastRefresh: null };
    
    try {
      const refreshResult = await pool.query(refreshQuery, [row.materialization_hypertable_name]);
      if (refreshResult.rows[0] && refreshResult.rows[0].lag) {
        const lagMs = refreshResult.rows[0].lag;
        lagInfo.lagSeconds = Math.floor(lagMs / 1000);
        lagInfo.lagMinutes = lagInfo.lagSeconds / 60;
        lagInfo.lastRefresh = refreshResult.rows[0].last_successful_finish;
      }
    } catch (err) {
      // Ignore error, just skip lag info
      console.error(`Warning: Could not get lag for ${row.view_name}:`, err.message);
    }
    
    let aggStatus = 'healthy';
    
    // Warning if lag > 5 minutes
    if (lagInfo.lagMinutes > 5) {
      aggStatus = 'warning';
      status = 'warning';
      warnings.push(`${row.view_name}: lag ${lagInfo.lagMinutes.toFixed(1)} minutes`);
    }
    
    // Critical if lag > 30 minutes
    if (lagInfo.lagMinutes > 30) {
      aggStatus = 'critical';
      status = 'critical';
    }
    
    aggregates.push({
      view_name: row.view_name,
      size: row.size,
      last_refresh: lagInfo.lastRefresh,
      lag_seconds: lagInfo.lagSeconds.toFixed(0),
      lag_minutes: lagInfo.lagMinutes.toFixed(1),
      status: aggStatus
    });
  }
  
  return {
    status,
    warnings,
    data: aggregates
  };
}

/**
 * Check TimescaleDB job status
 * Returns status of compression, retention, and refresh policies
 */
async function checkJobStatus() {
  const query = `
    SELECT 
      j.job_id,
      j.application_name,
      j.schedule_interval,
      j.proc_name,
      j.hypertable_name,
      j.config,
      j.scheduled,
      j.next_start,
      js.last_run_started_at,
      js.last_run_status,
      js.last_run_duration,
      js.total_runs,
      js.total_successes,
      js.total_failures
    FROM timescaledb_information.jobs j
    LEFT JOIN timescaledb_information.job_stats js ON j.job_id = js.job_id
    WHERE j.hypertable_name = 'price_ticks' 
       OR j.proc_name = 'policy_refresh_continuous_aggregate'
    ORDER BY j.proc_name, j.job_id;
  `;
  
  const { rows } = await pool.query(query);
  
  if (rows.length === 0) {
    return {
      status: 'warning',
      message: 'No jobs found',
      data: []
    };
  }
  
  let status = 'healthy';
  const warnings = [];
  const jobs = [];
  
  for (const row of rows) {
    let jobStatus = 'healthy';
    
    // Check if job is scheduled but never ran
    if (row.scheduled && !row.last_run_started_at) {
      jobStatus = 'warning';
      warnings.push(`${row.proc_name} never executed`);
    }
    
    // Check if last run failed
    if (row.last_run_status === 'Failed') {
      jobStatus = 'critical';
      status = 'critical';
      warnings.push(`${row.proc_name} failed`);
    }
    
    // Check failure rate
    const failureRate = row.total_runs > 0 
      ? (row.total_failures / row.total_runs * 100).toFixed(1)
      : 0;
    
    if (parseFloat(failureRate) > 10) {
      jobStatus = 'warning';
      status = 'warning';
      warnings.push(`${row.proc_name} high failure rate: ${failureRate}%`);
    }
    
    jobs.push({
      job_id: row.job_id,
      type: row.proc_name,
      hypertable: row.hypertable_name || 'N/A',
      schedule_interval: row.schedule_interval,
      scheduled: row.scheduled,
      next_start: row.next_start,
      last_run: row.last_run_started_at,
      last_status: row.last_run_status || 'Never run',
      last_duration: row.last_run_duration,
      total_runs: row.total_runs,
      success_rate: row.total_runs > 0 
        ? `${((row.total_successes / row.total_runs) * 100).toFixed(1)}%`
        : 'N/A',
      status: jobStatus
    });
  }
  
  return {
    status,
    warnings,
    data: jobs
  };
}

/**
 * Check database size and growth
 */
async function checkDatabaseSize() {
  const query = `
    SELECT 
      pg_database.datname,
      pg_size_pretty(pg_database_size(pg_database.datname)) as size,
      pg_database_size(pg_database.datname) as size_bytes
    FROM pg_database
    WHERE datname = current_database();
  `;
  
  const { rows } = await pool.query(query);
  
  if (rows.length === 0) {
    return {
      status: 'error',
      message: 'Could not get database size',
      data: null
    };
  }
  
  const db = rows[0];
  const sizeGB = db.size_bytes / (1024 * 1024 * 1024);
  
  let status = 'healthy';
  const warnings = [];
  
  // Warning if DB > 50GB
  if (sizeGB > 50) {
    status = 'warning';
    warnings.push(`Large database size: ${sizeGB.toFixed(2)} GB`);
  }
  
  // Critical if DB > 100GB
  if (sizeGB > 100) {
    status = 'critical';
    warnings.push(`Critical database size: ${sizeGB.toFixed(2)} GB`);
  }
  
  return {
    status,
    warnings,
    data: {
      database: db.datname,
      size: db.size,
      size_gb: sizeGB.toFixed(2)
    }
  };
}

/**
 * Check recent data ingestion
 * Returns last tick timestamp for each asset type
 */
async function checkDataIngestion() {
  const query = `
    SELECT 
      a.asset_type,
      COUNT(DISTINCT a.id) as asset_count,
      MAX(pt.ts) as last_tick,
      NOW() - MAX(pt.ts) as staleness
    FROM assets a
    LEFT JOIN price_ticks pt ON a.id = pt.asset_id
    WHERE a.status = 'OK'
    GROUP BY a.asset_type
    ORDER BY a.asset_type;
  `;
  
  const { rows } = await pool.query(query);
  
  if (rows.length === 0) {
    return {
      status: 'warning',
      message: 'No data ingestion found',
      data: []
    };
  }
  
  let status = 'healthy';
  const warnings = [];
  const ingestion = [];
  
  for (const row of rows) {
    const stalenessMinutes = row.staleness 
      ? parseFloat(row.staleness.minutes || 0)
      : null;
    
    let ingestionStatus = 'healthy';
    
    // Warning if data is > 1 hour old
    if (stalenessMinutes && stalenessMinutes > 60) {
      ingestionStatus = 'warning';
      status = 'warning';
      warnings.push(`${row.asset_type} data is ${(stalenessMinutes / 60).toFixed(1)}h old`);
    }
    
    // Critical if data is > 24 hours old
    if (stalenessMinutes && stalenessMinutes > 1440) {
      ingestionStatus = 'critical';
      status = 'critical';
    }
    
    ingestion.push({
      asset_type: row.asset_type,
      asset_count: parseInt(row.asset_count),
      last_tick: row.last_tick,
      staleness_minutes: stalenessMinutes ? stalenessMinutes.toFixed(0) : 'N/A',
      status: ingestionStatus
    });
  }
  
  return {
    status,
    warnings,
    data: ingestion
  };
}

/**
 * Get comprehensive health report
 */
async function getHealthReport() {
  console.log('\n🏥 Running health checks...\n');
  
  const report = {
    timestamp: new Date().toISOString(),
    overall_status: 'healthy',
    checks: {}
  };
  
  const allWarnings = [];
  
  try {
    // Chunk health
    console.log('📦 Checking chunk health...');
    report.checks.chunks = await checkChunkHealth();
    if (report.checks.chunks.warnings) {
      allWarnings.push(...report.checks.chunks.warnings);
    }
    
    // Aggregate lag
    console.log('📊 Checking aggregate lag...');
    report.checks.aggregates = await checkAggregatesLag();
    if (report.checks.aggregates.warnings) {
      allWarnings.push(...report.checks.aggregates.warnings);
    }
    
    // Job status
    console.log('⚙️  Checking job status...');
    report.checks.jobs = await checkJobStatus();
    if (report.checks.jobs.warnings) {
      allWarnings.push(...report.checks.jobs.warnings);
    }
    
    // Database size
    console.log('💾 Checking database size...');
    report.checks.database = await checkDatabaseSize();
    if (report.checks.database.warnings) {
      allWarnings.push(...report.checks.database.warnings);
    }
    
    // Data ingestion
    console.log('🔄 Checking data ingestion...');
    report.checks.ingestion = await checkDataIngestion();
    if (report.checks.ingestion.warnings) {
      allWarnings.push(...report.checks.ingestion.warnings);
    }
    
    // Determine overall status
    const statuses = Object.values(report.checks).map(c => c.status);
    
    if (statuses.includes('critical')) {
      report.overall_status = 'critical';
    } else if (statuses.includes('warning')) {
      report.overall_status = 'warning';
    } else if (statuses.includes('error')) {
      report.overall_status = 'error';
    }
    
    report.warnings = allWarnings;
    
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('🏥 Health Report Summary');
    console.log('='.repeat(60));
    console.log(`Overall Status: ${report.overall_status.toUpperCase()}`);
    
    if (allWarnings.length > 0) {
      console.log(`\n⚠️  Warnings (${allWarnings.length}):`);
      allWarnings.forEach(w => console.log(`   - ${w}`));
    } else {
      console.log('\n✅ All checks passed');
    }
    
    console.log('='.repeat(60) + '\n');
    
  } catch (err) {
    console.error('❌ Health check failed:', err.message);
    report.overall_status = 'error';
    report.error = err.message;
  }
  
  return report;
}

/**
 * Run periodic health checks
 */
function startHealthMonitoring(intervalMinutes = 30) {
  console.log(`🏥 Starting health monitoring (every ${intervalMinutes} minutes)`);
  
  // Run immediately
  getHealthReport();
  
  // Schedule periodic checks
  const interval = setInterval(async () => {
    await getHealthReport();
  }, intervalMinutes * 60 * 1000);
  
  return interval;
}

module.exports = {
  checkChunkHealth,
  checkAggregatesLag,
  checkJobStatus,
  checkDatabaseSize,
  checkDataIngestion,
  getHealthReport,
  startHealthMonitoring
};

// Run if called directly
if (require.main === module) {
  getHealthReport()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    })
    .finally(() => pool.end());
}
