import type { Sniper } from "./types";

export type SniperInput = Omit<
  Sniper,
  "id" | "baselinePending" | "pausedUntil" | "configVersion" | "consecutiveErrors" | "lastError" | "lastCheckedAt"
>;

export interface SeenUpsert {
  itemId: string;
  lastPriceCents: number;
  notified: boolean;
}

/** 0 = held for the morning summary, 1 = pushed, 2 = silent (pause/cap), 3 = included in a morning summary. */
export type PushState = 0 | 1 | 2 | 3;

export interface FindInsert {
  sniperId: number;
  itemId: string;
  title: string;
  priceCents: number;
  hasPrice: boolean;
  previousPriceCents: number | null;
  dealPercent: number | null;
  city: string;
  imageUrl: string | null;
  url: string;
  sellerId: number | null;
  sellerName: string | null;
  query: string | null;
  pushed: PushState;
}

export interface Find extends FindInsert {
  id: number;
  sniperName: string | null;
  starred: boolean;
  foundAt: string;
}

export interface Settings {
  quietEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  webhookActive: boolean;
}

export interface BlockedSeller {
  sellerId: number;
  sellerName: string | null;
  blockedAt: string;
}

const CHUNK = 90;
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

const DEFAULT_SETTINGS: Settings = { quietEnabled: true, quietStart: "23:00", quietEnd: "07:00", webhookActive: false };

function toSniper(r: any): Sniper {
  return {
    id: r.id,
    name: r.name,
    queries: JSON.parse(r.queries || "[]"),
    minPriceCents: r.min_price_cents,
    maxPriceCents: r.max_price_cents,
    excludeWords: JSON.parse(r.exclude_words || "[]"),
    titleOnly: !!r.title_only,
    postcode: r.postcode,
    distanceKm: r.distance_km,
    l1CategoryId: r.l1_category_id,
    categoryId: r.category_id,
    includeBids: !!r.include_bids,
    active: !!r.active,
    baselinePending: JSON.parse(r.baseline_pending || "[]"),
    pausedUntil: r.paused_until,
    configVersion: r.config_version,
    consecutiveErrors: r.consecutive_errors,
    lastError: r.last_error,
    // Quiet runs only bump run_stats (one write), so take the newest of both.
    lastCheckedAt: [r.last_run_at, r.last_checked_at].filter(Boolean).sort().pop() ?? null,
  };
}

const SNIPER_SELECT =
  "SELECT s.*, (SELECT MAX(last_run_at) FROM run_stats WHERE sniper_id = s.id) AS last_run_at FROM snipers s";

function inputValues(i: SniperInput) {
  const queries = JSON.stringify(i.queries);
  return [
    i.name, i.queries[0] ?? "", queries, i.minPriceCents, i.maxPriceCents, JSON.stringify(i.excludeWords),
    i.titleOnly ? 1 : 0, i.postcode, i.distanceKm, i.l1CategoryId, i.categoryId, i.includeBids ? 1 : 0,
    i.active ? 1 : 0, queries,
  ];
}

export async function listSnipers(db: D1Database): Promise<Sniper[]> {
  const { results } = await db.prepare(`${SNIPER_SELECT} ORDER BY s.id`).all();
  return results.map(toSniper);
}

export async function getSniper(db: D1Database, id: number): Promise<Sniper | null> {
  const r = await db.prepare(`${SNIPER_SELECT} WHERE s.id = ?`).bind(id).first();
  return r ? toSniper(r) : null;
}

export async function countSnipers(db: D1Database): Promise<number> {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM snipers").first<{ n: number }>();
  return r?.n ?? 0;
}

/** Total number of search terms over all snipers, optionally leaving one sniper out. */
export async function countTerms(db: D1Database, excludeId?: number): Promise<number> {
  const r = await db
    .prepare("SELECT COALESCE(SUM(json_array_length(queries)), 0) AS n FROM snipers WHERE id != ?")
    .bind(excludeId ?? -1)
    .first<{ n: number }>();
  return r?.n ?? 0;
}

