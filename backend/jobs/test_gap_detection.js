/**
 * Test Script: Smart Gap Detection
 * 
 * This script demonstrates gap detection without actually syncing data.
 * Use this to understand what the smart sync will do before running it.
 * 
 * Usage:
 *   node backend/jobs/test_gap_detection.js
 */

const { analyzeGaps, getLastTickTimestamps, calculateCandlesNeeded, calculateYahooRange } = require('../services/intraday/gapDetection');

async function testGapDetection() {
  console.log('\n🧪 Testing Smart Gap Detection\n');
  console.log('='.repeat(60));
  
  try {
    // 1. Get all assets with their last timestamps
    console.log('\n📊 Step 1: Fetching last tick data for all assets...\n');
    const assetMap = await getLastTickTimestamps();
    console.log(`✅ Found ${assetMap.size} assets\n`);
    
    // 2. Analyze gaps
    console.log('📊 Step 2: Analyzing gaps...\n');
    const analysis = await analyzeGaps();
    
    // 3. Show detailed gap analysis for crypto assets
    console.log('\n📊 Step 3: Detailed gap analysis for CRYPTO:\n');
    console.log('-'.repeat(60));
    
    const cryptoWithGaps = analysis.crypto
      .filter(a => a.lastTs !== null)
      .sort((a, b) => b.gapHours - a.gapHours)
      .slice(0, 10); // Show top 10
    
    console.log('Top 10 crypto assets by gap size:\n');
    
    for (const asset of cryptoWithGaps) {
      const candlesNeeded = calculateCandlesNeeded(asset.lastTs, '1m', 1000);
      const gapHours = asset.gapHours.toFixed(1);
      
      console.log(`${asset.symbol.padEnd(12)} | Gap: ${gapHours.padStart(6)}h | Will fetch: ${String(candlesNeeded).padStart(4)} candles`);
    }
    
    // 4. Show assets with no data
    const noDataAssets = analysis.crypto.filter(a => a.lastTs === null);
    if (noDataAssets.length > 0) {
      console.log(`\n⚠️ ${noDataAssets.length} crypto assets have NO DATA yet:`);
      console.log('   ' + noDataAssets.map(a => a.symbol).join(', '));
    }
    
    // 5. Show stock/forex analysis
    console.log('\n\n📊 Step 4: Detailed gap analysis for STOCKS/FOREX:\n');
    console.log('-'.repeat(60));
    
    const stocksWithGaps = [...analysis.stock, ...analysis.forex]
      .filter(a => a.lastTs !== null)
      .sort((a, b) => b.gapHours - a.gapHours)
      .slice(0, 10);
    
    console.log('Top 10 stocks/forex by gap size:\n');
    
    for (const asset of stocksWithGaps) {
      const range = calculateYahooRange(asset.lastTs);
      const gapHours = asset.gapHours.toFixed(1);
      const gapDays = (asset.gapHours / 24).toFixed(1);
      
      console.log(`${asset.symbol.padEnd(12)} | Gap: ${gapHours.padStart(6)}h (${gapDays}d) | Will fetch: ${range}`);
    }
    
    // 6. Summary
    console.log('\n\n' + '='.repeat(60));
    console.log('📊 Summary:\n');
    console.log(`Total assets: ${assetMap.size}`);
    console.log(`  - Crypto: ${analysis.crypto.length}`);
    console.log(`  - Stock: ${analysis.stock.length}`);
    console.log(`  - Forex: ${analysis.forex.length}`);
    console.log('');
    console.log(`Assets with NO data: ${analysis.stats.noData}`);
    console.log(`Assets with recent data (< 1h): ${analysis.stats.recentData}`);
    console.log(`Assets needing sync (> 1h): ${analysis.stats.needSync}`);
    console.log('');
    console.log('💡 To run actual sync with these parameters:');
    console.log('   node backend/jobs/cron_intraday_sync.js');
    console.log('='.repeat(60) + '\n');
    
  } catch (err) {
    console.error('❌ Test failed:', err.message);
    console.error(err);
    process.exit(1);
  }
}

// Run test
if (require.main === module) {
  testGapDetection()
    .then(() => {
      console.log('✅ Test completed successfully\n');
      process.exit(0);
    })
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

module.exports = { testGapDetection };
