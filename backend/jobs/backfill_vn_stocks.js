/**
 * BACKFILL VIETNAM STOCKS
 * 
 * Fetches historical OHLCV data for newly added Vietnam stocks (symbols ending with .VN)
 * 
 * Strategy:
 * 1. Find all Vietnam stocks (symbol ends with .VN) that have no data or minimal data
 * 2. Fetch maximum available historical data from Yahoo Finance (up to 5 years)
 * 3. Upsert data into price_ohlcv table
 * 
 * Usage:
 *   node backfill_vn_stocks.js                    # Backfill all VN stocks
 *   node backfill_vn_stocks.js --symbol=VCB.VN    # Backfill specific symbol
 *   node backfill_vn_stocks.js --days=1825        # Custom days (default: 1825 = 5 years)
 *   node backfill_vn_stocks.js --check-only       # Only check status, don't fetch
 */

const pool = require('../config/pg');
const { syncAsset } = require('./daily_ohlcv_sync');
const fs = require('fs');
const path = require('path');

// ==================== LOGGING ====================

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// ==================== GET VN STOCKS STATUS ====================

async function getVNStocksStatus() {
  log(`\n🔍 Finding Vietnam stocks (.VN symbols)...\n`);
  
  try {
    const { rows: vnStocks } = await pool.query(`
      SELECT 
        a.id,
        a.symbol,
        a.name,
        a.exchange,
        a.asset_type,
        COUNT(p.ts) as record_count,
        MIN(p.ts)::date as first_date,
        MAX(p.ts)::date as last_date
      FROM assets a
      LEFT JOIN price_ohlcv p ON a.id = p.asset_id
      WHERE a.symbol LIKE '%.VN'
        AND a.exchange = 'VNSTOCK'
      GROUP BY a.id, a.symbol, a.name, a.exchange, a.asset_type
      ORDER BY a.symbol
    `);
    
    log(`📊 Found ${vnStocks.length} Vietnam stocks\n`);
    
    const needsBackfill = [];
    const hasData = [];
    
    for (const stock of vnStocks) {
      const recordCount = parseInt(stock.record_count) || 0;
      
      if (recordCount === 0) {
        log(`⚠️  ${stock.symbol.padEnd(15)} | NO DATA - needs backfill`);
        needsBackfill.push(stock);
      } else if (recordCount < 100) {
        log(`⚠️  ${stock.symbol.padEnd(15)} | ${recordCount.toString().padStart(4)} records (${stock.first_date} → ${stock.last_date}) - needs backfill`);
        needsBackfill.push(stock);
      } else {
        log(`✅ ${stock.symbol.padEnd(15)} | ${recordCount.toString().padStart(4)} records (${stock.first_date} → ${stock.last_date})`);
        hasData.push(stock);
      }
    }
    
    log(`\n📊 Summary:`);
    log(`   Total VN stocks: ${vnStocks.length}`);
    log(`   Needs backfill: ${needsBackfill.length}`);
    log(`   Has sufficient data: ${hasData.length}\n`);
    
    return { needsBackfill, hasData, total: vnStocks.length };
    
  } catch (err) {
    log(`❌ Error getting VN stocks status: ${err.message}`);
    throw err;
  }
}

// ==================== BACKFILL SINGLE VN STOCK ====================

async function backfillVNStock(stock, days = null) {
  log(`\n${'='.repeat(80)}`);
  log(`🔧 Backfilling: ${stock.symbol}`);
  log(`   Name: ${stock.name}`);
  log(`   Current records: ${stock.record_count || 0}`);
  
  // If days is null, fetch max available data (Yahoo Finance supports up to ~20 years)
  const fetchDays = days || 7300; // 20 years = max historical data
  log(`   Fetching: ${days ? `${days} days (~${Math.floor(days / 365)} years)` : 'MAX available data (~20 years)'}`);
  log(`${'='.repeat(80)}`);
  
  try {
    // Fetch historical data
    log(`📡 Fetching from Yahoo Finance...`);
    
    const result = await syncAsset(stock, fetchDays);
    
    if (result > 0) {
      log(`✅ Successfully backfilled: ${result} records upserted`);
    } else {
      log(`⚠️  No data available for ${stock.symbol} (may be delisted or not yet listed)`);
    }
    
    return result;
    
  } catch (err) {
    log(`❌ Error backfilling ${stock.symbol}: ${err.message}`);
    return 0;
  }
}

// ==================== BACKFILL ALL VN STOCKS ====================

