CREATE TABLE snipers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  query TEXT NOT NULL,
  min_price_cents INTEGER,
  max_price_cents INTEGER,
  exclude_words TEXT NOT NULL DEFAULT '[]',
  title_only INTEGER NOT NULL DEFAULT 1,
  postcode TEXT,
  distance_km INTEGER,
  l1_category_id INTEGER,
  category_id INTEGER,
  include_bids INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  needs_baseline INTEGER NOT NULL DEFAULT 1,
  consecutive_errors INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  last_checked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE seen (
  sniper_id INTEGER NOT NULL REFERENCES snipers(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  last_price_cents INTEGER NOT NULL,
  notified INTEGER NOT NULL DEFAULT 0,
  seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (sniper_id, item_id)
);

CREATE TABLE finds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sniper_id INTEGER NOT NULL REFERENCES snipers(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  title TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  has_price INTEGER NOT NULL,
  previous_price_cents INTEGER,
  deal_percent INTEGER,
  city TEXT NOT NULL,
  image_url TEXT,
  url TEXT NOT NULL,
  found_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX finds_found_at ON finds(found_at);
