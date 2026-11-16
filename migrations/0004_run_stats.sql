-- Hourly counters per sniper term; one upsert per run instead of a log row (D1 free write quota).
CREATE TABLE run_stats (
  sniper_id INTEGER NOT NULL,
  term TEXT NOT NULL,
  hour TEXT NOT NULL, -- UTC, 'YYYY-MM-DDTHH'
  runs INTEGER NOT NULL DEFAULT 0,
  ok INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  baselines INTEGER NOT NULL DEFAULT 0,
  listings INTEGER NOT NULL DEFAULT 0,
  new_seen INTEGER NOT NULL DEFAULT 0,
  matched INTEGER NOT NULL DEFAULT 0,
  pushed INTEGER NOT NULL DEFAULT 0,
  held INTEGER NOT NULL DEFAULT 0,
  silent INTEGER NOT NULL DEFAULT 0,
  total_ms INTEGER NOT NULL DEFAULT 0,
  last_run_at TEXT,
  last_status TEXT,
  last_error TEXT,
  last_ms INTEGER,
  PRIMARY KEY (sniper_id, term, hour)
);

CREATE TABLE cron_stats (
  hour TEXT PRIMARY KEY,
  ticks INTEGER NOT NULL DEFAULT 0,
  dispatched INTEGER NOT NULL DEFAULT 0,
  last_tick_at TEXT
);
