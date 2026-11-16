-- Multiple search terms per sniper, with a per-term baseline.
ALTER TABLE snipers ADD COLUMN queries TEXT NOT NULL DEFAULT '[]';
ALTER TABLE snipers ADD COLUMN baseline_pending TEXT NOT NULL DEFAULT '[]';
ALTER TABLE snipers ADD COLUMN paused_until TEXT;
UPDATE snipers SET queries = json_array(query);
UPDATE snipers SET baseline_pending = CASE WHEN needs_baseline = 1 THEN json_array(query) ELSE '[]' END;

-- pushed: 0 = held for the morning summary, 1 = pushed, 2 = silent (pause/cap), 3 = in a morning summary.
ALTER TABLE finds ADD COLUMN starred INTEGER NOT NULL DEFAULT 0;
ALTER TABLE finds ADD COLUMN pushed INTEGER NOT NULL DEFAULT 1;
ALTER TABLE finds ADD COLUMN seller_id INTEGER;
ALTER TABLE finds ADD COLUMN seller_name TEXT;
ALTER TABLE finds ADD COLUMN query TEXT;

CREATE TABLE blocked_sellers (
  seller_id INTEGER PRIMARY KEY,
  seller_name TEXT,
  blocked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
