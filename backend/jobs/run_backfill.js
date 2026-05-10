/**
 * run_backfill.js
 * One-shot script: kéo 2 năm lịch sử daily OHLCV cho tất cả assets.
 * Chạy từ thư mục backend:
 *   node jobs/run_backfill.js
 * Hoặc custom số ngày:
 *   node jobs/run_backfill.js 365
 */
require('dotenv').config(); // Load .env từ thư mục backend

const { syncAllAssets } = require('./daily_ohlcv_sync');

const days = parseInt(process.argv[2]) || 730; // Default: 2 năm
const batchSize = 3; // Nhỏ hơn để tránh bị Yahoo rate-limit

console.log(`\n🚀 Bắt đầu backfill ${days} ngày lịch sử (batch=${batchSize})...\n`);

syncAllAssets(days, batchSize)
  .then(result => {
    console.log(`\n✅ Backfill hoàn tất!`);
    console.log(`   Tổng candles: ${result.totalInserted}`);
    console.log(`   Thành công:   ${result.successCount} mã`);
    console.log(`   Lỗi/trống:   ${result.errorCount} mã\n`);
    process.exit(0);
  })
  .catch(err => {
    console.error(`\n❌ Backfill thất bại: ${err.message}`);
    process.exit(1);
  });
