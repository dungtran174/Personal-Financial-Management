-- backend/db/schema.sql

-- enable extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- assets metadata
CREATE TABLE IF NOT EXISTS assets (
  id SERIAL PRIMARY KEY,
  symbol TEXT NOT NULL UNIQUE,
  exchange TEXT,
  asset_type TEXT,      -- 'stock' | 'crypto' | 'forex' | 'index'
  name TEXT,
  currency TEXT,
  sector TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- OHLCV (hypertable)
CREATE TABLE IF NOT EXISTS price_ohlcv (
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  ts TIMESTAMPTZ NOT NULL,
  open DOUBLE PRECISION,
  high DOUBLE PRECISION,
  low DOUBLE PRECISION,
  close DOUBLE PRECISION,
  volume DOUBLE PRECISION,
  PRIMARY KEY (asset_id, ts)
);

SELECT create_hypertable('price_ohlcv', 'ts', if_not_exists => TRUE);

-- intraday ticks (higher frequency)
CREATE TABLE IF NOT EXISTS price_ticks (
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  ts TIMESTAMPTZ NOT NULL,
  price DOUBLE PRECISION,
  volume DOUBLE PRECISION,
  PRIMARY KEY (asset_id, ts)
);

SELECT create_hypertable('price_ticks', 'ts', if_not_exists => TRUE);

-- Indexes to speed lookups
CREATE INDEX IF NOT EXISTS idx_assets_symbol ON assets(symbol);
CREATE INDEX IF NOT EXISTS idx_ohlcv_asset_ts ON price_ohlcv(asset_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ticks_asset_ts ON price_ticks(asset_id, ts DESC);
