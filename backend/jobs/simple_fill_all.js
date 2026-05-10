/**
 * SIMPLE FILL ALL - Memory-Efficient Gap Filling
 * 
 * Simplified version that processes assets one by one
 * without complex gap detection queries
 * 
 * Usage: node jobs/simple_fill_all.js
 */

const pool = require('../config/pg');
const { syncAsset } = require('./daily_ohlcv_sync');

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function simpleFilAll() {
  log('\n🚀 SIMPLE FILL ALL - Starting...\n');
  
  try {
    // Get all assets (simple query, no joins)
    // NOTE: This script is deprecated - use fill_all_unlimited.js for processing all assets
    const { rows: assets } = await pool.query(`
      SELECT id, symbol, asset_type, exchange
      FROM assets
      WHERE status = 'OK'
      ORDER BY asset_type, symbol
      LIMIT 100  -- Limited to 100 for quick tests
    `);
    
    log(`📊 Found ${assets.length} assets to process\n`);
    
    let successCount = 0;
    let errorCount = 0;
    let totalInserted = 0;
    
    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];
      
      log(`\n[${i + 1}/${assets.length}] Processing: ${asset.symbol} (${asset.asset_type})`);
      log('─'.repeat(80));
      
      try {
        // Check if asset has any data
        const { rows: countRows } = await pool.query(
          'SELECT COUNT(*) as count FROM price_ohlcv WHERE asset_id = $1',
          [asset.id]
        );
        
        const currentCount = parseInt(countRows[0].count);
        log(`   Current records: ${currentCount}`);
        
        // Calculate days to fetch based on current data
        let daysToFetch = 30; // Default
        
        if (currentCount === 0) {
          log(`   ⚠️  No data - will fetch maximum history`);
          daysToFetch = 10000; // Max
        } else if (currentCount < 100) {
          log(`   ⚠️  Low data count - will fetch 1 year`);
          daysToFetch = 365;
        } else if (currentCount < 1000) {
          log(`   📊 Moderate data - will fetch 90 days`);
          daysToFetch = 90;
        } else {
          log(`   ✅ Good data coverage - will fetch 30 days`);
          daysToFetch = 30;
        }
        
        // Sync asset
        const inserted = await syncAsset(asset, daysToFetch);
        
        if (inserted > 0) {
          totalInserted += inserted;
          successCount++;
          log(`   ✅ Success: ${inserted} records`);
        } else {
          log(`   ⚠️  No new records`);
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (err) {
        errorCount++;
        log(`   ❌ Error: ${err.message}`);
        
        // Continue to next asset
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Periodic status update
      if ((i + 1) % 10 === 0) {
        log(`\n📊 Progress: ${i + 1}/${assets.length} processed`);
        log(`   ✅ Success: ${successCount}`);
        log(`   ❌ Errors: ${errorCount}`);
        log(`   💾 Total inserted: ${totalInserted}`);
        log('');
      }
    }
    
    log('\n' + '='.repeat(80));
    log('🎉 SIMPLE FILL ALL COMPLETE');
    log('='.repeat(80));
    log(`📊 Total assets: ${assets.length}`);
    log(`✅ Success: ${successCount}`);
    log(`❌ Errors: ${errorCount}`);
    log(`💾 Total records inserted: ${totalInserted}`);
    log('='.repeat(80) + '\n');
    
    process.exit(0);
    
  } catch (err) {
    log(`\n❌ Fatal error: ${err.message}`);
    log(err.stack);
    process.exit(1);
  }
}

// Run
simpleFilAll();
