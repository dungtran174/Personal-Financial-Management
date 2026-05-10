const pool = require('../config/pg');

async function checkAssetsSchema() {
  try {
    const { rows } = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'assets' 
      ORDER BY ordinal_position
    `);
    
    console.log('Assets table columns:');
    rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type}`);
    });
    
    // Sample data
    const sample = await pool.query('SELECT * FROM assets LIMIT 3');
    console.log('\nSample assets:');
    sample.rows.forEach(row => {
      console.log(`  ${row.symbol}: ${row.name} (${row.asset_type})`);
    });
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

checkAssetsSchema();
