// Check PostgreSQL configuration
const pool = require('./config/pg');

async function checkConfig() {
  try {
    console.log('📊 Checking PostgreSQL configuration...\n');
    
    // Check current settings
    const configs = [
      'max_locks_per_transaction',
      'shared_buffers',
      'max_connections',
      'work_mem',
      'maintenance_work_mem'
    ];
    
    for (const config of configs) {
      const { rows } = await pool.query(`SHOW ${config}`);
      console.log(`${config}: ${rows[0][config]}`);
    }
    
    console.log('\n📌 Recommendations for fixing "max_locks_per_transaction" error:');
    console.log('   Current default is usually 64');
    console.log('   For large datasets, increase to 128 or 256\n');
    
    console.log('🔧 To increase (requires restart):');
    console.log('   1. Find postgresql.conf location:');
    const { rows: dataDir } = await pool.query(`SHOW data_directory`);
    console.log(`      ${dataDir[0].data_directory}\\postgresql.conf`);
    console.log('\n   2. Edit postgresql.conf:');
    console.log('      max_locks_per_transaction = 256  # was 64');
    console.log('      shared_buffers = 256MB          # if needed');
    console.log('\n   3. Restart PostgreSQL service\n');
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

checkConfig();
