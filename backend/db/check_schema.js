const pool = require('../config/pg');

async function checkSchema() {
  try {
    // Check TimescaleDB version
    const versionResult = await pool.query(
      "SELECT extversion FROM pg_extension WHERE extname = 'timescaledb'"
    );
    console.log('TimescaleDB version:', versionResult.rows[0]?.extversion);
    
    // Check chunks table columns
    console.log('\n📦 Chunks table columns:');
    const chunksColumns = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'timescaledb_information' 
      AND table_name = 'chunks' 
      ORDER BY column_name
    `);
    chunksColumns.rows.forEach(row => {
      console.log(`  - ${row.column_name} (${row.data_type})`);
    });
    
    // Check jobs table columns
    console.log('\n⚙️  Jobs table columns:');
    const jobsColumns = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'timescaledb_information' 
      AND table_name = 'jobs' 
      ORDER BY column_name
    `);
    jobsColumns.rows.forEach(row => {
      console.log(`  - ${row.column_name} (${row.data_type})`);
    });
    
    // Check hypertables table columns
    console.log('\n📊 Hypertables table columns:');
    const hyperColumns = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'timescaledb_information' 
      AND table_name = 'hypertables' 
      ORDER BY column_name
    `);
    hyperColumns.rows.forEach(row => {
      console.log(`  - ${row.column_name} (${row.data_type})`);
    });
    
    // Check job_stats table
    console.log('\n📈 Job stats table columns:');
    const jobStatsColumns = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'timescaledb_information' 
      AND table_name = 'job_stats' 
      ORDER BY column_name
    `);
    if (jobStatsColumns.rows.length > 0) {
      jobStatsColumns.rows.forEach(row => {
        console.log(`  - ${row.column_name} (${row.data_type})`);
      });
    } else {
      console.log('  (table not found)');
    }
    
    // Check compression-related tables
    console.log('\n🗜️  Compression-related tables:');
    const compressTables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'timescaledb_information' 
      AND table_name LIKE '%compress%' 
      ORDER BY table_name
    `);
    if (compressTables.rows.length > 0) {
      compressTables.rows.forEach(row => {
        console.log(`  - ${row.table_name}`);
      });
    } else {
      console.log('  (no tables found)');
    }
    
    // List all timescaledb_information tables
    console.log('\n📋 All timescaledb_information tables:');
    const allTables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'timescaledb_information' 
      ORDER BY table_name
    `);
    allTables.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

checkSchema();
