-- ============================================================================
-- PRODUCTION DATABASE SETUP SCRIPT
-- ============================================================================
-- This script sets up the database with the CORRECT configuration
-- based on lessons learned from production debugging.
--
-- Run this after initial schema.sql
-- 
-- Usage:
--   docker exec -it finance_postgres psql -U postgres -d finance -f /path/to/006_production_setup.sql
-- ============================================================================

-- ============================================================================
-- 1. CONTINUOUS AGGREGATES (With proper columns)
-- ============================================================================

-- Drop existing views if they have wrong structure
-- Uncomment if you need to recreate:
-- DROP MATERIALIZED VIEW IF EXISTS price_ohlcv_1m CASCADE;
-- DROP MATERIALIZED VIEW IF EXISTS price_ohlcv_5m CASCADE;
-- DROP MATERIALIZED VIEW IF EXISTS price_ohlcv_15m CASCADE;
-- DROP MATERIALIZED VIEW IF EXISTS price_ohlcv_1h CASCADE;
-- DROP MATERIALIZED VIEW IF EXISTS price_ohlcv_4h CASCADE;

-- 1-Minute Candles
CREATE MATERIALIZED VIEW IF NOT EXISTS price_ohlcv_1m
WITH (timescaledb.continuous) AS
SELECT 
  asset_id,
  time_bucket('1 minute', ts) AS ts,
  FIRST(price, ts) AS open,
  MAX(price) AS high,
  MIN(price) AS low,
  LAST(price, ts) AS close,
  SUM(volume) AS volume,
  COUNT(*) AS tick_count
FROM price_ticks
GROUP BY asset_id, time_bucket('1 minute', ts)
WITH NO DATA;

-- 5-Minute Candles
CREATE MATERIALIZED VIEW IF NOT EXISTS price_ohlcv_5m
WITH (timescaledb.continuous) AS
SELECT 
  asset_id,
  time_bucket('5 minutes', ts) AS ts,
  FIRST(price, ts) AS open,
  MAX(price) AS high,
  MIN(price) AS low,
  LAST(price, ts) AS close,
  SUM(volume) AS volume,
  COUNT(*) AS tick_count
FROM price_ticks
GROUP BY asset_id, time_bucket('5 minutes', ts)
WITH NO DATA;

-- 15-Minute Candles
CREATE MATERIALIZED VIEW IF NOT EXISTS price_ohlcv_15m
WITH (timescaledb.continuous) AS
SELECT 
  asset_id,
  time_bucket('15 minutes', ts) AS ts,
  FIRST(price, ts) AS open,
  MAX(price) AS high,
  MIN(price) AS low,
  LAST(price, ts) AS close,
  SUM(volume) AS volume,
  COUNT(*) AS tick_count
FROM price_ticks
GROUP BY asset_id, time_bucket('15 minutes', ts)
WITH NO DATA;

-- 1-Hour Candles
CREATE MATERIALIZED VIEW IF NOT EXISTS price_ohlcv_1h
WITH (timescaledb.continuous) AS
SELECT 
  asset_id,
  time_bucket('1 hour', ts) AS ts,
  FIRST(price, ts) AS open,
  MAX(price) AS high,
  MIN(price) AS low,
  LAST(price, ts) AS close,
  SUM(volume) AS volume,
  COUNT(*) AS tick_count
FROM price_ticks
GROUP BY asset_id, time_bucket('1 hour', ts)
WITH NO DATA;

-- 4-Hour Candles
CREATE MATERIALIZED VIEW IF NOT EXISTS price_ohlcv_4h
WITH (timescaledb.continuous) AS
SELECT 
  asset_id,
  time_bucket('4 hours', ts) AS ts,
  FIRST(price, ts) AS open,
  MAX(price) AS high,
  MIN(price) AS low,
  LAST(price, ts) AS close,
  SUM(volume) AS volume,
  COUNT(*) AS tick_count
FROM price_ticks
GROUP BY asset_id, time_bucket('4 hours', ts)
WITH NO DATA;

-- ============================================================================
-- 2. REFRESH POLICIES (CRITICAL: Use LARGE start_offset!)
-- ============================================================================
-- IMPORTANT: Small start_offset (like 10 minutes) causes data loss!
-- Use days, not minutes, to ensure old data is not deleted from views.
-- ============================================================================

