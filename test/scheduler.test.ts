import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createSniper, getSniper, heldFinds, saveRun, saveSettings, setActive } from "../src/db";
import { makeFind } from "./helpers";
import { handleInternalRun, scheduled, sendMorningSummary } from "../src/scheduler";
import type { Env } from "../src/types";

const baseEnv = env as unknown as Env;

const sniperInput = {
  name: "Fiets", queries: ["fiets", "racefiets"], minPriceCents: null, maxPriceCents: 5000, excludeWords: [], titleOnly: false,
  postcode: null, distanceKm: null, l1CategoryId: null, categoryId: null, includeBids: true, active: true,
};

const req = (token?: string) =>
  new Request("https://internal/internal/run/1", {
    method: "POST",
    headers: token ? { "x-internal-token": token } : {},
  });

describe("handleInternalRun", () => {
  it("rejects requests without the internal token", async () => {
    const res = await handleInternalRun(req(), baseEnv, 1);
    expect(res.status).toBe(403);
  });

  it("returns 404 for unknown or inactive snipers", async () => {
    expect((await handleInternalRun(req("test-internal"), baseEnv, 99999)).status).toBe(404);
    const id = await createSniper(baseEnv.DB, sniperInput);
    await setActive(baseEnv.DB, id, false);
    expect((await handleInternalRun(req("test-internal"), baseEnv, id)).status).toBe(404);
  });

  it("sends exactly one warning at 15 consecutive failures", async () => {
    const id = await createSniper(baseEnv.DB, sniperInput);
    const warnings: string[] = [];
    const overrides = {
      fetchSearch: async () => {
        throw new Error("403 van Marktplaats");
      },
      notify: async () => {},
      warn: async (text: string) => {
        warnings.push(text);
      },
    };
    for (let i = 1; i <= 16; i++) {
      const res = await handleInternalRun(req("test-internal"), baseEnv, id, overrides);
      expect(res.status).toBe(200);
      expect(warnings).toHaveLength(i >= 15 ? 1 : 0);
    }
    expect(warnings[0]).toContain('Radar "Fiets" kan Marktplaats al 15 keer achter elkaar niet bereiken');
    expect(warnings[0]).toContain("403 van Marktplaats");
  });

  it("uses the sniper from the request body instead of reading D1", async () => {
    const id = await createSniper(baseEnv.DB, sniperInput);
    const sniper = { ...(await getSniper(baseEnv.DB, id))!, name: "Uit body", consecutiveErrors: 0 };
    const warnings: string[] = [];
    for (let i = 1; i <= 15; i++) {
      const r = new Request(`https://internal/internal/run/${id}`, {
        method: "POST",
        headers: { "x-internal-token": "test-internal", "Content-Type": "application/json" },
        body: JSON.stringify({ sniper, ctx: { term: "fiets", quiet: false, blockedSellers: [] } }),
      });
      await handleInternalRun(r, baseEnv, id, {
        fetchSearch: async () => { throw new Error("weg"); },
        notify: async () => {},
        warn: async (t) => { warnings.push(t); },
      });
    }
    expect(warnings[0]).toContain('Radar "Uit body"');
  });

  it("runs the sniper and returns the result", async () => {
    const id = await createSniper(baseEnv.DB, sniperInput);
    const res = await handleInternalRun(req("test-internal"), baseEnv, id, {
      fetchSearch: async () => ({ listings: [] }),
      notify: async () => {},
    });
    expect(await res.json()).toEqual({ status: "baseline", notified: 0 });
  });
});

function fakeSelf() {
  const calls: { url: string; body: any; token: string | null }[] = [];
  let consumed = 0;
  const env = {
    ...baseEnv,
    SELF: {
      fetch: async (url: string, init: RequestInit) => {
        calls.push({ url, body: JSON.parse(init.body as string), token: new Headers(init.headers).get("x-internal-token") });
        const body = new ReadableStream({ pull: (c) => { consumed++; c.enqueue(new TextEncoder().encode("{}")); c.close(); } });
        return new Response(body);
      },
    },
  } as unknown as Env;
  return { env, calls, consumed: () => consumed };
}

