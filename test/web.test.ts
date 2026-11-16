import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/search-ps5.json";
import { makeSessionCookie } from "../src/auth";
import { blockSeller, createSniper, findByItem, getSniper, saveRun } from "../src/db";
import { webhookSecret } from "../src/webhook";
import { makeFind } from "./helpers";
import { handleRequest } from "../src/web/api";
import type { Env } from "../src/types";

const appEnv = env as unknown as Env;
let cookie = "";

async function call(path: string, init: RequestInit = {}, opts: { auth?: boolean; fetchFn?: typeof fetch } = {}) {
  if (!cookie) cookie = await makeSessionCookie(appEnv, Date.now() + 60_000);
  const headers = new Headers(init.headers);
  if (opts.auth !== false) headers.set("Cookie", cookie);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return handleRequest(new Request(`https://radar.test${path}`, { ...init, headers }), appEnv, { fetchFn: opts.fetchFn });
}

const valid = {
  name: "PS5 tot €300", queries: "ps5", minPrice: null, maxPrice: 300, excludeWords: "defect, onderdelen ,",
  titleOnly: true, postcode: "", distanceKm: null, l1CategoryId: 356, categoryId: 2954, includeBids: true, active: true,
};

describe("web api", () => {
  it("requires auth", async () => {
    expect((await call("/api/snipers", {}, { auth: false })).status).toBe(401);
    const page = await call("/", {}, { auth: false });
    expect(page.status).toBe(303);
    expect(page.headers.get("Location")).toBe("/login");
    expect((await call("/login", {}, { auth: false })).status).toBe(200);
  });

  it("creates and lists a sniper with euros converted to cents", async () => {
    const res = await call("/api/snipers", { method: "POST", body: JSON.stringify(valid) });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: number };
    const list = (await (await call("/api/snipers")).json()) as any[];
    const s = list.find((x) => x.id === id);
    expect(s).toMatchObject({ maxPriceCents: 30000, minPriceCents: null, excludeWords: ["defect", "onderdelen"], postcode: null });
  });

  it("rejects min above max", async () => {
    const res = await call("/api/snipers", { method: "POST", body: JSON.stringify({ ...valid, minPrice: 400 }) });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error).toBeTruthy();
  });

  it("rejects an invalid postcode", async () => {
    const res = await call("/api/snipers", { method: "POST", body: JSON.stringify({ ...valid, postcode: "35111" }) });
    expect(res.status).toBe(400);
  });

  it("rejects distance without postcode", async () => {
    const res = await call("/api/snipers", { method: "POST", body: JSON.stringify({ ...valid, distanceKm: 10 }) });
    expect(res.status).toBe(400);
  });

  it("rejects an empty query", async () => {
    const res = await call("/api/snipers", { method: "POST", body: JSON.stringify({ ...valid, queries: " , " }) });
    expect(res.status).toBe(400);
  });

  it("refuses the 21st sniper", async () => {
    await env.DB.prepare("DELETE FROM snipers").run();
    for (let i = 0; i < 20; i++) {
      expect((await call("/api/snipers", { method: "POST", body: JSON.stringify(valid) })).status).toBe(201);
    }
    expect((await call("/api/snipers", { method: "POST", body: JSON.stringify(valid) })).status).toBe(409);
    await env.DB.prepare("DELETE FROM snipers").run();
  });

  it("editing a sniper resets the baseline of all terms", async () => {
    const res = await call("/api/snipers", { method: "POST", body: JSON.stringify(valid) });
    const { id } = (await res.json()) as { id: number };
    await env.DB.prepare("UPDATE snipers SET baseline_pending = '[]' WHERE id = ?").bind(id).run();
    const put = await call(`/api/snipers/${id}`, { method: "PUT", body: JSON.stringify({ ...valid, maxPrice: 350 }) });
    expect(put.status).toBe(200);
    const s = (await getSniper(env.DB, id))!;
    expect(s.baselinePending).toEqual(["ps5"]);
    expect(s.maxPriceCents).toBe(35000);
  });

  it("toggles and deletes a sniper", async () => {
    const id = await createSniper(env.DB, {
      name: "x", queries: ["x"], minPriceCents: null, maxPriceCents: null, excludeWords: [], titleOnly: true, postcode: null,
      distanceKm: null, l1CategoryId: null, categoryId: null, includeBids: true, active: true,
    });
    await call(`/api/snipers/${id}/active`, { method: "POST", body: JSON.stringify({ active: false }) });
    expect((await getSniper(env.DB, id))!.active).toBe(false);
    expect((await call(`/api/snipers/${id}`, { method: "DELETE" })).status).toBe(200);
    expect(await getSniper(env.DB, id)).toBeNull();
  });

  it("returns 404 when editing an unknown sniper", async () => {
    expect((await call(`/api/snipers/999999`, { method: "PUT", body: JSON.stringify(valid) })).status).toBe(404);
  });

  it("returns categories for a query", async () => {
    const fetchFn = (async () => Response.json(fixture)) as unknown as typeof fetch;
    const res = await call("/api/categories?q=ps5", {}, { fetchFn });
    const cats = (await res.json()) as any[];
    expect(cats.some((c) => c.id === 356)).toBe(true);
  });

  it("accepts up to 3 comma-separated terms, trimmed and deduplicated", async () => {
    const res = await call("/api/snipers", { method: "POST", body: JSON.stringify({ ...valid, queries: " rookkanaal, kachelpijp ,rookkanaal" }) });
    const { id } = (await res.json()) as { id: number };
    expect((await getSniper(env.DB, id))!.queries).toEqual(["rookkanaal", "kachelpijp"]);
    const four = await call("/api/snipers", { method: "POST", body: JSON.stringify({ ...valid, queries: "a, b, c, d" }) });
    expect(four.status).toBe(400);
    expect(((await four.json()) as any).error).toContain("3");
  });

  it("refuses more than 40 terms in total", async () => {
    await env.DB.prepare("DELETE FROM snipers").run();
    for (let i = 0; i < 13; i++) {
      expect((await call("/api/snipers", { method: "POST", body: JSON.stringify({ ...valid, queries: "a, b, c" }) })).status).toBe(201);
    }
    const res = await call("/api/snipers", { method: "POST", body: JSON.stringify({ ...valid, queries: "a, b" }) });
    expect(res.status).toBe(409);
    await env.DB.prepare("DELETE FROM snipers").run();
  });

  it("pauses and resumes a sniper", async () => {
    const res = await call("/api/snipers", { method: "POST", body: JSON.stringify(valid) });
    const { id } = (await res.json()) as { id: number };
    await call(`/api/snipers/${id}/pause`, { method: "POST", body: JSON.stringify({ minutes: 60 }) });
    const until = Date.parse((await getSniper(env.DB, id))!.pausedUntil!);
    expect(until - Date.now()).toBeGreaterThan(59 * 60_000);
    await call(`/api/snipers/${id}/pause`, { method: "POST", body: JSON.stringify({ minutes: null }) });
    expect((await getSniper(env.DB, id))!.pausedUntil).toBeNull();
  });

  it("reads and saves quiet hours with validation", async () => {
    const put = await call("/api/settings", { method: "PUT", body: JSON.stringify({ quietEnabled: true, quietStart: "22:00", quietEnd: "06:30" }) });
    expect(put.status).toBe(200);
    expect(await (await call("/api/settings")).json()).toMatchObject({ quietEnabled: true, quietStart: "22:00", quietEnd: "06:30" });
    const bad = await call("/api/settings", { method: "PUT", body: JSON.stringify({ quietEnabled: true, quietStart: "25:00", quietEnd: "06:30" }) });
    expect(bad.status).toBe(400);
  });

  it("stars and unstars finds and lists starred", async () => {
    const id = await createSniper(env.DB, {
      name: "s", queries: ["x"], minPriceCents: null, maxPriceCents: null, excludeWords: [], titleOnly: true, postcode: null,
      distanceKm: null, l1CategoryId: null, categoryId: null, includeBids: true, active: true,
    });
    await saveRun(env.DB, id, [], [makeFind(id, "w1")], {});
    const f = (await findByItem(env.DB, id, "w1"))!;
    await call(`/api/finds/${f.id}/star`, { method: "POST", body: JSON.stringify({ starred: true }) });
    expect(((await (await call("/api/starred")).json()) as any[]).some((x) => x.itemId === "w1")).toBe(true);
    await call(`/api/finds/${f.id}/star`, { method: "POST", body: JSON.stringify({ starred: false }) });
    expect(((await (await call("/api/starred")).json()) as any[]).some((x) => x.itemId === "w1")).toBe(false);
  });

  it("lists and unblocks sellers", async () => {
    await blockSeller(env.DB, 31337, "Opkoper");
    expect(((await (await call("/api/blocked")).json()) as any[]).some((b) => b.sellerId === 31337)).toBe(true);
    await call("/api/blocked/31337", { method: "DELETE" });
    expect(((await (await call("/api/blocked")).json()) as any[]).some((b) => b.sellerId === 31337)).toBe(false);
  });

  it("activates telegram buttons via setWebhook", async () => {
    const urls: string[] = [];
    const fetchFn = (async (url: string) => { urls.push(url); return Response.json({ ok: true }); }) as unknown as typeof fetch;
    const res = await call("/api/telegram/activate", { method: "POST" }, { fetchFn });
    expect(res.status).toBe(200);
    expect(urls.some((u) => u.endsWith("/setWebhook"))).toBe(true);
  });

  it("routes the telegram webhook without login but with secret", async () => {
    const res = await call("/telegram/webhook", { method: "POST", body: JSON.stringify({}) }, { auth: false });
    expect(res.status).toBe(403);
    const ok = await call("/telegram/webhook", {
      method: "POST", body: JSON.stringify({}), headers: { "X-Telegram-Bot-Api-Secret-Token": await webhookSecret(appEnv) },
    }, { auth: false });
    expect(ok.status).toBe(200);
  });

  it("serves status data and the status page", async () => {
    const res = await call("/api/status");
    expect(res.status).toBe(200);
    const st = (await res.json()) as any;
    expect(st.hours).toHaveLength(24);
    expect(["ok", "warning", "down"]).toContain(st.health.status);
    const page = await call("/status");
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Status");
    expect((await call("/status", {}, { auth: false })).status).toBe(303);
  });

  it("serves a favicon without login and links it from every page", async () => {
    const res = await call("/favicon.svg", {}, { auth: false });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("image/svg+xml");
    expect(await res.text()).toContain("<svg");
    expect((await call("/favicon.ico", {}, { auth: false })).status).toBe(200);
    for (const path of ["/", "/status", "/login"]) {
      const html = await (await call(path)).text();
      expect(html).toContain('rel="icon"');
    }
  });

  it("serves the page when authenticated", async () => {
    const res = await call("/");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Categorieën ophalen");
  });

  it("returns at most 10 finds per sniper", async () => {
    const id = await createSniper(env.DB, {
      name: "veel", queries: ["x"], minPriceCents: null, maxPriceCents: null, excludeWords: [], titleOnly: true, postcode: null,
      distanceKm: null, l1CategoryId: null, categoryId: null, includeBids: true, active: true,
    });
    await saveRun(env.DB, id, [], Array.from({ length: 15 }, (_, i) => makeFind(id, `v${i}`)), {});
    const res = await call("/api/finds");
    expect(res.status).toBe(200);
    const finds = (await res.json()) as any[];
    expect(finds.filter((f) => f.sniperId === id)).toHaveLength(10);
  });
});
