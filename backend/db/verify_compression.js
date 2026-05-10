/**
 * Verify and Force Compression for TimescaleDB
 * Checks compression status and manually compresses chunks if needed
 */

const pool = require('../config/pg');

/**
 * Check compression settings
 */
async function checkCompressionSettings() {
  console.log('\n📊 Checking compression settings...\n');
  
  const query = `
    SELECT 
      hypertable_name,
      attname as column_name,
      segmentby_column_index,
      orderby_column_index,
      orderby_asc,
      orderby_nullsfirst
    FROM timescaledb_information.compression_settings
    WHERE hypertable_name = 'price_ticks'
    ORDER BY attname;
  `;
  
  const { rows } = await pool.query(query);
  
  if (rows.length === 0) {
    console.log('❌ No compression settings found!');
    console.log('   Run migration 004_enable_compression.sql first');
    return false;
  }
  
  console.log('✅ Compression is configured:');
  rows.forEach(row => {
    console.log(`   - ${row.column_name}: segmentby=${row.segmentby_column_index !== null}, orderby=${row.orderby_column_index !== null}`);
  });
  
  return true;
}

/**
 * Check compression policy
 */
async function checkCompressionPolicy() {
  console.log('\n📅 Checking compression policy...\n');
  
  const query = `
    SELECT 
      j.job_id,
      j.schedule_interval,
      j.config->>'compress_after' as compress_after,
      j.next_start,
      js.last_run_started_at,
      js.last_run_status
    FROM timescaledb_information.jobs j
    LEFT JOIN timescaledb_information.job_stats js ON j.job_id = js.job_id
    WHERE j.proc_name = 'policy_compression'
    AND j.hypertable_name = 'price_ticks';
  `;
  
  const { rows } = await pool.query(query);
  
  if (rows.length === 0) {
    console.log('❌ No compression policy found!');
    console.log('   Run migration 004_enable_compression.sql first');
    return false;
  }
  
  const policy = rows[0];
  console.log('✅ Compression policy active:');
  console.log(`   Job ID: ${policy.job_id}`);
  console.log(`   Compress after: ${policy.compress_after}`);
  console.log(`   Next run: ${policy.next_start}`);
  console.log(`   Last run: ${policy.last_run_started_at || 'Never'}`);
  console.log(`   Status: ${policy.last_run_status || 'Pending'}`);
  
  return true;
}

/**
 * Get compression statistics
 */
async function getCompressionStats() {
  console.log('\n📈 Compression statistics...\n');
  
  const query = `
    SELECT 
      c.chunk_schema,
      c.chunk_name,
      c.is_compressed,
      pg_size_pretty(pg_total_relation_size(format('%I.%I', c.chunk_schema, c.chunk_name)::regclass)) as chunk_size,
      c.range_start,
      c.range_end
    FROM timescaledb_information.chunks c
    WHERE c.hypertable_name = 'price_ticks'
    AND c.is_compressed = TRUE
    ORDER BY c.range_end DESC
    LIMIT 10;
  `;
  
  const { rows } = await pool.query(query);
  
  if (rows.length === 0) {
    console.log('⚠️  No compressed chunks yet');
    console.log('   Chunks are compressed automatically after 7 days');
    console.log('   Or use forceCompress() to compress manually');
    return;
  }
  
  console.log('✅ Compressed chunks:');
  console.log('');
  console.log('Chunk Name                              | Size       | Range Start         | Range End');
  console.log('--------------------------------------- | ---------- | ------------------- | -------------------');
  
  rows.forEach(row => {
    const start = new Date(row.range_start).toISOString().substring(0, 19);
    const end = new Date(row.range_end).toISOString().substring(0, 19);
    console.log(`${row.chunk_name.padEnd(39)} | ${row.chunk_size.padEnd(10)} | ${start} | ${end}`);
  });
  
  // Get summary stats
  const summaryQuery = `
    SELECT 
      COUNT(*) FILTER (WHERE is_compressed = TRUE) as compressed_count,
      COUNT(*) FILTER (WHERE is_compressed = FALSE) as uncompressed_count,
      pg_size_pretty(SUM(pg_total_relation_size(format('%I.%I', chunk_schema, chunk_name)::regclass)) 
        FILTER (WHERE is_compressed = TRUE)) as compressed_size,
      pg_size_pretty(SUM(pg_total_relation_size(format('%I.%I', chunk_schema, chunk_name)::regclass)) 
        FILTER (WHERE is_compressed = FALSE)) as uncompressed_size
    FROM timescaledb_information.chunks
    WHERE hypertable_name = 'price_ticks';
  `;
  
  const { rows: summary } = await pool.query(summaryQuery);
  if (summary[0]) {
    console.log('\n📊 Summary:');
    console.log(`   Compressed chunks: ${summary[0].compressed_count} (${summary[0].compressed_size})`);
    console.log(`   Uncompressed chunks: ${summary[0].uncompressed_count} (${summary[0].uncompressed_size})`);
  }
}