async function backfillAllVNStocks(days = null, batchSize = 5) {
  log(`\n${'🚀'.repeat(40)}`);
  log(`🚀 STARTING VIETNAM STOCKS BACKFILL`);
  log(`🚀 Fetching ${days ? `${days} days (~${Math.floor(days / 365)} years)` : 'MAX available data (from listing date)'}`);
  log(`${'🚀'.repeat(40)}\n`);
  
  const progressFile = path.join(__dirname, '..', 'logs', 'vn_backfill_progress.txt');
  
  try {
    // Get status
    const { needsBackfill } = await getVNStocksStatus();
    
    if (needsBackfill.length === 0) {
      log(`\n✅ All Vietnam stocks already have sufficient data!`);
      return { totalFilled: 0, successCount: 0, errorCount: 0 };
    }
    
    log(`\n🔧 Backfilling ${needsBackfill.length} Vietnam stocks...\n`);
    
    // Check for resume
    let startFrom = 0;
    if (fs.existsSync(progressFile)) {
      startFrom = parseInt(fs.readFileSync(progressFile, 'utf8') || '0');
      log(`📍 Resuming from stock #${startFrom + 1}\n`);
    }
    
    let totalFilled = 0;
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = startFrom; i < needsBackfill.length; i++) {
      const stock = needsBackfill[i];
      
      log(`\n[${i + 1}/${needsBackfill.length}] Processing: ${stock.symbol}`);
      
      try {
        const filled = await backfillVNStock(stock, days);
        totalFilled += filled;
        
        if (filled > 0) {
          successCount++;
        } else {
          // Still count as processed, just no data available
          errorCount++;
        }
        
        // Save checkpoint every 10 stocks
        if ((i + 1) % 10 === 0) {
          fs.writeFileSync(progressFile, (i + 1).toString());
          log(`💾 Checkpoint saved: ${i + 1}/${needsBackfill.length}`);
        }
        
        // Rate limiting - 2 seconds between each stock
        if (i < needsBackfill.length - 1) {
          log(`⏸️  Waiting 2 seconds before next fetch...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
      } catch (err) {
        log(`❌ Error processing ${stock.symbol}: ${err.message}`);
        errorCount++;
        
        // Save checkpoint on error too
        fs.writeFileSync(progressFile, (i + 1).toString());
        
        // Wait a bit longer on error
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    log(`\n${'✅'.repeat(40)}`);
    log(`✅ VIETNAM STOCKS BACKFILL COMPLETE`);
    log(`📊 Stocks processed: ${needsBackfill.length}`);
    log(`✅ Success: ${successCount}`);
    log(`⚠️  No data available: ${errorCount}`);
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

// ==================== BACKFILL SPECIFIC VN STOCK ====================

async function backfillSpecificVNStock(symbol, days = null) {
  log(`\n🔍 Finding stock: ${symbol}...`);
  
  try {
    const { rows: stocks } = await pool.query(`
      SELECT 
        a.id,
        a.symbol,
        a.name,
        a.exchange,
        a.asset_type,
        COUNT(p.ts) as record_count
      FROM assets a
      LEFT JOIN price_ohlcv p ON a.id = p.asset_id
      WHERE a.symbol = $1
      GROUP BY a.id, a.symbol, a.name, a.exchange, a.asset_type
      LIMIT 1
    `, [symbol]);
    
    if (stocks.length === 0) {
      log(`❌ Stock not found: ${symbol}`);
      return 0;
    }
    
    const stock = stocks[0];
    
    if (!stock.symbol.endsWith('.VN')) {
      log(`⚠️  Warning: ${symbol} is not a Vietnam stock (doesn't end with .VN)`);
    }
    
    // Backfill
    return await backfillVNStock(stock, days);
    
  } catch (err) {
    log(`❌ Error: ${err.message}`);
    throw err;
  }
}

// ==================== EXPORTS ====================

module.exports = {
  getVNStocksStatus,
  backfillVNStock,
  backfillAllVNStocks,
  backfillSpecificVNStock
};

// ==================== RUN AS STANDALONE ====================

if (require.main === module) {
  const args = process.argv.slice(2);
  
  // Parse arguments
  const symbolArg = args.find(a => a.startsWith('--symbol='));
  const daysArg = args.find(a => a.startsWith('--days='));
  const checkOnly = args.includes('--check-only');
  
  const days = daysArg ? parseInt(daysArg.split('=')[1]) : null; // Default: null = MAX data from listing date
  
  if (checkOnly) {
    // Only check status
    getVNStocksStatus()
      .then(result => {
        log(`\n✅ Check complete`);
        process.exit(0);
      })
      .catch(err => {
        log(`\n❌ Check failed: ${err.message}`);
        process.exit(1);
      });
      
  } else if (symbolArg) {
    // Backfill specific symbol
    const symbol = symbolArg.split('=')[1];
    backfillSpecificVNStock(symbol, days)
      .then(result => {
        log(`\n✅ Done: ${result} records filled`);
        pool.end();
        process.exit(0);
      })
      .catch(err => {
        log(`\n❌ Failed: ${err.message}`);
        pool.end();
        process.exit(1);
      });
      
  } else {
    // Backfill all VN stocks
    backfillAllVNStocks(days)
      .then(result => {
        log(`\n✅ Done: ${result.totalFilled} records filled`);
        pool.end();
        process.exit(0);
      })
      .catch(err => {
        log(`\n❌ Failed: ${err.message}`);
        pool.end();
        process.exit(1);
      });
  }
}
