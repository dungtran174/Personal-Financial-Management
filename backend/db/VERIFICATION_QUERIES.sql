-- ============================================================================
-- TIMESCALEDB VERIFICATION QUERIES
-- ============================================================================
-- Run these queries to check your TimescaleDB setup
-- ============================================================================

-- ============================================================================
-- 1. CHECK HYPERTABLES
-- ============================================================================
SELECT 
  hypertable_name, 
  num_chunks, 
  compression_enabled,
  tablespaces
FROM timescaledb_information.hypertables
ORDER BY hypertable_name;

-- ============================================================================
-- 2. CHECK CONTINUOUS AGGREGATES
-- ============================================================================
SELECT 
  view_name,
  materialized_only,
  compression_enabled,
  finalized
FROM timescaledb_information.continuous_aggregates
ORDER BY view_name;

-- ============================================================================
-- 3. CHECK ALL JOBS (Refresh, Compression, Retention)
-- ============================================================================
SELECT 
  job_id,
  application_name,
  schedule_interval,
  proc_name,
  scheduled
FROM timescaledb_information.jobs
ORDER BY job_id;

-- ============================================================================
-- 4. CHECK JOB STATS (Last Run Status)
-- ============================================================================
SELECT 
  job_id,
  hypertable_name,
  last_run_status,
  last_successful_finish,
  next_start,
  total_runs,
  total_successes,
  total_failures
FROM timescaledb_information.job_stats
ORDER BY job_id;

-- ============================================================================
-- 5. CHECK COMPRESSION SETTINGS
-- ============================================================================
SELECT * 
FROM timescaledb_information.compression_settings
WHERE hypertable_name IN ('price_ticks', 'price_ohlcv');

-- ============================================================================
-- 6. CHECK COMPRESSION STATS (Storage Savings)
-- ============================================================================
SELECT 
  hypertable_name,
  pg_size_pretty(before_compression_total_bytes) AS before,
  pg_size_pretty(after_compression_total_bytes) AS after,
  pg_size_pretty(before_compression_total_bytes - after_compression_total_bytes) AS saved,
  ROUND(100 - (after_compression_total_bytes::numeric / before_compression_total_bytes * 100), 2) AS savings_pct
FROM timescaledb_information.compressed_chunk_stats
WHERE hypertable_name = 'price_ticks';

-- ============================================================================
-- 7. CHECK CHUNKS (Compressed vs Uncompressed)
-- ============================================================================
SELECT 
  hypertable_name,
  COUNT(*) as total_chunks,
  COUNT(*) FILTER (WHERE is_compressed = true) as compressed_chunks,
  COUNT(*) FILTER (WHERE is_compressed = false) as uncompressed_chunks,
  pg_size_pretty(SUM(total_bytes)) as total_size,
  pg_size_pretty(SUM(total_bytes) FILTER (WHERE is_compressed = true)) as compressed_size,
  pg_size_pretty(SUM(total_bytes) FILTER (WHERE is_compressed = false)) as uncompressed_size
FROM timescaledb_information.chunks
WHERE hypertable_name IN ('price_ticks', 'price_ohlcv')
GROUP BY hypertable_name;

-- ============================================================================
-- 8. CHECK DATA COVERAGE (Oldest/Newest Tick)
-- ============================================================================
SELECT 
  a.symbol,
  a.asset_type,
  MIN(pt.ts) as oldest_tick,
  MAX(pt.ts) as newest_tick,
  AGE(MAX(pt.ts), MIN(pt.ts)) as data_span,
  COUNT(*) as tick_count
FROM assets a
JOIN price_ticks pt ON a.id = pt.asset_id
WHERE a.status = 'OK'
GROUP BY a.id, a.symbol, a.asset_type
ORDER BY tick_count DESC
LIMIT 20;

-- ============================================================================
-- 9. CHECK DATA GAPS (Assets with Gap > 1 Hour)
-- ============================================================================
SELECT 
  a.symbol,
  a.asset_type,
  MAX(pt.ts) as last_tick,
  NOW() - MAX(pt.ts) as gap,
  EXTRACT(EPOCH FROM (NOW() - MAX(pt.ts)))/3600 as gap_hours
FROM assets a
LEFT JOIN price_ticks pt ON a.id = pt.asset_id
WHERE a.status = 'OK'
GROUP BY a.id, a.symbol, a.asset_type
HAVING NOW() - MAX(pt.ts) > INTERVAL '1 hour'
ORDER BY gap DESC;

-- ============================================================================
-- 10. CHECK CONTINUOUS AGGREGATE DATA
-- ============================================================================
-- Count candles in each aggregate view
SELECT 'price_ohlcv_1m' as view_name, COUNT(*) as candle_count FROM price_ohlcv_1m
UNION ALL
SELECT 'price_ohlcv_5m', COUNT(*) FROM price_ohlcv_5m
UNION ALL
SELECT 'price_ohlcv_15m', COUNT(*) FROM price_ohlcv_15m
UNION ALL
SELECT 'price_ohlcv_1h', COUNT(*) FROM price_ohlcv_1h
UNION ALL
SELECT 'price_ohlcv_4h', COUNT(*) FROM price_ohlcv_4h;

-- ============================================================================
-- 11. CHECK TICK COUNT BY DATE (Last 7 Days)
-- ============================================================================
SELECT 
  DATE(ts) as date,
  COUNT(*) as tick_count,
  COUNT(DISTINCT asset_id) as unique_assets
FROM price_ticks
WHERE ts > NOW() - INTERVAL '7 days'
GROUP BY DATE(ts)
ORDER BY date DESC;

-- ============================================================================
-- 12. CHECK DATABASE SIZE
-- ============================================================================
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE tablename IN ('price_ticks', 'price_ohlcv', 'price_ohlcv_1m', 'price_ohlcv_5m', 'price_ohlcv_15m', 'price_ohlcv_1h', 'price_ohlcv_4h')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- ============================================================================
-- 13. REFRESH CONTINUOUS AGGREGATE MANUALLY (If Needed)
-- ============================================================================
-- CALL refresh_continuous_aggregate('price_ohlcv_1m', NULL, NULL);
-- CALL refresh_continuous_aggregate('price_ohlcv_5m', NULL, NULL);
-- CALL refresh_continuous_aggregate('price_ohlcv_15m', NULL, NULL);
-- CALL refresh_continuous_aggregate('price_ohlcv_1h', NULL, NULL);
-- CALL refresh_continuous_aggregate('price_ohlcv_4h', NULL, NULL);

-- ============================================================================
-- 14. COMPRESS CHUNKS MANUALLY (If Needed)
-- ============================================================================
-- SELECT compress_chunk(i.chunk_schema || '.' || i.chunk_name)
-- FROM timescaledb_information.chunks i
-- WHERE i.hypertable_name = 'price_ticks'
--   AND i.is_compressed = false
--   AND i.range_end < NOW() - INTERVAL '7 days';

-- ============================================================================
-- 15. CHECK FAILED JOBS
-- ============================================================================
SELECT 
  js.job_id,
  j.application_name,
  js.last_run_status,
  js.last_run_started_at,
  js.last_run_finished_at,
  js.last_run_duration,
  js.total_failures
FROM timescaledb_information.job_stats js
JOIN timescaledb_information.jobs j ON js.job_id = j.job_id
WHERE js.last_run_status != 'Success'
ORDER BY js.last_run_finished_at DESC;

-- ============================================================================
