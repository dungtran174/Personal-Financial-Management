// backend/services/ingestAssets.js
const axios = require("axios");
const pool = require("../config/pg");
const upsertAsset = require("./utils/upsertAsset");
const { indices, forex, commodities } = require("./assetLists");
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

// ---- Vietnam Stocks (from CSV) ----
async function ingestVietnamStocks() {
  console.log("📡 Ingesting Vietnam stocks from CSV...");
  const filePath = path.join(__dirname, 'vietnam_tickers_checked.csv');

  if (!fs.existsSync(filePath)) {
    console.log("⚠️ Vietnam tickers CSV not found, skipping.");
    return;
  }

  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    let count = 0;
    for (const row of data) {
      // Check if add_to_asset is 1 (it might be number or string depending on parsing)
      if (row.add_to_asset == 1) {
        await upsertAsset(
          row.Symbol,
          'VNSTOCK', 
          'stock',
          row.Name,
          'VND',
          { source: 'vnstock_csv', originalExchange: row.Exchange }
        );
        count++;
      }
    }
    console.log(`✅ Ingested ${count} Vietnam stocks`);
  } catch (err) {
    console.error("❌ Failed to ingest Vietnam stocks:", err.message);
  }
}

// ---- US Stocks Fallback (Yahoo Finance) ----
async function ingestUSStocksFallback() {
  console.log("📡 Yahoo fallback: US most active stocks");

  try {
    const { data } = await axios.get(
      "https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=most_actives",
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );

    const quotes = data?.finance?.result?.[0]?.quotes || [];
    if (!quotes.length) {
      console.log("❌ Yahoo fallback returned no quotes");
      return;
    }

    for (const r of quotes) {
      await upsertAsset(
        r.symbol,
        "US",
        "stock",
        r.shortName || r.longName || r.symbol,
        r.currency || "USD",
        { raw: r }
      );
    }

    console.log("✅ US stocks ingested via Yahoo fallback");
  } catch (e) {
    console.error("❌ Yahoo fallback failed:", e.message);
  }
}

// ---- Nasdaq API ----
async function ingestUSStocks() {
  console.log("📡 Fetching full US stock list from Nasdaq...");

  try {
    const url = "https://api.nasdaq.com/api/screener/stocks?limit=5000";

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json",
        "Origin": "https://www.nasdaq.com"
      }
    });

    const data = await res.json();

    if (!data?.data?.table?.rows) {
      throw new Error("No rows in Nasdaq response");
    }

    const rows = data.data.table.rows;

    for (const r of rows) {
      await upsertAsset(
        r.symbol,
        "NASDAQ",
        "stock",
        r.name,
        "USD",
        {
          lastsale: r.lastsale,
          marketCap: r.marketCap,
          url: r.url
        }
      );
    }

    console.log(`✅ Ingested ${rows.length} US stocks from Nasdaq`);
  } catch (err) {
    console.error("❌ Failed to fetch from Nasdaq:", err.message);
  }
}



// ---- Binance Crypto ----
async function ingestBinance() {
  console.log("📡 Fetching Binance crypto symbols...");
  const { data } = await axios.get("https://api.binance.com/api/v3/exchangeInfo");

  for (const s of data.symbols) {
    if (s.status !== "TRADING") continue;
    const name = `${s.baseAsset}/${s.quoteAsset}`;
    await upsertAsset(s.symbol, "BINANCE", "crypto", name, s.quoteAsset, { raw: s });
  }

  console.log("✅ Binance crypto done");
}

// ---- Static assets ----
async function ingestStaticAssets(list, type) {
  console.log(`📦 Ingesting static ${type}...`);

  for (const a of list) {
    await upsertAsset(
      a.symbol,
      a.exchange || "",
      type,
      a.name,
      a.currency,
      { source: "static" }
    );
  }

  console.log(`✅ Static ${type} ingested`);
}

// ---- Run ----
(async () => {
  console.log("\n🚀 Starting asset ingestion...\n");

  await ingestBinance();

  console.log("⚠️ VNDirect disabled temporarily — assets will be added later.");

  await ingestVietnamStocks();

  await ingestUSStocks();

  await ingestStaticAssets(indices, "index");
  await ingestStaticAssets(forex, "forex");
  await ingestStaticAssets(commodities, "commodity");

  await pool.end();

  console.log("\n✅ ALL ASSETS INGESTED\n");
})();
