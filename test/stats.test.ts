import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createSniper } from "../src/db";
import { cronStatStmt, getStatus, hourKey, runStatStmt } from "../src/stats";

const db = env.DB;
const T = Date.UTC(2026, 10, 16, 10, 30); // 10:30 UTC
const input = {
  name: "Rookkanaal", queries: ["rookkanaal", "kachelpijp"], minPriceCents: null, maxPriceCents: null, excludeWords: [],
  titleOnly: false, postcode: null, distanceKm: null, l1CategoryId: null, categoryId: null, includeBids: true, active: true,
};

describe("stats", () => {
  it("hourKey is the UTC hour", () => {
    expect(hourKey(T)).toBe("2026-11-16T10");
  });

  it("accumulates run counters per term per hour", async () => {
    await db.batch([db.prepare("DELETE FROM run_stats"), db.prepare("DELETE FROM cron_stats")]);
    const id = await createSniper(db, input);
    await runStatStmt(db, { sniperId: id, term: "rookkanaal", at: T, runs: 1, ok: 1, listings: 40, ms: 300, status: "ok" }).run();
    await runStatStmt(db, { sniperId: id, term: "rookkanaal", at: T + 60_000, runs: 1, ok: 1, listings: 42, ms: 500, status: "ok" }).run();
    await runStatStmt(db, { sniperId: id, term: "rookkanaal", at: T + 60_000, newSeen: 2, matched: 1, pushed: 1 }).run();
    await runStatStmt(db, { sniperId: id, term: "kachelpijp", at: T + 60_000, runs: 1, errors: 1, ms: 9000, status: "error", error: "status 403" }).run();
    await cronStatStmt(db, T, 2).run();
    await cronStatStmt(db, T + 60_000, 2).run();
    await cronStatStmt(db, T + 120_000, 2).run(); // dispatched but never completed → missing

    const s = await getStatus(db, T + 150_000);
    expect(s.lastTickAt).toBe(new Date(T + 120_000).toISOString());
    const hour = s.hours.find((h) => h.hour === "2026-11-16T10")!;
    expect(hour).toMatchObject({ ticks: 3, dispatched: 6, runs: 3, ok: 2, errors: 1, missing: 3, matched: 1, pushed: 1 });
    expect(s.hours).toHaveLength(24);

    const rook = s.terms.find((t) => t.term === "rookkanaal")!;
    expect(rook).toMatchObject({ name: "Rookkanaal", runs: 2, errors: 0, matched: 1, lastStatus: "ok", lastMs: 500, avgListings: 41 });
    const pijp = s.terms.find((t) => t.term === "kachelpijp")!;
    expect(pijp).toMatchObject({ errors: 1, lastStatus: "error", lastError: "status 403" });

    expect(s.recentErrors[0]).toMatchObject({ name: "Rookkanaal", term: "kachelpijp", error: "status 403", count: 1 });
    expect(s.today.requests).toBe(3 + 3);
    expect(s.health.status).toBe("warning");
  });

  it("is healthy with recent ticks, all runs completed and no errors", async () => {
    await db.batch([db.prepare("DELETE FROM run_stats"), db.prepare("DELETE FROM cron_stats")]);
    const id = await createSniper(db, input);
    await cronStatStmt(db, T, 1).run();
    await runStatStmt(db, { sniperId: id, term: "rookkanaal", at: T, runs: 1, ok: 1, listings: 10, ms: 200, status: "ok" }).run();
    expect((await getStatus(db, T + 30_000)).health.status).toBe("ok");
    expect((await getStatus(db, T + 10 * 60_000)).health.status).toBe("down");
  });
});
