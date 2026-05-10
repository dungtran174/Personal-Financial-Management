-- ============================================================================
-- MIGRATION 004: Enable Compression on price_ticks
-- ============================================================================
-- Compresses old tick data to save 90%+ storage space
-- Data older than 7 days will be automatically compressed
-- Queries still work normally (TimescaleDB auto-decompresses)
-- ============================================================================

-- 1. Enable compression on price_ticks hypertable
ALTER TABLE price_ticks SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'asset_id',
  timescaledb.compress_orderby = 'ts DESC'
);

-- 2. Add compression policy (compress after 7 days)
SELECT add_compression_policy(
  'price_ticks', 
  INTERVAL '7 days', 
  if_not_exists => TRUE
);

-- ============================================================================
-- Verification Queries (Run after migration)
-- ============================================================================

-- Check compression settings:
-- SELECT * FROM timescaledb_information.compression_settings 
-- WHERE hypertable_name = 'price_ticks';

-- Check compression jobs:
-- SELECT * FROM timescaledb_information.jobs 
-- WHERE proc_name = 'policy_compression';

-- Check compression stats (after 7 days):
-- SELECT 
--   pg_size_pretty(before_compression_total_bytes) AS before,
--   pg_size_pretty(after_compression_total_bytes) AS after,
--   100 - (after_compression_total_bytes::numeric / before_compression_total_bytes * 100)::numeric(10,2) AS savings_pct
-- FROM timescaledb_information.compressed_chunk_stats
-- WHERE hypertable_name = 'price_ticks';

-- ============================================================================
