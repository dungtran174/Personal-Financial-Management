/**
 * BACKFILL OHLCV – FIXED VERSION
 * - Clean Yahoo symbol
 * - Skip assets that already have OHLCV
 * - Save error status to DB
 * - Log failed assets
 */

const fs = require("fs");
const path = require("path");
const pool = require("../config/pg");
const axios = require("axios");

// ============================ LOGGING ============================

const logDir = path.join(__dirname, "..", "logs");
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

const logFile = path.join(
  logDir,
  `backfill_${new Date().toISOString().slice(0, 10)}.log`
);

function writeLog(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(logFile, line);
  console.log(msg);
}

// failed assets log
function logFailed(symbol, reason) {
  fs.appendFileSync(
    path.join(logDir, "failed_assets.log"),
    `${symbol} | ${reason}\n`
  );
}

// ==================== UTIL: RETRY + DELAY =======================

function delay(ms) {
  return new Promise(res => setTimeout(res, ms));
}

async function withRetry(fn, retries = 5) {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      writeLog(`⚠️ Retry ${attempt}/${retries}: ${err.message}`);
      await delay(500 * attempt);
    }
  }
  writeLog(`❌ Max retries reached`);
  return null;
}

// ==================== SYMBOL CLEANER =======================

function cleanYahooSymbol(symbol) {
  if (!symbol) return symbol;

  // Fix cases like: USDCAD=X=X → USDCAD=X
  symbol = symbol.replace(/=X=X$/, "=X");

  // Remove duplicate =X
  const parts = symbol.split("=X");
  if (parts.length > 2) {
    symbol = parts[0] + "=X";
  }

  return symbol;
}

// ==================== YAHOO FULL HISTORY =======================

async function fetchYahooFull(symbol, interval = "1d", range = "max") {
  symbol = cleanYahooSymbol(symbol);
  writeLog(`📡 Yahoo full download: ${symbol}`);

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`;

  const data = await withRetry(() =>
    axios.get(url, { params: { interval, range } })
  );

  const result = data?.data?.chart?.result?.[0];
  if (!result) return [];

  const t = result.timestamp;
  const q = result.indicators.quote[0];

  let candles = [];
  for (let i = 0; i < t.length; i++) {
    candles.push({
      ts: t[i] * 1000,
      open: q.open[i],
      high: q.high[i],
      low: q.low[i],
      close: q.close[i],
      volume: q.volume[i] || 0,
    });
  }

  writeLog(`   📥 Yahoo candles: ${candles.length}`);
  return candles;
}

// ==================== BINANCE FULL HISTORY =======================

async function fetchBinanceFull(symbol, interval = "1d") {
  writeLog(`📡 Binance full download: ${symbol}`);

  let all = [];
  let startTime = 0;

  while (true) {
    const url = "https://api.binance.com/api/v3/klines";

    const data = await withRetry(() =>
      axios.get(url, {
        params: { symbol, interval, startTime, limit: 1000 },
      })
    );

    if (!data || data.data.length === 0) break;

    const batch = data.data.map(k => ({
      ts: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));

    all.push(...batch);
    writeLog(`   ➕ Batch: ${batch.length} rows (total: ${all.length})`);

    startTime = batch[batch.length - 1].ts + 1;

    await delay(300);
  }

  return all;
}

// ==================== SYMBOL MAPPING =======================

function mapSymbolToAPI(asset) {
  if (asset.asset_type === "crypto") return asset.symbol;
  if (asset.asset_type === "forex") return asset.symbol.replace("/", "") + "=X";
  return cleanYahooSymbol(asset.symbol);
}

// ==================== BATCH INSERT =======================

async function insertBatch(assetId, rows) {
  if (rows.length === 0) return 0;

  const values = [];
  const placeholders = [];

  rows.forEach((r, i) => {
    const base = i * 7;
    placeholders.push(
      `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7})`
    );
    values.push(
      assetId,
      new Date(r.ts).toISOString(),
      r.open,
      r.high,
      r.low,
      r.close,
      r.volume
    );
  });

  const sql = `
    INSERT INTO price_ohlcv (asset_id, ts, open, high, low, close, volume)
    VALUES ${placeholders.join(",")}
    ON CONFLICT (asset_id, ts) DO NOTHING
  `;

  const res = await pool.query(sql, values);
  return res.rowCount;
}

// ==================== CHECK IF ASSET HAS DATA =======================

async function hasData(assetId) {
  const { rows } = await pool.query(
    "SELECT 1 FROM price_ohlcv WHERE asset_id = $1 LIMIT 1",
    [assetId]
  );
  return rows.length > 0;
}

// ==================== MAIN BACKFILL =======================

async function backfill() {
  writeLog(`🚀 START BACKFILL FULL HISTORY`);
  writeLog(`📄 Log file: ${logFile}`);

  const { rows: assets } = await pool.query("SELECT * FROM assets ORDER BY id");

  writeLog(`📦 Total assets: ${assets.length}`);

  let totalInserted = 0;

  for (const a of assets) {
    writeLog(`\n-----------------------------------`);
    writeLog(`📌 Asset: ${a.symbol} (${a.asset_type})`);

    // Skip asset that already has OHLCV
    if (await hasData(a.id)) {
      writeLog(`⏭️ Skip: already has OHLCV data`);
      continue;
    }

    const apiSymbol = mapSymbolToAPI(a);
    if (!apiSymbol) {
      writeLog(`⚠️ Skip: Cannot map`);
      await pool.query(
        `UPDATE assets SET status='INVALID', last_fetch_error='Symbol map failure' WHERE id=$1`,
        [a.id]
      );
      continue;
    }

    let candles = [];

    try {
      candles =
        a.asset_type === "crypto"
          ? await fetchBinanceFull(apiSymbol)
          : await fetchYahooFull(apiSymbol);
    } catch (err) {
      candles = [];
    }

    if (!candles || candles.length === 0) {
      writeLog(`❌ No data fetched`);
      logFailed(a.symbol, "NO DATA");
      await pool.query(
        `UPDATE assets SET status='ERROR', last_fetch_error='No data from providers' WHERE id=$1`,
        [a.id]
      );
      continue;
    }

    writeLog(`📥 Total candles fetched: ${candles.length}`);
    writeLog(`💾 Inserting into DB...`);

    let inserted = 0;

    for (let i = 0; i < candles.length; i += 500) {
      const chunk = candles.slice(i, i + 500);
      const added = await insertBatch(a.id, chunk);
      inserted += added;
      await delay(50);
    }

    writeLog(`✅ Inserted: ${inserted} rows`);

    await pool.query(
      `UPDATE assets SET status='OK', last_fetch_error=NULL WHERE id=$1`,
      [a.id]
    );

    totalInserted += inserted;
  }

  writeLog(`\n====================================================`);
  writeLog(`🎉 BACKFILL DONE — Total inserted: ${totalInserted}`);
  writeLog(`====================================================`);

  process.exit(0);
}

backfill();