export async function createSniper(db: D1Database, input: SniperInput): Promise<number> {
  const r = await db
    .prepare(
      `INSERT INTO snipers (name, query, queries, min_price_cents, max_price_cents, exclude_words, title_only,
        postcode, distance_km, l1_category_id, category_id, include_bids, active, baseline_pending)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(...inputValues(input))
    .first<{ id: number }>();
  return r!.id;
}

export async function updateSniper(db: D1Database, id: number, input: SniperInput): Promise<void> {
  const v = inputValues(input);
  await db.batch([
    db.prepare("DELETE FROM seen WHERE sniper_id = ?").bind(id),
    db
      .prepare(
        `UPDATE snipers SET name = ?, query = ?, queries = ?, min_price_cents = ?, max_price_cents = ?,
          exclude_words = ?, title_only = ?, postcode = ?, distance_km = ?, l1_category_id = ?, category_id = ?,
          include_bids = ?, active = ?, baseline_pending = ?, config_version = config_version + 1 WHERE id = ?`,
      )
      .bind(...v, id),
  ]);
}

export async function setActive(db: D1Database, id: number, active: boolean): Promise<void> {
  if (!active) {
    await db.prepare("UPDATE snipers SET active = 0 WHERE id = ?").bind(id).run();
    return;
  }
  await db.batch([
    db.prepare("DELETE FROM seen WHERE sniper_id = ?").bind(id),
    db
      .prepare(
        "UPDATE snipers SET active = 1, baseline_pending = queries, config_version = config_version + 1 WHERE id = ?",
      )
      .bind(id),
  ]);
}

export async function setPausedUntil(db: D1Database, id: number, until: string | null): Promise<void> {
  await db.prepare("UPDATE snipers SET paused_until = ? WHERE id = ?").bind(until, id).run();
}

export async function deleteSniper(db: D1Database, id: number): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM seen WHERE sniper_id = ?").bind(id),
    db.prepare("DELETE FROM finds WHERE sniper_id = ?").bind(id),
    db.prepare("DELETE FROM snipers WHERE id = ?").bind(id),
  ]);
}

function seenSelects(db: D1Database, sniperId: number, itemIds: string[]): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = [];
  for (let i = 0; i < itemIds.length; i += CHUNK) {
    const chunk = itemIds.slice(i, i + CHUNK);
    stmts.push(
      db
        .prepare(
          `SELECT item_id, last_price_cents, notified FROM seen
           WHERE sniper_id = ? AND item_id IN (${chunk.map(() => "?").join(",")})`,
        )
        .bind(sniperId, ...chunk),
    );
  }
  return stmts;
}

type SeenMap = Map<string, { lastPriceCents: number; notified: boolean }>;

function toSeenMap(results: D1Result<any>[]): SeenMap {
  const map: SeenMap = new Map();
  for (const r of results) {
    for (const row of r.results) map.set(row.item_id, { lastPriceCents: row.last_price_cents, notified: !!row.notified });
  }
  return map;
}

export async function getSeen(db: D1Database, sniperId: number, itemIds: string[]): Promise<SeenMap> {
  const stmts = seenSelects(db, sniperId, itemIds);
  return stmts.length ? toSeenMap(await db.batch(stmts)) : new Map();
}

// One D1 round trip: read seen state for the ids plus the caller's writes (run stats,
// error reset). Keeps quiet runs cheap on CPU and on D1 writes.
export async function loadSeenAndTouch(
  db: D1Database,
  sniperId: number,
  itemIds: string[],
  writes: D1PreparedStatement[] = [],
): Promise<SeenMap> {
  const selects = seenSelects(db, sniperId, itemIds);
  const results = await db.batch([...selects, ...writes]);
  return toSeenMap(results.slice(0, selects.length));
}

export interface Claim {
  itemId: string;
  lastPriceCents: number;
  /** null for a new listing, else the price stored before this run (a price drop). */
  previousPriceCents: number | null;
}

// Atomically mark matches as notified before anything is pushed. Runs of the same
// sniper (one per term) can overlap; only the run whose write lands first gets the
// item back and may push it.
export async function claimItems(db: D1Database, sniperId: number, claims: Claim[]): Promise<Set<string>> {
  if (claims.length === 0) return new Set();
  const insert = db.prepare(
    `INSERT INTO seen (sniper_id, item_id, last_price_cents, notified) VALUES (?, ?, ?, 1)
     ON CONFLICT (sniper_id, item_id) DO NOTHING RETURNING item_id`,
  );
  const drop = db.prepare(
    `UPDATE seen SET notified = 1, last_price_cents = ?
     WHERE sniper_id = ? AND item_id = ? AND notified = 0 RETURNING item_id`,
  );
  const results = await db.batch<{ item_id: string }>(
    claims.map((c) =>
      c.previousPriceCents == null
        ? insert.bind(sniperId, c.itemId, c.lastPriceCents)
        : drop.bind(c.lastPriceCents, sniperId, c.itemId),
    ),
  );
  return new Set(results.flatMap((r) => r.results.map((row) => row.item_id)));
}

// Undo a claim whose notification failed, so a later run detects it again.
export function releaseClaimStmt(db: D1Database, sniperId: number, c: Claim): D1PreparedStatement {
  return c.previousPriceCents == null
    ? db.prepare("DELETE FROM seen WHERE sniper_id = ? AND item_id = ?").bind(sniperId, c.itemId)
    : db
        .prepare("UPDATE seen SET notified = 0, last_price_cents = ? WHERE sniper_id = ? AND item_id = ?")
        .bind(c.previousPriceCents, sniperId, c.itemId);
}

export function resetErrorsStmt(db: D1Database, sniperId: number): D1PreparedStatement {
  return db.prepare("UPDATE snipers SET consecutive_errors = 0, last_error = NULL WHERE id = ?").bind(sniperId);
}

export async function saveRun(
  db: D1Database,
  sniperId: number,
  upserts: SeenUpsert[],
  finds: FindInsert[],
  opts: { baselineTerm?: string; configVersion?: number; extra?: D1PreparedStatement[] },
): Promise<void> {
  const stmts: D1PreparedStatement[] = [];
  const upsert = db.prepare(
    `INSERT INTO seen (sniper_id, item_id, last_price_cents, notified) VALUES (?, ?, ?, ?)
     ON CONFLICT (sniper_id, item_id) DO UPDATE SET
       last_price_cents = excluded.last_price_cents,
       notified = MAX(seen.notified, excluded.notified)`,
  );
  for (const u of upserts) stmts.push(upsert.bind(sniperId, u.itemId, u.lastPriceCents, u.notified ? 1 : 0));
  const insertFind = db.prepare(
    `INSERT INTO finds (sniper_id, item_id, title, price_cents, has_price, previous_price_cents, deal_percent,
      city, image_url, url, seller_id, seller_name, query, pushed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const f of finds) {
    stmts.push(
      insertFind.bind(f.sniperId, f.itemId, f.title, f.priceCents, f.hasPrice ? 1 : 0, f.previousPriceCents,
        f.dealPercent, f.city, f.imageUrl, f.url, f.sellerId, f.sellerName, f.query, f.pushed),
    );
  }
  stmts.push(
    db
      .prepare(`UPDATE snipers SET last_checked_at = ${NOW}, consecutive_errors = 0, last_error = NULL WHERE id = ?`)
      .bind(sniperId),
  );
  stmts.push(...(opts.extra ?? []));
  if (opts.baselineTerm != null) {
    // Atomic, and only if the sniper was not edited while this run was in flight.
    stmts.push(
      db
        .prepare(
          `UPDATE snipers SET baseline_pending =
             (SELECT COALESCE(json_group_array(value), '[]') FROM json_each(snipers.baseline_pending) WHERE value != ?)
           WHERE id = ? AND config_version = ?`,
        )
        .bind(opts.baselineTerm, sniperId, opts.configVersion ?? 0),
    );
  }
  await db.batch(stmts);
}

export async function recordError(
  db: D1Database,
  sniperId: number,
  message: string,
  extra: D1PreparedStatement[] = [],
): Promise<number> {
  const [r] = await db.batch<{ consecutive_errors: number }>([
    db
      .prepare(
        `UPDATE snipers SET consecutive_errors = consecutive_errors + 1, last_error = ?, last_checked_at = ${NOW}
         WHERE id = ? RETURNING consecutive_errors`,
      )
      .bind(message, sniperId),
    ...extra,
  ]);
  return r.results[0]?.consecutive_errors ?? 0;
}

const FIND_SELECT = "SELECT f.*, s.name AS sniper_name FROM finds f LEFT JOIN snipers s ON s.id = f.sniper_id";

export async function recentFinds(db: D1Database, limit = 50): Promise<Find[]> {
  const { results } = await db.prepare(`${FIND_SELECT} ORDER BY f.id DESC LIMIT ?`).bind(limit).all<any>();
  return results.map(toFind);
}

// The newest `perSniper` finds of every sniper, newest first within each sniper.
export async function recentFindsPerSniper(db: D1Database, perSniper = 10): Promise<Find[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM (
         SELECT f.*, s.name AS sniper_name,
                ROW_NUMBER() OVER (PARTITION BY f.sniper_id ORDER BY f.id DESC) AS rn
         FROM finds f JOIN snipers s ON s.id = f.sniper_id
       ) WHERE rn <= ? ORDER BY sniper_id, id DESC`,
    )
    .bind(perSniper)
    .all<any>();
  return results.map(toFind);
}

export async function starredFinds(db: D1Database): Promise<Find[]> {
  const { results } = await db.prepare(`${FIND_SELECT} WHERE f.starred = 1 ORDER BY f.id DESC`).all<any>();
  return results.map(toFind);
}

export async function findByItem(db: D1Database, sniperId: number, itemId: string): Promise<Find | null> {
  const r = await db
    .prepare(`${FIND_SELECT} WHERE f.sniper_id = ? AND f.item_id = ? ORDER BY f.id DESC LIMIT 1`)
    .bind(sniperId, itemId)
    .first<any>();
  return r ? toFind(r) : null;
}

export async function setStarred(db: D1Database, findId: number, starred: boolean): Promise<boolean> {
  const r = await db.prepare("UPDATE finds SET starred = ? WHERE id = ?").bind(starred ? 1 : 0, findId).run();
  return (r.meta?.changes ?? 0) > 0;
}

/** Finds held back during quiet hours, oldest first. */
export async function heldFinds(db: D1Database): Promise<Find[]> {
  const { results } = await db.prepare(`${FIND_SELECT} WHERE f.pushed = 0 ORDER BY f.id`).all<any>();
  return results.map(toFind);
}

export async function markFindsPushed(db: D1Database, ids: number[], state: PushState): Promise<void> {
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    await db
      .prepare(`UPDATE finds SET pushed = ? WHERE id IN (${chunk.map(() => "?").join(",")})`)
      .bind(state, ...chunk)
      .run();
  }
}

function toFind(r: any): Find {
  return {
    id: r.id,
    sniperId: r.sniper_id,
    sniperName: r.sniper_name,
    itemId: r.item_id,
    title: r.title,
    priceCents: r.price_cents,
    hasPrice: !!r.has_price,
    previousPriceCents: r.previous_price_cents,
    dealPercent: r.deal_percent,
    city: r.city,
    imageUrl: r.image_url,
    url: r.url,
    sellerId: r.seller_id,
    sellerName: r.seller_name,
    query: r.query,
    pushed: r.pushed,
    starred: !!r.starred,
    foundAt: r.found_at,
  };
}

// Seen rows are deliberately never pruned by age: a still-listed old ad would
// otherwise come back as "new" and trigger a notification flood. Starred finds are kept.
export async function pruneSeen(db: D1Database, now = Date.now()): Promise<void> {
  const cutoff = new Date(now - 8 * 86_400_000).toISOString().slice(0, 13);
  await db.batch([
    db.prepare(
      `DELETE FROM finds WHERE starred = 0 AND id NOT IN
         (SELECT id FROM finds WHERE starred = 0 ORDER BY id DESC LIMIT 500)`,
    ),
    db.prepare("DELETE FROM run_stats WHERE hour < ?").bind(cutoff),
    db.prepare("DELETE FROM cron_stats WHERE hour < ?").bind(cutoff),
  ]);
}

export async function blockSeller(db: D1Database, sellerId: number, sellerName: string | null): Promise<void> {
  await db
    .prepare("INSERT INTO blocked_sellers (seller_id, seller_name) VALUES (?, ?) ON CONFLICT (seller_id) DO NOTHING")
    .bind(sellerId, sellerName)
    .run();
}

export async function unblockSeller(db: D1Database, sellerId: number): Promise<void> {
  await db.prepare("DELETE FROM blocked_sellers WHERE seller_id = ?").bind(sellerId).run();
}

export async function listBlocked(db: D1Database): Promise<BlockedSeller[]> {
  const { results } = await db.prepare("SELECT * FROM blocked_sellers ORDER BY blocked_at DESC").all<any>();
  return results.map((r) => ({ sellerId: r.seller_id, sellerName: r.seller_name, blockedAt: r.blocked_at }));
}

export async function getSettings(db: D1Database): Promise<Settings> {
  const { results } = await db.prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>();
  const s: Settings = { ...DEFAULT_SETTINGS };
  for (const { key, value } of results) {
    if (key === "quietEnabled" || key === "webhookActive") s[key] = value === "1";
    if (key === "quietStart" || key === "quietEnd") s[key] = value;
  }
  return s;
}

export async function saveSettings(db: D1Database, patch: Partial<Settings>): Promise<void> {
  const stmt = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
  );
  const stmts = Object.entries(patch).map(([k, v]) => stmt.bind(k, typeof v === "boolean" ? (v ? "1" : "0") : String(v)));
  if (stmts.length) await db.batch(stmts);
}
