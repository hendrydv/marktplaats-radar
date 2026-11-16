import { loadSeenAndTouch, recordError, resetErrorsStmt, saveRun, type FindInsert, type PushState, type SeenUpsert } from "./db";
import { runStatStmt } from "./stats";
import { matchesSniper } from "./filters";
import { parseListings } from "./marktplaats";
import { dealPercent, marketPriceCents } from "./score";
import type { Listing, Sniper } from "./types";

export interface Notification {
  sniper: Sniper;
  listing: Listing;
  previousPriceCents: number | null;
  dealPercent: number | null;
  marketPriceCents: number | null;
}

export interface RadarDeps {
  db: D1Database;
  fetchSearch: (s: Sniper, term: string) => Promise<unknown>;
  notify: (n: Notification) => Promise<void>;
  /** Called once when more matches arrive in one run than MAX_PUSH. */
  summarize?: (sniper: Sniper, extraCount: number) => Promise<void>;
}

/** Per-run context, computed once by the cron and passed to every term run. */
export interface RunContext {
  term: string;
  /** Inside quiet hours: hold pushes for the morning summary. */
  quiet: boolean;
  blockedSellers: number[];
  /** Override "now" (ms) in tests. */
  now?: number;
}

export type RunResult =
  | { status: "baseline" | "ok"; notified: number }
  | { status: "error"; consecutiveErrors: number; message: string };

// Telegram pushes per sniper per run; the rest only appear on the page.
export const MAX_PUSH = 5;

export async function runSniper(sniper: Sniper, ctx: RunContext, deps: RadarDeps): Promise<RunResult> {
  const { db } = deps;
  const { term } = ctx;
  const now = ctx.now ?? Date.now();
  const stat = { sniperId: sniper.id, term, at: now };
  let listings: Listing[];
  const started = Date.now();
  try {
    listings = parseListings(await deps.fetchSearch(sniper, term));
  } catch (e) {
    const message = (e as Error).message || String(e);
    const ms = Date.now() - started;
    const consecutiveErrors = await recordError(db, sniper.id, message, [
      runStatStmt(db, { ...stat, runs: 1, errors: 1, ms, status: "error", error: message.slice(0, 300) }),
    ]);
    return { status: "error", consecutiveErrors, message };
  }
  const ms = Date.now() - started;

  // The same item can appear twice in one response; keep the first.
  const unique = [...new Map(listings.map((l) => [l.itemId, l])).values()];
  const market = marketPriceCents(unique);

  if (sniper.baselinePending.includes(term)) {
    const upserts = unique.map((l) => ({ itemId: l.itemId, lastPriceCents: l.priceCents, notified: false }));
    // Only clears the term if the sniper was not edited while this run was in flight.
    await saveRun(db, sniper.id, upserts, [], {
      baselineTerm: term,
      configVersion: sniper.configVersion,
      extra: [runStatStmt(db, { ...stat, runs: 1, baselines: 1, listings: unique.length, ms, status: "baseline" })],
    });
    return { status: "baseline", notified: 0 };
  }

  const paused = sniper.pausedUntil != null && Date.parse(sniper.pausedUntil) > now;
  const blocked = new Set(ctx.blockedSellers);
  const seen = await loadSeenAndTouch(db, sniper.id, unique.map((l) => l.itemId), [
    runStatStmt(db, { ...stat, runs: 1, ok: 1, listings: unique.length, ms, status: "ok" }),
    ...(sniper.consecutiveErrors > 0 ? [resetErrorsStmt(db, sniper.id)] : []),
  ]);
  const upserts: SeenUpsert[] = [];
  const finds: FindInsert[] = [];
  let pushes = 0;
  let extra = 0;

  for (const l of unique) {
    const prev = seen.get(l.itemId);
    const isNew = !prev;
    const priceDropped = !!prev && !prev.notified && l.hasPrice && l.priceCents < prev.lastPriceCents;
    const isBlocked = l.sellerId != null && blocked.has(l.sellerId);

    if ((isNew || priceDropped) && !isBlocked && matchesSniper(l, sniper, term)) {
      const previousPriceCents = priceDropped ? prev!.lastPriceCents : null;
      const pct = l.hasPrice ? dealPercent(l.priceCents, market) : null;
      let pushed: PushState;
      if (paused) pushed = 2;
      else if (ctx.quiet) pushed = 0;
      else if (pushes < MAX_PUSH) {
        pushes++;
        try {
          await deps.notify({ sniper, listing: l, previousPriceCents, dealPercent: pct, marketPriceCents: market });
        } catch {
          // Leave state untouched so the next run detects it again and retries.
          continue;
        }
        pushed = 1;
      } else {
        extra++;
        pushed = 2;
      }
      upserts.push({ itemId: l.itemId, lastPriceCents: l.priceCents, notified: true });
      finds.push({
        sniperId: sniper.id, itemId: l.itemId, title: l.title, priceCents: l.priceCents, hasPrice: l.hasPrice,
        previousPriceCents, dealPercent: pct, city: l.city, imageUrl: l.imageUrl, url: l.url,
        sellerId: l.sellerId, sellerName: l.sellerName, query: term, pushed,
      });
      continue;
    }

    // Only write what changed, to stay within D1's free write quota.
    if (isNew || prev!.lastPriceCents !== l.priceCents) {
      upserts.push({ itemId: l.itemId, lastPriceCents: l.priceCents, notified: false });
    }
  }

  if (extra > 0 && deps.summarize) {
    try {
      await deps.summarize(sniper, extra);
    } catch {
      // The finds are on the page anyway.
    }
  }

  // Quiet minute: nothing to write, loadSeenAndTouch already recorded the run.
  if (upserts.length > 0 || finds.length > 0) {
    const newSeen = upserts.filter((u) => !seen.has(u.itemId)).length;
    const count = (p: PushState) => finds.filter((f) => f.pushed === p).length;
    await saveRun(db, sniper.id, upserts, finds, {
      extra: [
        runStatStmt(db, {
          ...stat, newSeen, matched: finds.length, pushed: count(1), held: count(0), silent: count(2),
        }),
      ],
    });
  }
  return { status: "ok", notified: finds.length };
}
