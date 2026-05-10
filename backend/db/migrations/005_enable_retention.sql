-- ============================================================================
-- MIGRATION 005: Enable Retention Policy on price_ticks
-- ============================================================================
-- Automatically deletes raw ticks older than 90 days
-- Continuous aggregates (OHLCV views) are NOT deleted
-- You can still query historical OHLCV data from aggregate views
-- ============================================================================

-- IMPORTANT: Choose retention period based on your needs:
-- - 7 days: For day trading only
-- - 30 days: For swing trading
-- - 90 days: For long-term analysis (RECOMMENDED)
-- - Comment out this migration if you want to keep all raw data

-- Add retention policy (delete after 90 days)
SELECT add_retention_policy(
  'price_ticks', 
  INTERVAL '90 days', 
  if_not_exists => TRUE
);

-- ============================================================================
-- Alternative Retention Periods
-- ============================================================================

-- For day trading only (7 days):
-- SELECT add_retention_policy('price_ticks', INTERVAL '7 days', if_not_exists => TRUE);

-- For swing trading (30 days):
-- SELECT add_retention_policy('price_ticks', INTERVAL '30 days', if_not_exists => TRUE);

-- For long-term analysis (180 days):
-- SELECT add_retention_policy('price_ticks', INTERVAL '180 days', if_not_exists => TRUE);

-- ============================================================================
-- Verification Queries (Run after migration)
-- ============================================================================

-- Check retention policy:
-- SELECT * FROM timescaledb_information.jobs 
-- WHERE proc_name = 'policy_retention';

-- Check oldest tick data:
-- SELECT 
--   DATE(MIN(ts)) as oldest_tick,
--   DATE(MAX(ts)) as newest_tick,
--   AGE(MAX(ts), MIN(ts)) as data_span
-- FROM price_ticks;

-- Check data count by date:
-- SELECT 
--   DATE(ts) as date,
--   COUNT(*) as tick_count
-- FROM price_ticks
-- GROUP BY DATE(ts)
-- ORDER BY date ASC
-- LIMIT 10;

-- ============================================================================
-- IMPORTANT NOTES
-- ============================================================================
-- 1. Continuous aggregates (price_ohlcv_1m, price_ohlcv_5m, etc.) are NOT affected
-- 2. You can still query historical OHLCV data after raw ticks are deleted
-- 3. Retention runs automatically in background (default: daily)
-- 4. First deletion happens after 90 days from NOW
-- 5. To disable: SELECT remove_retention_policy('price_ticks');
-- ============================================================================
