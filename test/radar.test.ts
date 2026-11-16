import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/search-ps5.json";
import { createSniper, getSeen, getSniper, recentFinds, updateSniper } from "../src/db";
import { runSniper, type Notification, type RadarDeps, type RunContext } from "../src/radar";
import type { Sniper } from "../src/types";

const db = env.DB;

function rawListing(itemId: string, euros: number, title = "PlayStation 5 Disc Edition", sellerId = 1) {
  return {
    itemId, title, description: "", categoryId: 2954, priorityProduct: "NONE", vipUrl: `/v/x/${itemId}`,
    priceInfo: { priceCents: euros * 100, priceType: "FIXED" }, location: { cityName: "Utrecht", distanceMeters: -1000 },
    imageUrls: [], sellerInformation: { sellerId, sellerName: `Verkoper ${sellerId}` },
  };
}

async function setup(over: Partial<Sniper> = {}) {
  const id = await createSniper(db, {
    name: "PS5", queries: ["ps5"], minPriceCents: null, maxPriceCents: 30000, excludeWords: [], titleOnly: false,
    postcode: null, distanceKm: null, l1CategoryId: null, categoryId: null, includeBids: false, active: true, ...over,
  });
  let response: unknown = { listings: [] };
  const sent: Notification[] = [];
  const summaries: number[] = [];
  let failNotify = 0;
  let failFetch = false;
  const terms: string[] = [];
  let ctx: Partial<RunContext> = {};
  const deps: RadarDeps = {
    db,
    fetchSearch: async (_s, term) => {
      terms.push(term);
      if (failFetch) throw new Error("netwerk weg");
      return response;
    },
    notify: async (n) => {
      if (failNotify > 0) {
        failNotify--;
        throw new Error("telegram down");
      }
      sent.push(n);
    },
    summarize: async (_s, extra) => {
      summaries.push(extra);
    },
  };
  const run = async (term = "ps5") => runSniper((await getSniper(db, id))!, { term, quiet: false, blockedSellers: [], ...ctx }, deps);
  return {
    id, sent, summaries, run, terms,
    context: (c: Partial<RunContext>) => (ctx = c),
    respond: (r: unknown) => (response = r),
    failNotifyOnce: () => (failNotify = 1),
    failFetch: (v: boolean) => (failFetch = v),
  };
}

