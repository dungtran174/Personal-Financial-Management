/**
 * DAILY OHLCV SYNC JOB
 * 
 * Fetches daily OHLCV data for all assets
 * Runs every day to keep data up-to-date
 * 
 * Features:
 * - Fetches last 30 days of data (covers gaps)
 * - Updates existing candles (on conflict do update)
 * - Separate logic for crypto vs stocks/forex/commodities
 * - Error handling and logging
 * - Can run as cron job or standalone script
 */

const cron = require('node-cron');
const pool = require('../config/pg');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ==================== LOGGING ====================

const logDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

function log(msg) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}`;
  console.log(line);
  
  const logFile = path.join(logDir, `daily_sync_${new Date().toISOString().slice(0, 10)}.log`);
  fs.appendFileSync(logFile, line + '\n');
}

// ==================== UTILS ====================

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanYahooSymbol(symbol) {
  if (!symbol) return symbol;
  symbol = symbol.replace(/=X=X$/, '=X');
  const parts = symbol.split('=X');
  if (parts.length > 2) {
    symbol = parts[0] + '=X';
  }
  return symbol;
}

// ==================== BINANCE FETCH ====================

async function fetchBinanceDaily(symbol, days = 30) {
  try {
    log(`📡 Fetching Binance: ${symbol} (last ${days} days)`);
    
    const url = 'https://api.binance.com/api/v3/klines';
    const startTime = Date.now() - (days * 24 * 60 * 60 * 1000);
    
    const { data } = await axios.get(url, {
      params: {
        symbol,
        interval: '1d',
        startTime,
        limit: days
      },
      timeout: 10000
    });
    
    if (!data || data.length === 0) {
      log(`⚠️  No data from Binance for ${symbol}`);
      return [];
    }
    
    const candles = data.map(k => ({
      ts: new Date(k[0]),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5])
    }));
    
    log(`✅ Binance: ${candles.length} candles`);
    return candles;
    
  } catch (err) {
    log(`❌ Binance fetch failed for ${symbol}: ${err.message}`);
    return [];
  }
}

// ==================== YAHOO FINANCE FETCH ====================

async function fetchYahooDaily(symbol, days = 30) {
  try {
    symbol = cleanYahooSymbol(symbol);
    log(`📡 Fetching Yahoo Finance: ${symbol} (last ${days} days)`);
    
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`;
    
    // Calculate period
    const period2 = Math.floor(Date.now() / 1000);
    const period1 = period2 - (days * 24 * 60 * 60);
    
    const { data } = await axios.get(url, {
      params: {
        interval: '1d',
        period1,
        period2
      },
      headers: {
        'User-Agent': 'Mozilla/5.0'
      },
      timeout: 10000
    });
    
    const result = data?.chart?.result?.[0];
    if (!result || !result.timestamp) {
      log(`⚠️  No data from Yahoo Finance for ${symbol}`);
      return [];
    }
    
    const timestamps = result.timestamp;
    const quote = result.indicators.quote[0];
    
    const candles = [];
    for (let i = 0; i < timestamps.length; i++) {
      // Skip invalid data points
      if (!quote.open[i] || !quote.close[i]) continue;
      
      candles.push({
        ts: new Date(timestamps[i] * 1000),
        open: parseFloat(quote.open[i]),
        high: parseFloat(quote.high[i]),
        low: parseFloat(quote.low[i]),
        close: parseFloat(quote.close[i]),
        volume: parseFloat(quote.volume[i] || 0)
      });
    }
    
    log(`✅ Yahoo Finance: ${candles.length} candles`);
    return candles;
    
  } catch (err) {
    log(`❌ Yahoo Finance fetch failed for ${symbol}: ${err.message}`);
    return [];
  }
}

// ==================== UPSERT TO DATABASE ====================

