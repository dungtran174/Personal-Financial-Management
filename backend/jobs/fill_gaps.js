/**
 * FILL GAPS SCRIPT
 * 
 * Identifies gaps in OHLCV data and fills them
 * 
 * Strategy:
 * 1. Find assets with gaps (missing dates between first and last date)
 * 2. For each asset, fetch max range data to fill all gaps
 * 3. Upsert data (updates existing, inserts missing)
 * 
 * Usage:
 *   node fill_gaps.js                    # Fill gaps for all assets
 *   node fill_gaps.js --symbol=AAPL      # Fill gaps for specific symbol
 *   node fill_gaps.js --check-only       # Only check, don't fill
 */

const pool = require('../config/pg');
const { syncAsset, fetchBinanceDaily, fetchYahooDaily } = require('./daily_ohlcv_sync');
const fs = require('fs');
const path = require('path');

// ==================== LOGGING ====================

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// ==================== CHECK GAPS ====================

async function checkGaps(assetId, symbol) {
  try {
    // Simplified query to avoid shared memory issues
    const { rows } = await pool.query(`
      SELECT 
        COUNT(*) as total_records,
        MIN(ts)::date as first_date,
        MAX(ts)::date as last_date
      FROM price_ohlcv
      WHERE asset_id = $1
    `, [assetId]);
    
    if (!rows[0] || !rows[0].total_records || rows[0].total_records === '0') {
      return {
        hasGaps: false,
        firstDate: null,
        lastDate: null,
        totalRecords: 0,
        expectedRecords: 0,
        missingRecords: 0,
        gapPercentage: 0
      };
    }
    
    const { first_date, last_date, total_records } = rows[0];
    const totalRecordsInt = parseInt(total_records);
    
    // Calculate expected number of days
    const firstDate = new Date(first_date);
    const lastDate = new Date(last_date);
    const daysDiff = Math.floor((lastDate - firstDate) / (1000 * 60 * 60 * 24)) + 1;
    
    // Estimate expected records (accounting for weekends/holidays)
    // For stocks: ~252 trading days per year
    // For crypto: 365 days per year
    // Simple estimate: 70% of days (covers weekends, holidays)
    const expectedRecords = Math.floor(daysDiff * 0.7);
    
    const missingRecords = Math.max(0, expectedRecords - totalRecordsInt);
    const gapPercentage = expectedRecords > 0 ? (missingRecords / expectedRecords) * 100 : 0;
    
    return {
      hasGaps: missingRecords > 10, // Only flag if missing more than 10 records
      firstDate: first_date,
      lastDate: last_date,
      totalRecords: totalRecordsInt,
      expectedRecords,
      missingRecords,
      gapPercentage: gapPercentage.toFixed(2)
    };
    
  } catch (err) {
    log(`⚠️  Error checking gaps for asset ${assetId}: ${err.message}`);
    // Return safe default on error
    return {
      hasGaps: false,
      firstDate: null,
      lastDate: null,
      totalRecords: 0,
      expectedRecords: 0,
      missingRecords: 0,
      gapPercentage: 0,
      error: err.message
    };
  }
}

// ==================== FIND ASSETS WITH GAPS ====================

