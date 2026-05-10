/**
 * FILL ALL SIMPLE - Fill tất cả assets KHÔNG check gaps
 * 
 * Script này:
 * - KHÔNG check gaps (tránh "out of shared memory")
 * - Fill TẤT CẢ 6,621 assets
 * - Có checkpoint (mỗi 10 assets)
 * - Tự động resume khi crash
 * - ON CONFLICT (không duplicate)
 * 
 * Usage:
 *   node jobs/fill_all_simple.js
 */

const pool = require('../config/pg');
const { syncAsset } = require('./daily_ohlcv_sync');
const fs = require('fs');
const path = require('path');

// ==================== LOGGING ====================

const logDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

const logFile = path.join(logDir, `fill_all_simple_${new Date().toISOString().slice(0, 10)}.log`);

function log(msg) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}`;
  console.log(line);
  fs.appendFileSync(logFile, line + '\n');
}

// ==================== MAIN ====================

async function fillAllSimple() {
  log('\n' + '🚀'.repeat(40));
  log('🚀 FILL ALL SIMPLE - Processing ALL Assets');
  log('🚀'.repeat(40) + '\n');
  
  const progressFile = path.join(logDir, 'fill_progress.txt');
  
  try {
    // Get ALL assets - NO complex queries
    log('📊 Loading assets...\n');
    
    const { rows: assets } = await pool.query(`
      SELECT id, symbol, asset_type, exchange
      FROM assets
      WHERE status = 'OK'
      ORDER BY asset_type, symbol
    `);
    
    log(`📊 Total assets: ${assets.length}\n`);
    
    // Check for resume
    let startFrom = 0;
    if (fs.existsSync(progressFile)) {
      startFrom = parseInt(fs.readFileSync(progressFile, 'utf8') || '0');
      log(`📍 Resuming from asset #${startFrom + 1}\n`);
    }
    
    let successCount = 0;
    let errorCount = 0;
    let totalInserted = 0;
    let skippedCount = 0;
    
    // Process each asset
    for (let i = startFrom; i < assets.length; i++) {
      const asset = assets[i];
      
      log(`\n[${i + 1}/${assets.length}] ${asset.symbol} (${asset.asset_type})`);
      
      try {
        // Check current data count (simple query)
        const { rows: countRows } = await pool.query(
          'SELECT COUNT(*) as count FROM price_ohlcv WHERE asset_id = $1',
          [asset.id]
        );
        
        const currentCount = parseInt(countRows[0].count);
        
        // Smart days selection
        let daysToFetch;
        if (currentCount === 0) {
          daysToFetch = 10000; // Max history
          log(`   📥 No data - fetching MAX history (10k days)`);
        } else if (currentCount < 100) {
          daysToFetch = 365;
          log(`   📥 Low data (${currentCount}) - fetching 1 year`);
        } else if (currentCount < 1000) {
          daysToFetch = 90;
          log(`   📥 Moderate data (${currentCount}) - fetching 90 days`);
        } else {
          daysToFetch = 30;
          log(`   📥 Good data (${currentCount}) - fetching 30 days`);
        }
        
        // Sync asset
        const inserted = await syncAsset(asset, daysToFetch);
        
        if (inserted > 0) {
          totalInserted += inserted;
          successCount++;
          log(`   ✅ Success: ${inserted} records inserted`);
        } else {
          skippedCount++;
          log(`   ⏭️  Skipped: No new data`);
        }
        
        // Save checkpoint every 10 assets
        if ((i + 1) % 10 === 0) {
          fs.writeFileSync(progressFile, (i + 1).toString());
          log(`   💾 Checkpoint: ${i + 1}/${assets.length}`);
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (err) {
        errorCount++;
        log(`   ❌ Error: ${err.message}`);
        
        // Save checkpoint on error
        fs.writeFileSync(progressFile, (i + 1).toString());
        
        // Continue to next
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    log('\n' + '✅'.repeat(40));
    log('✅ FILL ALL SIMPLE COMPLETE');
    log('✅'.repeat(40));
    log(`\n📊 Summary:`);
    log(`   Assets processed: ${assets.length}`);
    log(`   ✅ Success: ${successCount}`);
    log(`   ⏭️  Skipped: ${skippedCount}`);
    log(`   ❌ Errors: ${errorCount}`);
    log(`   💾 Total inserted: ${totalInserted}`);
    log('✅'.repeat(40) + '\n');
    
    // Clean up progress file
    if (fs.existsSync(progressFile)) {
      fs.unlinkSync(progressFile);
      log('🗑️  Progress file cleaned up\n');
    }
    
    process.exit(0);
    
  } catch (err) {
    log(`\n❌ Fatal error: ${err.message}`);
    log(err.stack);
    process.exit(1);
  }
}

// ==================== RUN ====================

if (require.main === module) {
  fillAllSimple();
}