/**
 * List uncompressed chunks older than N days
 */
async function listUncompressedChunks(olderThanDays = 7) {
  console.log(`\n📦 Checking uncompressed chunks older than ${olderThanDays} days...\n`);
  
  const query = `
    SELECT 
      c.chunk_schema || '.' || c.chunk_name as chunk_name,
      c.range_start,
      c.range_end,
      pg_size_pretty(pg_total_relation_size(format('%I.%I', c.chunk_schema, c.chunk_name)::regclass)) as size,
      AGE(NOW(), c.range_end) as age
    FROM timescaledb_information.chunks c
    WHERE c.hypertable_name = 'price_ticks'
    AND c.is_compressed = FALSE
    AND c.range_end < NOW() - INTERVAL '${olderThanDays} days'
    ORDER BY c.range_end DESC;
  `;
  
  const { rows } = await pool.query(query);
  
  if (rows.length === 0) {
    console.log(`✅ No uncompressed chunks older than ${olderThanDays} days`);
    return [];
  }
  
  console.log(`⚠️  Found ${rows.length} uncompressed chunks:`);
  console.log('');
  rows.forEach(row => {
    console.log(`   ${row.chunk_name}`);
    console.log(`   Range: ${row.range_start} → ${row.range_end}`);
    console.log(`   Size: ${row.size}, Age: ${row.age}`);
    console.log('');
  });
  
  return rows;
}

/**
 * Force compress specific chunk
 */
async function compressChunk(chunkName) {
  console.log(`🔄 Compressing ${chunkName}...`);
  
  try {
    await pool.query(`SELECT compress_chunk('${chunkName}')`);
    console.log(`✅ ${chunkName} compressed successfully`);
    return true;
  } catch (err) {
    console.error(`❌ Failed to compress ${chunkName}:`, err.message);
    return false;
  }
}

/**
 * Force compress all old chunks
 */
async function forceCompressOldChunks(olderThanDays = 7) {
  console.log(`\n🚀 Force compressing chunks older than ${olderThanDays} days...\n`);
  
  const chunks = await listUncompressedChunks(olderThanDays);
  
  if (chunks.length === 0) {
    console.log('✅ Nothing to compress');
    return;
  }
  
  console.log(`Found ${chunks.length} chunks to compress\n`);
  
  let compressed = 0;
  let failed = 0;
  
  for (const chunk of chunks) {
    const success = await compressChunk(chunk.chunk_name);
    if (success) {
      compressed++;
    } else {
      failed++;
    }
    
    // Avoid hammering the DB
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log(`\n📊 Compression complete:`);
  console.log(`   Compressed: ${compressed}`);
  console.log(`   Failed: ${failed}`);
}

/**
 * Main verification function
 */
async function verifyCompression() {
  console.log('═'.repeat(60));
  console.log('🔍 TimescaleDB Compression Verification');
  console.log('═'.repeat(60));
  
  try {
    const settingsOk = await checkCompressionSettings();
    if (!settingsOk) {
      console.log('\n❌ Compression not configured. Run migration 004 first.');
      return;
    }
    
    const policyOk = await checkCompressionPolicy();
    if (!policyOk) {
      console.log('\n❌ Compression policy not found. Run migration 004 first.');
      return;
    }
    
    await getCompressionStats();
    await listUncompressedChunks(7);
    
    console.log('\n═'.repeat(60));
    console.log('✅ Compression verification complete');
    console.log('═'.repeat(60));
    console.log('\nTo manually compress old chunks, run:');
    console.log('  node backend/db/verify_compression.js --force');
    console.log('');
    
  } catch (err) {
    console.error('❌ Verification failed:', err.message);
    throw err;
  }
}

/**
 * CLI handler
 */
async function main() {
  const args = process.argv.slice(2);
  const forceCompress = args.includes('--force');
  
  try {
    if (forceCompress) {
      await forceCompressOldChunks(7);
    } else {
      await verifyCompression();
    }
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  checkCompressionSettings,
  checkCompressionPolicy,
  getCompressionStats,
  listUncompressedChunks,
  forceCompressOldChunks,
  verifyCompression,
  compressChunk
};
