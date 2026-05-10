/**
 * Fix Vietnam Stock Names Encoding
 * 
 * Updates the 'name' field for all VN stocks to fix encoding issues
 * Reads from vietnam_tickers_checked.csv and updates existing records
 */

const fs = require('fs');
const path = require('path');
const pool = require('../config/pg');

async function fixVNStockNames() {
  console.log('\n🔧 Fixing Vietnam stock names encoding...\n');
  
  const csvPath = path.join(__dirname, 'vietnam_tickers_checked.csv');
  
  if (!fs.existsSync(csvPath)) {
    console.error('❌ CSV file not found:', csvPath);
    process.exit(1);
  }
  
  try {
    // Read CSV with UTF-8 encoding
    const csvData = fs.readFileSync(csvPath, { encoding: 'utf-8' });
    const lines = csvData.split('\n');
    
    let updateCount = 0;
    let errorCount = 0;
    let notFoundCount = 0;
    
    console.log(`📊 Processing ${lines.length - 1} symbols...\n`);
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Parse CSV line - handle commas in name field
      const parts = line.split(',');
      const symbol = parts[0];
      const name = parts.slice(1, -2).join(','); // Handle commas in name
      const exchange = parts[parts.length - 2];
      const add_to_asset = parts[parts.length - 1];
      
      if (!symbol || !name) continue;
      
      try {
        // Update existing record
        const result = await pool.query(`
          UPDATE assets
          SET name = $1
          WHERE symbol = $2
          RETURNING id, symbol
        `, [name.trim(), symbol.trim()]);
        
        if (result.rowCount > 0) {
          updateCount++;
          if (updateCount % 50 === 0) {
            console.log(`✅ Updated ${updateCount} records...`);
          }
        } else {
          notFoundCount++;
          console.log(`⚠️  Not found: ${symbol.trim()}`);
        }
        
      } catch (err) {
        errorCount++;
        console.error(`❌ Error updating ${symbol}:`, err.message);
      }
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log('📊 Summary:');
    console.log(`   ✅ Updated: ${updateCount}`);
    console.log(`   ⚠️  Not found: ${notFoundCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log(`${'='.repeat(60)}\n`);
    
  } catch (err) {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  }
}

// Run
fixVNStockNames()
  .then(() => {
    console.log('✅ Done!');
    pool.end();
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Failed:', err);
    pool.end();
    process.exit(1);
  });