-- Remove old policies first (if they exist with wrong settings)
SELECT remove_continuous_aggregate_policy('price_ohlcv_1m', if_exists => TRUE);
SELECT remove_continuous_aggregate_policy('price_ohlcv_5m', if_exists => TRUE);
SELECT remove_continuous_aggregate_policy('price_ohlcv_15m', if_exists => TRUE);
SELECT remove_continuous_aggregate_policy('price_ohlcv_1h', if_exists => TRUE);
SELECT remove_continuous_aggregate_policy('price_ohlcv_4h', if_exists => TRUE);

-- 1m: Refresh last 3 days every minute
SELECT add_continuous_aggregate_policy('price_ohlcv_1m',
  start_offset => INTERVAL '3 days',
  end_offset => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute',
  if_not_exists => TRUE
);

-- 5m: Refresh last 7 days every 5 minutes
SELECT add_continuous_aggregate_policy('price_ohlcv_5m',
  start_offset => INTERVAL '7 days',
  end_offset => INTERVAL '5 minutes',
  schedule_interval => INTERVAL '5 minutes',
  if_not_exists => TRUE
);

-- 15m: Refresh last 14 days every 15 minutes
SELECT add_continuous_aggregate_policy('price_ohlcv_15m',
  start_offset => INTERVAL '14 days',
  end_offset => INTERVAL '15 minutes',
  schedule_interval => INTERVAL '15 minutes',
  if_not_exists => TRUE
);

-- 1h: Refresh last 30 days every 30 minutes
SELECT add_continuous_aggregate_policy('price_ohlcv_1h',
  start_offset => INTERVAL '30 days',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '30 minutes',
  if_not_exists => TRUE
);

-- 4h: Refresh last 60 days every hour
SELECT add_continuous_aggregate_policy('price_ohlcv_4h',
  start_offset => INTERVAL '60 days',
  end_offset => INTERVAL '4 hours',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists => TRUE
);

-- ============================================================================
-- 3. COMPRESSION POLICY
-- ============================================================================

ALTER TABLE price_ticks SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'asset_id',
  timescaledb.compress_orderby = 'ts DESC'
);

SELECT add_compression_policy(
  'price_ticks', 
  INTERVAL '7 days', 
  if_not_exists => TRUE
);

-- ============================================================================
-- 4. RETENTION POLICY
-- ============================================================================

SELECT add_retention_policy(
  'price_ticks', 
  INTERVAL '90 days', 
  if_not_exists => TRUE
);

-- ============================================================================
-- 5. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_ohlcv_1m_asset_ts ON price_ohlcv_1m(asset_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ohlcv_5m_asset_ts ON price_ohlcv_5m(asset_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ohlcv_15m_asset_ts ON price_ohlcv_15m(asset_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ohlcv_1h_asset_ts ON price_ohlcv_1h(asset_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ohlcv_4h_asset_ts ON price_ohlcv_4h(asset_id, ts DESC);

-- ============================================================================
-- 6. INITIAL DATA REFRESH (Run after first data ingestion)
-- ============================================================================
-- Uncomment and run these after you have data in price_ticks:
--
-- CALL refresh_continuous_aggregate('price_ohlcv_1m', NULL, NULL);
-- CALL refresh_continuous_aggregate('price_ohlcv_5m', NULL, NULL);
-- CALL refresh_continuous_aggregate('price_ohlcv_15m', NULL, NULL);
-- CALL refresh_continuous_aggregate('price_ohlcv_1h', NULL, NULL);
-- CALL refresh_continuous_aggregate('price_ohlcv_4h', NULL, NULL);

-- ============================================================================
-- 7. VERIFICATION QUERIES
-- ============================================================================

-- Check policies are correct:
SELECT 
  j.job_id,
  ca.view_name,
  j.config->>'start_offset' as start_offset,
  j.config->>'end_offset' as end_offset,
  j.schedule_interval
FROM timescaledb_information.jobs j
JOIN timescaledb_information.continuous_aggregates ca 
  ON j.hypertable_name = ca.materialization_hypertable_name
WHERE j.proc_name = 'policy_refresh_continuous_aggregate'
ORDER BY ca.view_name;

-- Check compression:
SELECT * FROM timescaledb_information.jobs 
WHERE proc_name = 'policy_compression';

-- Check retention:
SELECT * FROM timescaledb_information.jobs 
WHERE proc_name = 'policy_retention';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
