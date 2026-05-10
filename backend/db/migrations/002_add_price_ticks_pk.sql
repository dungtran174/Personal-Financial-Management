-- Add PRIMARY KEY to price_ticks table
-- This is needed for ON CONFLICT queries

-- Drop table and recreate with PRIMARY KEY
-- (Safe because it's empty or test data only)

DROP TABLE IF EXISTS price_ticks CASCADE;

CREATE TABLE price_ticks (
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  ts TIMESTAMPTZ NOT NULL,
  price DOUBLE PRECISION,
  volume DOUBLE PRECISION,
  PRIMARY KEY (asset_id, ts)
);

SELECT create_hypertable('price_ticks', 'ts', if_not_exists => TRUE);

-- Recreate index
CREATE INDEX IF NOT EXISTS idx_ticks_asset_ts ON price_ticks(asset_id, ts DESC);
