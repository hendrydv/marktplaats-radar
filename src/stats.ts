// Hourly counters for the status page. Every write is one upsert per run, so
// the D1 write budget stays the same as before (it replaced the "last checked" update).

export interface RunStat {
  sniperId: number;
  term: string;
  at: number;
  runs?: number;
  ok?: number;
  errors?: number;
  baselines?: number;
  listings?: number;
  newSeen?: number;
  matched?: number;
  pushed?: number;
  held?: number;
  silent?: number;
  /** Wall time of the Marktplaats request in ms; only with `status`. */
  ms?: number;
  /** Set on the per-run upsert; omitted on the follow-up counter upsert. */
  status?: "ok" | "baseline" | "error";
  error?: string;
}

export const hourKey = (ms: number): string => new Date(ms).toISOString().slice(0, 13);

export function runStatStmt(db: D1Database, s: RunStat): D1PreparedStatement {
  const at = s.status ? new Date(s.at).toISOString() : null;
  return db
    .prepare(
      `INSERT INTO run_stats (sniper_id, term, hour, runs, ok, errors, baselines, listings, new_seen, matched, pushed,
         held, silent, total_ms, last_run_at, last_status, last_error, last_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (sniper_id, term, hour) DO UPDATE SET
         runs = runs + excluded.runs, ok = ok + excluded.ok, errors = errors + excluded.errors,
         baselines = baselines + excluded.baselines, listings = listings + excluded.listings,
         new_seen = new_seen + excluded.new_seen, matched = matched + excluded.matched,
         pushed = pushed + excluded.pushed, held = held + excluded.held, silent = silent + excluded.silent,
         total_ms = total_ms + excluded.total_ms,
         last_run_at = COALESCE(excluded.last_run_at, last_run_at),
         last_status = COALESCE(excluded.last_status, last_status),
         last_error = COALESCE(excluded.last_error, last_error),
         last_ms = COALESCE(excluded.last_ms, last_ms)`,
    )
    .bind(
      s.sniperId, s.term, hourKey(s.at), s.runs ?? 0, s.ok ?? 0, s.errors ?? 0, s.baselines ?? 0, s.listings ?? 0,
      s.newSeen ?? 0, s.matched ?? 0, s.pushed ?? 0, s.held ?? 0, s.silent ?? 0, s.status ? (s.ms ?? 0) : 0,
      at, s.status ?? null, s.error ?? null, s.status ? (s.ms ?? null) : null,
    );
}