describe("scheduled", () => {
  it("fans out one self-request per term of each active sniper, with context", async () => {
    const a = await createSniper(baseEnv.DB, sniperInput);
    const b = await createSniper(baseEnv.DB, sniperInput);
    await setActive(baseEnv.DB, b, false);
    await saveSettings(baseEnv.DB, { quietEnabled: true, quietStart: "23:00", quietEnd: "07:00" });
    const f = fakeSelf();
    const waits: Promise<unknown>[] = [];
    // 12:00 UTC = 13:00 Amsterdam: not quiet
    await scheduled({ scheduledTime: Date.UTC(2026, 10, 15, 12, 0) }, f.env, { waitUntil: (p) => waits.push(p) });
    await Promise.all(waits);
    const ofA = f.calls.filter((c) => c.url === `https://internal/internal/run/${a}`);
    expect(ofA.map((c) => c.body.ctx.term)).toEqual(["fiets", "racefiets"]);
    expect(ofA[0].body.sniper).toMatchObject({ id: a, name: "Fiets" });
    expect(ofA[0].body.ctx.quiet).toBe(false);
    expect(f.calls.some((c) => c.url.endsWith(`/run/${b}`))).toBe(false);
    expect(f.calls.every((c) => c.token === "test-internal")).toBe(true);
    expect(f.consumed()).toBe(f.calls.length);
    const tick = await baseEnv.DB.prepare("SELECT * FROM cron_stats WHERE hour = '2026-11-15T12'").first<any>();
    expect(tick.ticks).toBeGreaterThanOrEqual(1);
    expect(tick.dispatched).toBeGreaterThanOrEqual(f.calls.length);
  });

  it("marks runs as quiet at night", async () => {
    await createSniper(baseEnv.DB, sniperInput);
    await saveSettings(baseEnv.DB, { quietEnabled: true, quietStart: "23:00", quietEnd: "07:00" });
    const f = fakeSelf();
    const waits: Promise<unknown>[] = [];
    // 02:00 UTC = 03:00 Amsterdam
    await scheduled({ scheduledTime: Date.UTC(2026, 10, 16, 2, 0) }, f.env, { waitUntil: (p) => waits.push(p) });
    await Promise.all(waits);
    expect(f.calls.length).toBeGreaterThan(0);
    expect(f.calls.every((c) => c.body.ctx.quiet === true)).toBe(true);
  });

  it("passes blocked sellers along", async () => {
    await createSniper(baseEnv.DB, sniperInput);
    await baseEnv.DB.prepare("INSERT OR IGNORE INTO blocked_sellers (seller_id, seller_name) VALUES (99, 'x')").run();
    const f = fakeSelf();
    const waits: Promise<unknown>[] = [];
    await scheduled({ scheduledTime: Date.UTC(2026, 10, 15, 12, 0) }, f.env, { waitUntil: (p) => waits.push(p) });
    await Promise.all(waits);
    expect(f.calls[0].body.ctx.blockedSellers).toContain(99);
  });
});

describe("sendMorningSummary", () => {
  it("summarizes held finds once, with counts per sniper and top finds", async () => {
    await baseEnv.DB.prepare("DELETE FROM finds").run();
    const id = await createSniper(baseEnv.DB, { ...sniperInput, name: "Pelletkachel" });
    await saveRun(baseEnv.DB, id, [], [
      makeFind(id, "n1", { pushed: 0, title: "Kachel A", priceCents: 45000, dealPercent: 40, url: "https://mp/a" }),
      makeFind(id, "n2", { pushed: 0, title: "Kachel B", priceCents: 80000 }),
      makeFind(id, "n3", { pushed: 1, title: "Al gepusht" }),
    ], {});
    const sent: string[] = [];
    await sendMorningSummary(baseEnv, async (t) => { sent.push(t); });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("🌅 Vannacht gevonden: 2");
    expect(sent[0]).toContain("Pelletkachel: 2");
    expect(sent[0]).toContain("Kachel A");
    expect(sent[0]).not.toContain("Al gepusht");
    expect(await heldFinds(baseEnv.DB)).toHaveLength(0);
    await sendMorningSummary(baseEnv, async (t) => { sent.push(t); });
    expect(sent).toHaveLength(1);
  });

  it("is sent by the cron at the end of quiet hours", async () => {
    await baseEnv.DB.prepare("DELETE FROM finds").run();
    const id = await createSniper(baseEnv.DB, sniperInput);
    await saveRun(baseEnv.DB, id, [], [makeFind(id, "q1", { pushed: 0 })], {});
    await saveSettings(baseEnv.DB, { quietEnabled: true, quietStart: "23:00", quietEnd: "07:00" });
    const f = fakeSelf();
    const waits: Promise<unknown>[] = [];
    const sent: string[] = [];
    // 06:00 UTC = 07:00 Amsterdam (winter)
    await scheduled({ scheduledTime: Date.UTC(2026, 10, 16, 6, 0) }, f.env, { waitUntil: (p) => waits.push(p) }, {
      sendText: async (t) => { sent.push(t); },
    });
    await Promise.all(waits);
    expect(sent.some((t) => t.includes("Vannacht gevonden: 1"))).toBe(true);
  });
});
