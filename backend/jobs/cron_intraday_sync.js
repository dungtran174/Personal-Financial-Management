/**
 * CRON JOB: Intraday Data Sync
 * 
 * Fetches intraday data (1m, 5m, 15m, 1h) for all assets
 * and stores in price_ticks for continuous aggregates
 * 
 * Schedule:
 * - Crypto (1m): every 5 minutes
 * - Stocks (5m): every 15 minutes during market hours
 */

const cron = require('node-cron');
const { syncAllCryptoIntraday } = require('../services/intraday/binanceIntraday');
const { syncAllStockIntraday } = require('../services/intraday/yahooIntraday');

/**
 * Sync crypto intraday data (Binance)
 * Runs every 5 minutes
 */
function scheduleCryptoSync() {
  // Every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    console.log('\n⏰ [CRON] Starting crypto intraday sync...');
    try {
      await syncAllCryptoIntraday('1m', 100); // Last 100 1m candles (~1.5 hours)
      console.log('✅ [CRON] Crypto sync completed');
    } catch (err) {
      console.error('❌ [CRON] Crypto sync failed:', err.message);
    }
  });

  console.log('✅ Crypto intraday sync scheduled (every 5 minutes)');
}

/**
 * Sync stock/forex intraday data (Yahoo Finance)
 * Runs every 15 minutes during market hours
 * Now includes VN stocks (.VN symbols)
 * 
 * Market hours covered:
 * - VN: 9:00-15:00 VN time = 2:00-8:00 UTC
 * - US: 9:30-16:00 EST = 14:30-21:00 UTC
 */
function scheduleStockSync() {
  // Every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    const now = new Date();
    const utcHour = now.getUTCHours();
    
    // Cover both VN market (2-8 UTC) and US market (14-21 UTC)
    const isVNMarketHours = utcHour >= 2 && utcHour <= 8;
    const isUSMarketHours = utcHour >= 14 && utcHour <= 21;
    
    if (!isVNMarketHours && !isUSMarketHours) {
      console.log('⏭️ [CRON] Stock sync skipped (outside market hours: VN 2-8 UTC, US 14-21 UTC)');
      return;
    }

    console.log('\n⏰ [CRON] Starting stock intraday sync (1m candles)...');
    try {
      // Fetch 1m candles for last 1 day (thay vì 5m)
      // Increased limit to 500 to include VN stocks (386 VN + other stocks)
      await syncAllStockIntraday('1m', '1d', 500);
      console.log('✅ [CRON] Stock sync completed (1m candles)');
    } catch (err) {
      console.error('❌ [CRON] Stock sync failed:', err.message);
    }
  });

  console.log('✅ Stock intraday sync scheduled (every 15 minutes, 1m candles, VN + US markets)');
}

/**
 * Hourly deep sync for all assets
 * Runs every hour
 */
function scheduleHourlyDeepSync() {
  // Every hour at minute 0
  cron.schedule('0 * * * *', async () => {
    console.log('\n⏰ [CRON] Starting hourly deep sync...');
    
    try {
      // Crypto: fetch last 500 1m candles (~8 hours)
      console.log('📊 Syncing crypto (1m, 500 candles)...');
      await syncAllCryptoIntraday('1m', 500);
      
      // Stocks: fetch 1m candles for 1 day (thay vì 5m, 5d)
      // Yahoo 1m data chỉ hỗ trợ tối đa 7 ngày
      console.log('📊 Syncing stocks (1m, 1 day)...');
      await syncAllStockIntraday('1m', '1d', 500);
      
      console.log('✅ [CRON] Hourly deep sync completed');
    } catch (err) {
      console.error('❌ [CRON] Hourly sync failed:', err.message);
    }
  });

  console.log('✅ Hourly deep sync scheduled (1m candles for all assets)');
}

/**
 * Start all intraday sync jobs
 */
function startIntradaySyncJobs() {
  console.log('\n🚀 Starting intraday sync cron jobs...\n');
  
  scheduleCryptoSync();
  scheduleStockSync();
  scheduleHourlyDeepSync();
  
  console.log('\n✅ All intraday sync jobs scheduled\n');
}

/**
 * Run one-time sync immediately (LEGACY - Fixed limits)
 * @deprecated Use runSmartSync() instead for gap-aware syncing
 */
async function runImmediateSync() {
  console.log('\n🚀 Running immediate intraday sync (legacy mode)...\n');
  
  try {
    console.log('1️⃣ Syncing crypto (1m, 200 candles)...');
    await syncAllCryptoIntraday('1m', 200);
    
    console.log('\n2️⃣ Syncing stocks (1m, 1 day, 50 assets)...');
    await syncAllStockIntraday('1m', '1d', 50);
    
    console.log('\n✅ Immediate sync completed');
  } catch (err) {
    console.error('❌ Immediate sync failed:', err.message);
  }
}

/**
 * Run smart sync with gap detection
 * Automatically detects gaps and fetches only missing data
 */
async function runSmartSync() {
  const { detectAndFillGaps } = require('../services/intraday/gapDetection');
  
  try {
    await detectAndFillGaps();
  } catch (err) {
    console.error('❌ Smart sync failed:', err.message);
    throw err;
  }
}

module.exports = {
  startIntradaySyncJobs,
  runImmediateSync,    // Legacy: fixed limits
  runSmartSync,        // Recommended: gap-aware
  scheduleCryptoSync,
  scheduleStockSync,
  scheduleHourlyDeepSync
};

// Run as standalone script
if (require.main === module) {
  // Use smart sync by default (gap-aware)
  runSmartSync()
    .then(() => {
      console.log('\n🎯 Starting scheduled jobs...');
      startIntradaySyncJobs();
    })
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}