function countingDb(inner: D1Database) {
  let calls = 0;
  const wrapStmt = (st: any): any =>
    new Proxy(st, {
      get(t, k) {
        if (k === "__inner") return t;
        if (k === "bind") return (...a: unknown[]) => wrapStmt(t.bind(...a));
        if (["first", "all", "run", "raw"].includes(k as string)) return (...a: unknown[]) => { calls++; return t[k](...a); };
        const v = t[k];
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
  const db = new Proxy(inner, {
    get(t, k) {
      if (k === "prepare") return (q: string) => wrapStmt(t.prepare(q));
      if (k === "batch") return (stmts: any[]) => { calls++; return t.batch(stmts.map((x) => x.__inner ?? x)); };
      const v = (t as any)[k];
      return typeof v === "function" ? v.bind(t) : v;
    },
  });
  return { db: db as D1Database, count: () => calls, reset: () => (calls = 0) };
}

describe("runSniper", () => {
  it("a quiet run uses a single D1 round trip and still updates lastCheckedAt", async () => {
    const t = await setup();
    t.respond({ listings: [rawListing("m1", 500), rawListing("m2", 600)] });
    await t.run();
    await db.prepare("UPDATE snipers SET last_checked_at = NULL, consecutive_errors = 3, last_error = 'x' WHERE id = ?").bind(t.id).run();
    const c = countingDb(db);
    const sniper = (await getSniper(db, t.id))!;
    const r = await runSniper(sniper, { term: "ps5", quiet: false, blockedSellers: [] }, { db: c.db, fetchSearch: async () => ({ listings: [rawListing("m1", 500), rawListing("m2", 600)] }), notify: async () => {} });
    expect(r).toEqual({ status: "ok", notified: 0 });
    expect(c.count()).toBe(1);
    const after = (await getSniper(db, t.id))!;
    expect(after.lastCheckedAt).not.toBeNull();
    expect(after.consecutiveErrors).toBe(0);
    expect(after.lastError).toBeNull();
  });

  it("records hourly run stats per term", async () => {
    const t = await setup({});
    t.context({ now: Date.UTC(2099, 10, 16, 10, 5) });
    t.respond({ listings: [rawListing("m1", 500)] });
    await t.run();
    t.respond({ listings: [rawListing("m2", 100), rawListing("m3", 900), rawListing("m1", 500)] });
    await t.run();
    t.failFetch(true);
    await t.run();
    const row = await db.prepare("SELECT * FROM run_stats WHERE sniper_id = ? AND term = 'ps5' AND hour = '2099-11-16T10'").bind(t.id).first<any>();
    expect(row).toMatchObject({ runs: 3, ok: 1, baselines: 1, errors: 1, listings: 4, new_seen: 2, matched: 1, pushed: 1, last_status: "error", last_error: "netwerk weg" });
    expect((await getSniper(db, t.id))!.lastCheckedAt).toBe(row.last_run_at);
  });

  it("first run is a baseline", async () => {
    const t = await setup({ maxPriceCents: null, includeBids: true });
    t.respond(fixture);
    expect(await t.run()).toEqual({ status: "baseline", notified: 0 });
    expect(t.sent).toHaveLength(0);
    expect((await getSniper(db, t.id))!.baselinePending).toEqual([]);
  });

  it("notifies a new matching listing", async () => {
    const t = await setup();
    t.respond({ listings: [rawListing("m1", 500)] });
    await t.run();
    t.respond({ listings: [rawListing("m2", 100), rawListing("m1", 500)] });
    expect(await t.run()).toEqual({ status: "ok", notified: 1 });
    expect(t.sent[0].listing.itemId).toBe("m2");
    expect(t.sent[0].previousPriceCents).toBeNull();
    expect((await recentFinds(db)).filter((f) => f.sniperId === t.id)).toHaveLength(1);
  });

  it("pushes at most 5 per run, summarizes the rest and keeps all as finds", async () => {
    const t = await setup();
    await t.run();
    t.respond({ listings: Array.from({ length: 8 }, (_, i) => rawListing(`m${i}`, 100)) });
    expect(await t.run()).toEqual({ status: "ok", notified: 8 });
    expect(t.sent.map((n) => n.listing.itemId)).toEqual(["m0", "m1", "m2", "m3", "m4"]);
    expect(t.summaries).toEqual([3]);
    expect((await recentFinds(db)).filter((f) => f.sniperId === t.id)).toHaveLength(8);
    await t.run();
    expect(t.sent).toHaveLength(5);
    expect(t.summaries).toEqual([3]);
  });

  it("sends no summary when 5 or fewer match", async () => {
    const t = await setup();
    await t.run();
    t.respond({ listings: Array.from({ length: 5 }, (_, i) => rawListing(`m${i}`, 100)) });
    await t.run();
    expect(t.sent).toHaveLength(5);
    expect(t.summaries).toEqual([]);
  });

  it("does not notify the same listing twice", async () => {
    const t = await setup();
    await t.run();
    t.respond({ listings: [rawListing("m2", 100)] });
    await t.run();
    await t.run();
    expect(t.sent).toHaveLength(1);
  });

  it("notifies a price drop below max once", async () => {
    const t = await setup();
    t.respond({ listings: [rawListing("m1", 400)] });
    await t.run();
    t.respond({ listings: [rawListing("m1", 250)] });
    await t.run();
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0].previousPriceCents).toBe(40000);
    t.respond({ listings: [rawListing("m1", 200)] });
    await t.run();
    expect(t.sent).toHaveLength(1);
  });

  it("records a non-matching new listing without notifying, then catches its price drop", async () => {
    const t = await setup();
    await t.run();
    t.respond({ listings: [rawListing("m3", 900)] });
    await t.run();
    expect(t.sent).toHaveLength(0);
    expect((await getSeen(db, t.id, ["m3"])).get("m3")).toEqual({ lastPriceCents: 90000, notified: false });
    t.respond({ listings: [rawListing("m3", 280)] });
    await t.run();
    expect(t.sent).toHaveLength(1);
  });

  it("does not rewrite unchanged listings", async () => {
    const t = await setup();
    t.respond({ listings: [rawListing("m1", 500)] });
    await t.run();
    await db.prepare("UPDATE seen SET seen_at = '2000-01-01' WHERE sniper_id = ?").bind(t.id).run();
    await t.run();
    const row = await db.prepare("SELECT seen_at FROM seen WHERE sniper_id = ?").bind(t.id).first<{ seen_at: string }>();
    expect(row!.seen_at).toBe("2000-01-01");
  });

  it("includes deal score from the same response", async () => {
    const t = await setup();
    await t.run();
    t.respond({ listings: [rawListing("m9", 100), ...[300, 300, 300, 300, 300].map((e, i) => rawListing(`m${i}`, e))] });
    await t.run();
    const n = t.sent.find((s) => s.listing.itemId === "m9")!;
    expect(n.marketPriceCents).toBe(30000);
    expect(n.dealPercent).toBe(67);
  });

  it("records an error when marktplaats fails", async () => {
    const t = await setup();
    t.failFetch(true);
    const r = await t.run();
    expect(r).toMatchObject({ status: "error", consecutiveErrors: 1 });
    expect(t.sent).toHaveLength(0);
  });

  it("records an error on an unexpected response", async () => {
    const t = await setup();
    t.respond({ foo: 1 });
    expect(await t.run()).toMatchObject({ status: "error", consecutiveErrors: 1 });
  });

  it("retries a failed notification next run", async () => {
    const t = await setup();
    await t.run();
    t.respond({ listings: [rawListing("m5", 100)] });
    t.failNotifyOnce();
    await t.run();
    expect(t.sent).toHaveLength(0);
    await t.run();
    expect(t.sent).toHaveLength(1);
  });

  it("a baseline run does not clear a baseline flag set by an edit during the run", async () => {
    const t = await setup();
    const sniper = (await getSniper(db, t.id))!;
    const deps: RadarDeps = {
      db,
      fetchSearch: async () => {
        await updateSniper(db, t.id, { ...sniper, queries: ["ps5"], maxPriceCents: 1000 });
        return { listings: [rawListing("m1", 100)] };
      },
      notify: async () => {},
    };
    expect(await runSniper(sniper, { term: "ps5", quiet: false, blockedSellers: [] }, deps)).toEqual({ status: "baseline", notified: 0 });
    expect((await getSniper(db, t.id))!.baselinePending).toEqual(["ps5"]);
  });

  it("baselines each term separately and searches with the given term", async () => {
    const t = await setup({ queries: ["rookkanaal", "kachelpijp"] });
    t.respond({ listings: [rawListing("m1", 100)] });
    expect(await t.run("rookkanaal")).toEqual({ status: "baseline", notified: 0 });
    expect((await getSniper(db, t.id))!.baselinePending).toEqual(["kachelpijp"]);
    t.respond({ listings: [rawListing("m2", 100)] });
    expect(await t.run("kachelpijp")).toEqual({ status: "baseline", notified: 0 });
    expect(t.terms).toEqual(["rookkanaal", "kachelpijp"]);
    t.respond({ listings: [rawListing("m3", 100), rawListing("m1", 100)] });
    expect(await t.run("rookkanaal")).toEqual({ status: "ok", notified: 1 });
    expect(t.sent).toHaveLength(1);
  });

  it("notifies a listing found by two terms only once", async () => {
    const t = await setup({ queries: ["rookkanaal", "kachelpijp"] });
    await t.run("rookkanaal");
    await t.run("kachelpijp");
    t.respond({ listings: [rawListing("m7", 100)] });
    await t.run("rookkanaal");
    await t.run("kachelpijp");
    expect(t.sent).toHaveLength(1);
    const f = (await recentFinds(db)).find((x) => x.sniperId === t.id)!;
    expect(f).toMatchObject({ query: "rookkanaal", sellerId: 1, sellerName: "Verkoper 1", pushed: 1 });
  });

  it("title-only matching uses the searched term", async () => {
    const t = await setup({ queries: ["rookkanaal", "kachelpijp"], titleOnly: true });
    await t.run("kachelpijp");
    t.respond({ listings: [rawListing("m1", 100, "Kachelpijp 150mm")] });
    await t.run("kachelpijp");
    expect(t.sent).toHaveLength(1);
  });

  it("while paused: no push, but the find is kept and not pushed later", async () => {
    const t = await setup({});
    await t.run();
    await db.prepare("UPDATE snipers SET paused_until = '2999-01-01T00:00:00.000Z' WHERE id = ?").bind(t.id).run();
    t.respond({ listings: [rawListing("m1", 100)] });
    expect(await t.run()).toEqual({ status: "ok", notified: 1 });
    expect(t.sent).toHaveLength(0);
    expect((await recentFinds(db)).find((f) => f.sniperId === t.id)!.pushed).toBe(2);
    await db.prepare("UPDATE snipers SET paused_until = NULL WHERE id = ?").bind(t.id).run();
    await t.run();
    expect(t.sent).toHaveLength(0);
  });

  it("an expired pause pushes normally", async () => {
    const t = await setup({});
    await t.run();
    await db.prepare("UPDATE snipers SET paused_until = '2000-01-01T00:00:00.000Z' WHERE id = ?").bind(t.id).run();
    t.respond({ listings: [rawListing("m1", 100)] });
    await t.run();
    expect(t.sent).toHaveLength(1);
  });

  it("during quiet hours: no push, no summary, finds held for the morning", async () => {
    const t = await setup({});
    await t.run();
    t.context({ quiet: true });
    t.respond({ listings: Array.from({ length: 8 }, (_, i) => rawListing(`m${i}`, 100)) });
    expect(await t.run()).toEqual({ status: "ok", notified: 8 });
    expect(t.sent).toHaveLength(0);
    expect(t.summaries).toEqual([]);
    const own = (await recentFinds(db)).filter((f) => f.sniperId === t.id);
    expect(own.every((f) => f.pushed === 0)).toBe(true);
  });

  it("skips listings of blocked sellers", async () => {
    const t = await setup({});
    await t.run();
    t.context({ blockedSellers: [66] });
    t.respond({ listings: [rawListing("m1", 100, "PS5", 66), rawListing("m2", 100, "PS5", 1)] });
    await t.run();
    expect(t.sent.map((n) => n.listing.itemId)).toEqual(["m2"]);
    expect((await recentFinds(db)).filter((f) => f.sniperId === t.id).map((f) => f.itemId)).toEqual(["m2"]);
  });
});