async function upsertCandles(assetId, candles) {
  if (candles.length === 0) return 0;
  
  try {
    // PostgreSQL has parameter limit (~65000), batch insert in chunks
    const BATCH_SIZE = 500;
    let totalInserted = 0;
    
    for (let i = 0; i < candles.length; i += BATCH_SIZE) {
      const batch = candles.slice(i, i + BATCH_SIZE);
      const values = [];
      const placeholders = [];
      
      batch.forEach((c, idx) => {
        const base = idx * 7;
        placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`);
        values.push(
          assetId,
          c.ts.toISOString(),
          c.open,
          c.high,
          c.low,
          c.close,
          c.volume
        );
      });
      
      const sql = `
        INSERT INTO price_ohlcv (asset_id, ts, open, high, low, close, volume)
        VALUES ${placeholders.join(',')}
        ON CONFLICT (asset_id, ts) DO UPDATE
        SET open = EXCLUDED.open,
            high = EXCLUDED.high,
            low = EXCLUDED.low,
            close = EXCLUDED.close,
            volume = EXCLUDED.volume
      `;
      
      const result = await pool.query(sql, values);
      totalInserted += result.rowCount;
      
      log(`   ✅ Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${result.rowCount} rows`);
    }
    
    return totalInserted;
    
  } catch (err) {
    log(`❌ Database insert failed: ${err.message}`);
    return 0;
  }
}

// ==================== SYNC SINGLE ASSET ====================

async function syncAsset(asset, days = 30) {
  log(`\n${'='.repeat(80)}`);
  log(`📌 Syncing: ${asset.symbol} (${asset.asset_type}) - ID: ${asset.id}`);
  log(`${'='.repeat(80)}`);
  
  let candles = [];
  
  // Fetch based on asset type
  if (asset.asset_type === 'crypto') {
    candles = await fetchBinanceDaily(asset.symbol, days);
  } else {
    // stock, index, forex, commodity - all use Yahoo Finance
    candles = await fetchYahooDaily(asset.symbol, days);
  }
  
  if (candles.length === 0) {
    log(`⚠️  No candles fetched for ${asset.symbol}`);
    
    // Update last_fetched timestamp even if no data
    await pool.query(
      'UPDATE assets SET last_fetched = NOW() WHERE id = $1',
      [asset.id]
    );
    
    return 0;
  }
  
  // Upsert to database
  log(`💾 Upserting ${candles.length} candles to database...`);
  const inserted = await upsertCandles(asset.id, candles);
  
  log(`✅ Upserted ${inserted}/${candles.length} candles`);
  
  // Update asset metadata
  await pool.query(
    `UPDATE assets 
     SET last_fetched = NOW(), 
         status = 'OK',
         last_fetch_error = NULL
     WHERE id = $1`,
    [asset.id]
  );
  
  return inserted;
}

// ==================== SYNC ALL ASSETS ====================

async function syncAllAssets(days = 30, batchSize = 5) {
  log(`\n${'🚀'.repeat(40)}`);
  log(`🚀 STARTING DAILY OHLCV SYNC`);
  log(`📅 Days to fetch: ${days}`);
  log(`📦 Batch size: ${batchSize}`);
  log(`${'🚀'.repeat(40)}\n`);
  
  try {
    // Get all active assets
    const { rows: assets } = await pool.query(`
      SELECT id, symbol, asset_type, exchange, status
      FROM assets
      WHERE status IN ('OK', 'ERROR', NULL)
      ORDER BY 
        CASE asset_type
          WHEN 'crypto' THEN 1
          WHEN 'stock' THEN 2
          WHEN 'index' THEN 3
          WHEN 'forex' THEN 4
          WHEN 'commodity' THEN 5
          ELSE 6
        END,
        id
    `);
    
    log(`📊 Found ${assets.length} assets to sync`);
    
    let totalInserted = 0;
    let successCount = 0;
    let errorCount = 0;
    
    // Process in batches to avoid overwhelming APIs
    for (let i = 0; i < assets.length; i += batchSize) {
      const batch = assets.slice(i, i + batchSize);
      log(`\n📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(assets.length / batchSize)}`);
      
      for (const asset of batch) {
        try {
          const inserted = await syncAsset(asset, days);
          totalInserted += inserted;
          
          if (inserted > 0) {
            successCount++;
          } else {
            errorCount++;
          }
          
          // Rate limiting
          await delay(1000); // 1 second between requests
          
        } catch (err) {
          log(`❌ Error syncing ${asset.symbol}: ${err.message}`);
          errorCount++;
          
          // Update error status
          await pool.query(
            `UPDATE assets 
             SET status = 'ERROR',
                 last_fetch_error = $1,
                 last_fetched = NOW()
             WHERE id = $2`,
            [err.message, asset.id]
          );
        }
      }
      
      // Delay between batches
      if (i + batchSize < assets.length) {
        log(`⏸️  Waiting 5 seconds before next batch...`);
        await delay(5000);
      }
    }
    
    log(`\n${'✅'.repeat(40)}`);
    log(`✅ SYNC COMPLETE`);
    log(`📊 Total assets: ${assets.length}`);
    log(`✅ Success: ${successCount}`);
    log(`❌ Errors: ${errorCount}`);
    log(`💾 Total candles inserted: ${totalInserted}`);
    log(`${'✅'.repeat(40)}\n`);
    
    return { totalInserted, successCount, errorCount };
    
  } catch (err) {
    log(`❌ Fatal error: ${err.message}`);
    log(err.stack);
    throw err;
  }
}

// ==================== CRON SCHEDULE ====================

/**
 * Schedule daily sync at specific time
 * Default: 1 AM every day (after market close)
 */
function scheduleDailySync(hour = 1, minute = 0) {
  const cronExpression = `${minute} ${hour} * * *`;
  
  cron.schedule(cronExpression, async () => {
    log(`\n⏰ [CRON] Daily OHLCV sync triggered at ${new Date().toISOString()}`);
    
    try {
      await syncAllAssets(30, 5); // Fetch last 30 days, batch size 5
      log('✅ [CRON] Daily sync completed successfully');
    } catch (err) {
      log(`❌ [CRON] Daily sync failed: ${err.message}`);
    }
  });
  
  log(`✅ Daily OHLCV sync scheduled: ${cronExpression} (every day at ${hour}:${String(minute).padStart(2, '0')})`);
}

/**
 * Start all daily sync jobs
 */
function startDailySyncJobs() {
  log('\n🚀 Starting daily OHLCV sync cron jobs...\n');
  
  // Main daily sync at 1 AM
  scheduleDailySync(1, 0);
  
  // Additional sync at market close (5 PM)
  scheduleDailySync(17, 30);

  scheduleDailySync(11, 5);
  
  log('\n✅ Daily OHLCV sync jobs scheduled\n');
}

// ==================== EXPORTS ====================

module.exports = {
  syncAsset,
  syncAllAssets,
  scheduleDailySync,
  startDailySyncJobs,
  fetchBinanceDaily,
  fetchYahooDaily
};

// ==================== RUN AS STANDALONE ====================

if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--schedule')) {
    // Run as cron daemon
    log('🕐 Running in scheduled mode...');
    startDailySyncJobs();
  } else {
    // Run once immediately
    log('🚀 Running immediate sync...');
    
    const days = parseInt(args.find(a => a.startsWith('--days='))?.split('=')[1]) || 30;
    const batchSize = parseInt(args.find(a => a.startsWith('--batch='))?.split('=')[1]) || 5;
    
    syncAllAssets(days, batchSize)
      .then(result => {
        log(`\n✅ Sync completed: ${result.totalInserted} candles inserted`);
        process.exit(0);
      })
      .catch(err => {
        log(`\n❌ Sync failed: ${err.message}`);
        process.exit(1);
      });
  }
}
