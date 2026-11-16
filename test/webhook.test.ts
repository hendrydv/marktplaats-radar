import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createSniper, findByItem, getSettings, getSniper, listBlocked, saveRun, starredFinds } from "../src/db";
import { activateWebhook, handleTelegramWebhook, webhookSecret } from "../src/webhook";
import type { Env } from "../src/types";
import { makeFind } from "./helpers";

const appEnv = env as unknown as Env;
const sniperInput = {
  name: "Kachel", queries: ["rookkanaal"], minPriceCents: null, maxPriceCents: null, excludeWords: [], titleOnly: false,
  postcode: null, distanceKm: null, l1CategoryId: null, categoryId: null, includeBids: true, active: true,
};

function tgFetch() {
  const calls: { url: string; body: any }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(init.body as string) });
    return Response.json({ ok: true });
  }) as unknown as typeof fetch;
  return { f, calls };
}

async function press(data: string, opts: { secret?: string; chatId?: number } = {}) {
  const t = tgFetch();
  const secret = opts.secret ?? (await webhookSecret(appEnv));
  const req = new Request("https://radar.test/telegram/webhook", {
    method: "POST",
    headers: { "X-Telegram-Bot-Api-Secret-Token": secret, "Content-Type": "application/json" },
    body: JSON.stringify({
      update_id: 1,
      callback_query: { id: "cb1", data, from: { id: opts.chatId ?? 123 }, message: { chat: { id: opts.chatId ?? 123 } } },
    }),
  });
  const res = await handleTelegramWebhook(req, appEnv, { fetchFn: t.f, now: Date.UTC(2026, 10, 16, 10, 0) });
  return { res, calls: t.calls };
}

describe("telegram webhook", () => {
  it("rejects a wrong secret", async () => {
    const { res, calls } = await press("p:1", { secret: "fout" });
    expect(res.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it("ignores presses from another chat", async () => {
    const id = await createSniper(appEnv.DB, sniperInput);
    const { res } = await press(`p:${id}`, { chatId: 999 });
    expect(res.status).toBe(200);
    expect((await getSniper(appEnv.DB, id))!.pausedUntil).toBeNull();
  });

  it("pauses a sniper for one hour and answers", async () => {
    const id = await createSniper(appEnv.DB, sniperInput);
    const { res, calls } = await press(`p:${id}`);
    expect(res.status).toBe(200);
    expect((await getSniper(appEnv.DB, id))!.pausedUntil).toBe("2026-11-16T11:00:00.000Z");
    const answer = calls.find((c) => c.url.endsWith("/answerCallbackQuery"))!;
    expect(answer.body).toMatchObject({ callback_query_id: "cb1" });
    expect(answer.body.text).toContain("12:00");
  });

  it("blocks the seller of a find", async () => {
    const id = await createSniper(appEnv.DB, sniperInput);
    await saveRun(appEnv.DB, id, [], [makeFind(id, "m55", { sellerId: 555, sellerName: "Kachelhandel" })], {});
    const { calls } = await press(`b:${id}:m55`);
    expect(await listBlocked(appEnv.DB)).toContainEqual(expect.objectContaining({ sellerId: 555, sellerName: "Kachelhandel" }));
    expect(calls.find((c) => c.url.endsWith("/answerCallbackQuery"))!.body.text).toContain("Kachelhandel");
  });

  it("stars a find", async () => {
    const id = await createSniper(appEnv.DB, sniperInput);
    await saveRun(appEnv.DB, id, [], [makeFind(id, "m77")], {});
    await press(`s:${id}:m77`);
    expect((await findByItem(appEnv.DB, id, "m77"))!.starred).toBe(true);
    expect((await starredFinds(appEnv.DB)).some((f) => f.itemId === "m77")).toBe(true);
  });

  it("answers gracefully for unknown data", async () => {
    const { res, calls } = await press("x:onzin");
    expect(res.status).toBe(200);
    expect(calls.find((c) => c.url.endsWith("/answerCallbackQuery"))).toBeTruthy();
  });
});

describe("activateWebhook", () => {
  it("registers the webhook with secret and remembers it", async () => {
    const t = tgFetch();
    await activateWebhook(appEnv, "https://radar.example", t.f);
    const call = t.calls.find((c) => c.url.endsWith("/setWebhook"))!;
    expect(call.body).toMatchObject({
      url: "https://radar.example/telegram/webhook",
      secret_token: await webhookSecret(appEnv),
      allowed_updates: ["callback_query"],
    });
    expect((await getSettings(appEnv.DB)).webhookActive).toBe(true);
  });
});