async function findAssetsWithGaps(minGapPercent = 10) {
  log(`\n🔍 Finding assets with gaps (min ${minGapPercent}% missing)...\n`);
  
  try {
    // Get ALL assets
    const { rows: assets } = await pool.query(`
      SELECT id, symbol, asset_type, exchange
      FROM assets
      WHERE status = 'OK'
      ORDER BY asset_type, symbol
    `);
    
    log(`📊 Checking ${assets.length} assets...\n`);
    
    const assetsWithGaps = [];
    
    for (const asset of assets) {
      // Add delay to avoid memory pressure
      if (assetsWithGaps.length > 0 && assetsWithGaps.length % 10 === 0) {
        log(`⏸️  Pause for memory management...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      const gaps = await checkGaps(asset.id, asset.symbol);
      
      if (!gaps || gaps.error) {
        log(`⚠️  ${asset.symbol.padEnd(15)} | Could not check (${gaps?.error || 'unknown error'})`);
        continue;
      }
      
      if (gaps.totalRecords === 0) {
        log(`⚠️  ${asset.symbol.padEnd(15)} | No data - skipping`);
        continue;
      }
      
      if (gaps.hasGaps && parseFloat(gaps.gapPercentage) >= minGapPercent) {
        log(`⚠️  ${asset.symbol.padEnd(15)} | ${gaps.totalRecords.toString().padStart(5)} records | ${gaps.missingRecords.toString().padStart(4)} missing (${gaps.gapPercentage}%)`);
        assetsWithGaps.push({ ...asset, gaps });
      } else {
        log(`✅ ${asset.symbol.padEnd(15)} | ${gaps.totalRecords.toString().padStart(5)} records | Complete`);
      }
    }
    
    log(`\n📊 Summary:`);
    log(`   Total assets checked: ${assets.length}`);
    log(`   Assets with gaps: ${assetsWithGaps.length}`);
    
    return assetsWithGaps;
    
  } catch (err) {
    log(`❌ Error finding assets with gaps: ${err.message}`);
    throw err;
  }
}

// ==================== FILL GAPS FOR SINGLE ASSET ====================

async function fillGapsForAsset(asset) {
  log(`\n${'='.repeat(80)}`);
  log(`🔧 Filling gaps for: ${asset.symbol} (${asset.asset_type})`);
  log(`   Current records: ${asset.gaps.totalRecords}`);
  log(`   Missing records: ${asset.gaps.missingRecords} (${asset.gaps.gapPercentage}%)`);
  log(`   Date range: ${asset.gaps.firstDate} → ${asset.gaps.lastDate}`);
  log(`${'='.repeat(80)}`);
  
  try {
    // Calculate days to fetch (from first date to now)
    const firstDate = new Date(asset.gaps.firstDate);
    const now = new Date();
    const daysDiff = Math.floor((now - firstDate) / (1000 * 60 * 60 * 24));
    
    // Fetch entire range
    log(`📡 Fetching ${daysDiff} days of data to fill gaps...`);
    
    const result = await syncAsset(asset, daysDiff);
    
    if (result > 0) {
      log(`✅ Successfully filled: ${result} records upserted`);
    } else {
      log(`⚠️  No new data fetched`);
    }
    
    return result;
    
  } catch (err) {
    log(`❌ Error filling gaps for ${asset.symbol}: ${err.message}`);
    return 0;
  }
}

// ==================== FILL ALL GAPS ====================

async function fillAllGaps(minGapPercent = 10) {
  log(`\n${'🚀'.repeat(40)}`);
  log(`🚀 STARTING GAP FILLING PROCESS`);
  log(`${'🚀'.repeat(40)}\n`);
  
  const progressFile = path.join(__dirname, '..', 'logs', 'fill_progress.txt');
  
  try {
    // Find assets with gaps
    const assetsWithGaps = await findAssetsWithGaps(minGapPercent);
    
    if (assetsWithGaps.length === 0) {
      log(`\n✅ No assets with significant gaps found!`);
      return { totalFilled: 0, successCount: 0, errorCount: 0 };
    }
    
    log(`\n🔧 Filling gaps for ${assetsWithGaps.length} assets...\n`);
    
    // Check for resume
    let startFrom = 0;
    if (fs.existsSync(progressFile)) {
      startFrom = parseInt(fs.readFileSync(progressFile, 'utf8') || '0');
      log(`📍 Resuming from asset #${startFrom + 1}\n`);
    }
    
    let totalFilled = 0;
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = startFrom; i < assetsWithGaps.length; i++) {
      const asset = assetsWithGaps[i];
      
      log(`\n[${i + 1}/${assetsWithGaps.length}] Processing: ${asset.symbol}`);
      
      try {
        const filled = await fillGapsForAsset(asset);
        totalFilled += filled;
        
        if (filled > 0) {
          successCount++;
        } else {
          errorCount++;
        }
        
        // Save checkpoint every 10 assets
        if ((i + 1) % 10 === 0) {
          fs.writeFileSync(progressFile, (i + 1).toString());
          log(`💾 Checkpoint saved: ${i + 1}/${assetsWithGaps.length}`);
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 seconds between assets
        
      } catch (err) {
        log(`❌ Error processing ${asset.symbol}: ${err.message}`);
        errorCount++;
        
        // Save checkpoint on error too
        fs.writeFileSync(progressFile, (i + 1).toString());
      }
    }
    
    log(`\n${'✅'.repeat(40)}`);
    log(`✅ GAP FILLING COMPLETE`);
    log(`📊 Assets processed: ${assetsWithGaps.length}`);
    log(`✅ Success: ${successCount}`);
    log(`❌ Errors: ${errorCount}`);
    log(`💾 Total records filled: ${totalFilled}`);
    log(`${'✅'.repeat(40)}\n`);
    
    // Clean up progress file on success
    if (fs.existsSync(progressFile)) {
      fs.unlinkSync(progressFile);
      log(`🗑️  Progress file cleaned up\n`);
    }
    
    return { totalFilled, successCount, errorCount };
    
  } catch (err) {
    log(`❌ Fatal error: ${err.message}`);
    log(err.stack);
    throw err;
  }
}

// ==================== FILL GAPS FOR SPECIFIC SYMBOL ====================

async function fillGapsForSymbol(symbol) {
  log(`\n🔍 Finding asset: ${symbol}...`);
  
  try {
    const { rows: assets } = await pool.query(`
      SELECT id, symbol, asset_type, exchange
      FROM assets
      WHERE symbol = $1
      LIMIT 1
    `, [symbol]);
    
    if (assets.length === 0) {
      log(`❌ Asset not found: ${symbol}`);
      return 0;
    }
    
    const asset = assets[0];
    
    // Check gaps
    const gaps = await checkGaps(asset.id, asset.symbol);
    
    if (!gaps || !gaps.hasGaps) {
      log(`✅ No gaps found for ${symbol}`);
      return 0;
    }
    
    asset.gaps = gaps;
    
    // Fill gaps
    return await fillGapsForAsset(asset);
    
  } catch (err) {
    log(`❌ Error: ${err.message}`);
    throw err;
  }
}

// ==================== EXPORTS ====================

module.exports = {
  checkGaps,
  findAssetsWithGaps,
  fillGapsForAsset,
  fillAllGaps,
  fillGapsForSymbol
};

// ==================== RUN AS STANDALONE ====================

if (require.main === module) {
  const args = process.argv.slice(2);
  
  // Parse arguments
  const symbolArg = args.find(a => a.startsWith('--symbol='));
  const checkOnly = args.includes('--check-only');
  const minGapPercent = parseInt(args.find(a => a.startsWith('--min-gap='))?.split('=')[1]) || 10;
  
  if (symbolArg) {
    // Fill gaps for specific symbol
    const symbol = symbolArg.split('=')[1];
    fillGapsForSymbol(symbol)
      .then(result => {
        log(`\n✅ Done: ${result} records filled`);
        process.exit(0);
      })
      .catch(err => {
        log(`\n❌ Failed: ${err.message}`);
        process.exit(1);
      });
      
  } else if (checkOnly) {
    // Only check, don't fill
    findAssetsWithGaps(minGapPercent)
      .then(assets => {
        log(`\n✅ Check complete: ${assets.length} assets with gaps`);
        process.exit(0);
      })
      .catch(err => {
        log(`\n❌ Check failed: ${err.message}`);
        process.exit(1);
      });
      
  } else {
    // Fill gaps for all assets
    fillAllGaps(minGapPercent)
      .then(result => {
        log(`\n✅ Done: ${result.totalFilled} records filled`);
        process.exit(0);
      })
      .catch(err => {
        log(`\n❌ Failed: ${err.message}`);
        process.exit(1);
      });
  }
}
