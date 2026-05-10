const { syncCryptoIntraday } = require('../services/intraday/binanceIntraday');
const { syncStockIntraday } = require('../services/intraday/yahooIntraday');
const pool = require('../config/pg');

async function quickFix() {
  console.log('🔧 Quick Fix: Syncing AAPL, MSFT, BTCUSDT...');

  // 1. Sync BTCUSDT
  try {
    const { rows } = await pool.query("SELECT id FROM assets WHERE symbol = 'BTCUSDT'");
    if (rows.length > 0) {
      console.log('Syncing BTCUSDT...');
      await syncCryptoIntraday(rows[0].id, 'BTCUSDT', '1m', 1000);
    }
  } catch (e) { console.error('Error syncing BTCUSDT:', e.message); }

  // 2. Sync AAPL, MSFT
  const stocks = ['AAPL', 'MSFT'];
  for (const symbol of stocks) {
    try {
      const { rows } = await pool.query("SELECT id FROM assets WHERE symbol = $1", [symbol]);
      if (rows.length > 0) {
        console.log(`Syncing ${symbol}...`);
        await syncStockIntraday(rows[0].id, symbol, '5m', '1mo'); // 1 month of 5m data
      }
    } catch (e) { console.error(`Error syncing ${symbol}:`, e.message); }
  }

  console.log('✅ Done!');
  process.exit(0);
}

quickFix();
