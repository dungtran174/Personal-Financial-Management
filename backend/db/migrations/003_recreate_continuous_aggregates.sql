-- Recreate continuous aggregates after price_ticks was recreated

-- 1. OHLCV 1 Minute Aggregate
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

-- 2. OHLCV 5 Minute Aggregate
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

-- 3. OHLCV 15 Minute Aggregate
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

-- 4. OHLCV 1 Hour Aggregate
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

-- 5. OHLCV 4 Hour Aggregate
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

-- Refresh policies
SELECT add_continuous_aggregate_policy('price_ohlcv_1m',
  start_offset => INTERVAL '10 minutes',
  end_offset => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute',
  if_not_exists => TRUE
);

SELECT add_continuous_aggregate_policy('price_ohlcv_5m',
  start_offset => INTERVAL '30 minutes',
  end_offset => INTERVAL '2 minutes',
  schedule_interval => INTERVAL '5 minutes',
  if_not_exists => TRUE
);

SELECT add_continuous_aggregate_policy('price_ohlcv_15m',
  start_offset => INTERVAL '1 hour',
  end_offset => INTERVAL '5 minutes',
  schedule_interval => INTERVAL '15 minutes',
  if_not_exists => TRUE
);

SELECT add_continuous_aggregate_policy('price_ohlcv_1h',
  start_offset => INTERVAL '3 hours',
  end_offset => INTERVAL '10 minutes',
  schedule_interval => INTERVAL '30 minutes',
  if_not_exists => TRUE
);

SELECT add_continuous_aggregate_policy('price_ohlcv_4h',
  start_offset => INTERVAL '12 hours',
  end_offset => INTERVAL '30 minutes',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists => TRUE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ohlcv_1m_asset_ts ON price_ohlcv_1m(asset_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ohlcv_5m_asset_ts ON price_ohlcv_5m(asset_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ohlcv_15m_asset_ts ON price_ohlcv_15m(asset_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ohlcv_1h_asset_ts ON price_ohlcv_1h(asset_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ohlcv_4h_asset_ts ON price_ohlcv_4h(asset_id, ts DESC);