export function cronStatStmt(db: D1Database, at: number, dispatched: number): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO cron_stats (hour, ticks, dispatched, last_tick_at) VALUES (?, 1, ?, ?)
       ON CONFLICT (hour) DO UPDATE SET ticks = ticks + 1, dispatched = dispatched + excluded.dispatched,
         last_tick_at = excluded.last_tick_at`,
    )
    .bind(hourKey(at), dispatched, new Date(at).toISOString());
}

export interface HourStatus {
  hour: string;
  ticks: number;
  dispatched: number;
  runs: number;
  ok: number;
  errors: number;
  baselines: number;
  missing: number;
  matched: number;
  pushed: number;
}

export interface TermStatus {
  sniperId: number;
  name: string;
  active: boolean;
  term: string;
  runs: number;
  errors: number;
  matched: number;
  pushed: number;
  avgListings: number | null;
  avgMs: number | null;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  lastMs: number | null;
}

export interface Status {
  now: string;
  lastTickAt: string | null;
  health: { status: "ok" | "warning" | "down"; reasons: string[] };
  hours: HourStatus[];
  terms: TermStatus[];
  recentErrors: { at: string | null; name: string; term: string; error: string | null; count: number }[];
  today: { requests: number; d1Writes: number };
}

export async function getStatus(db: D1Database, now = Date.now()): Promise<Status> {
  const keys = Array.from({ length: 24 }, (_, i) => hourKey(now - (23 - i) * 3_600_000));
  const since = keys[0];
  const [runRes, cronRes, lastTick] = await db.batch<any>([
    db
      .prepare(
        `SELECT r.*, s.name, s.active FROM run_stats r LEFT JOIN snipers s ON s.id = r.sniper_id
         WHERE r.hour >= ? ORDER BY r.hour`,
      )
      .bind(since),
    db.prepare("SELECT * FROM cron_stats WHERE hour >= ?").bind(since),
    db.prepare("SELECT MAX(last_tick_at) AS t FROM cron_stats"),
  ]);
  const rows = runRes.results;
  const cron = new Map<string, any>(cronRes.results.map((c: any) => [c.hour, c]));

  const hours: HourStatus[] = keys.map((hour) => {
    const rs = rows.filter((r: any) => r.hour === hour);
    const sum = (k: string) => rs.reduce((a: number, r: any) => a + (r[k] ?? 0), 0);
    const c = cron.get(hour);
    const runs = sum("runs");
    const dispatched = c?.dispatched ?? 0;
    return {
      hour, ticks: c?.ticks ?? 0, dispatched, runs, ok: sum("ok"), errors: sum("errors"), baselines: sum("baselines"),
      missing: Math.max(0, dispatched - runs), matched: sum("matched"), pushed: sum("pushed"),
    };
  });

  const byTerm = new Map<string, any[]>();
  for (const r of rows) {
    const k = `${r.sniper_id}\u0000${r.term}`;
    if (!byTerm.has(k)) byTerm.set(k, []);
    byTerm.get(k)!.push(r);
  }
  const terms: TermStatus[] = [...byTerm.values()].map((rs) => {
    const sum = (k: string) => rs.reduce((a: number, r: any) => a + (r[k] ?? 0), 0);
    const last = rs.filter((r) => r.last_run_at).sort((a, b) => (a.last_run_at < b.last_run_at ? 1 : -1))[0] ?? rs[0];
    const measured = sum("ok") + sum("baselines");
    const timed = measured + sum("errors");
    return {
      sniperId: rs[0].sniper_id, name: rs[0].name ?? "(verwijderd)", active: !!rs[0].active, term: rs[0].term,
      runs: sum("runs"), errors: sum("errors"), matched: sum("matched"), pushed: sum("pushed"),
      avgListings: measured ? Math.round(sum("listings") / measured) : null,
      avgMs: timed ? Math.round(sum("total_ms") / timed) : null,
      lastRunAt: last.last_run_at, lastStatus: last.last_status, lastError: last.last_error, lastMs: last.last_ms,
    };
  }).sort((a, b) => a.sniperId - b.sniperId || a.term.localeCompare(b.term));

  const recentErrors = rows
    .filter((r: any) => r.errors > 0)
    .sort((a: any, b: any) => ((a.last_run_at ?? "") < (b.last_run_at ?? "") ? 1 : -1))
    .slice(0, 20)
    .map((r: any) => ({ at: r.last_run_at, name: r.name ?? "(verwijderd)", term: r.term, error: r.last_error, count: r.errors }));

  const today = new Date(now).toISOString().slice(0, 10);
  const todayRows = rows.filter((r: any) => r.hour.startsWith(today));
  const todayCron = [...cron.values()].filter((c) => c.hour.startsWith(today));
  const tSum = (k: string) => todayRows.reduce((a: number, r: any) => a + (r[k] ?? 0), 0);
  const ticksToday = todayCron.reduce((a, c) => a + c.ticks, 0);
  const runsToday = tSum("runs");

  const lastTickAt: string | null = lastTick.results[0]?.t ?? null;
  const reasons: string[] = [];
  let status: Status["health"]["status"] = "ok";
  if (!lastTickAt || now - Date.parse(lastTickAt) > 3 * 60_000) {
    status = "down";
    reasons.push(lastTickAt ? "De cron heeft al meer dan 3 minuten niet getikt." : "De cron heeft nog niet getikt.");
  } else {
    const recent = hours.slice(-2);
    const missing = recent.reduce((a, h) => a + h.missing, 0);
    const errors = recent.reduce((a, h) => a + h.errors, 0);
    if (missing > 1) reasons.push(`${missing} runs gestart maar niet afgerond (mogelijk afgebroken).`);
    if (errors > 0) reasons.push(`${errors} fouten bij Marktplaats in het laatste uur.`);
    if (reasons.length) status = "warning";
  }

  return {
    now: new Date(now).toISOString(),
    lastTickAt,
    health: { status, reasons },
    hours,
    terms,
    recentErrors,
    today: {
      requests: ticksToday + runsToday,
      // Rough: one stats upsert per run and tick, plus seen rows and finds.
      d1Writes: ticksToday + runsToday + tSum("new_seen") + tSum("matched") * 2 + tSum("errors"),
    },
  };
}
