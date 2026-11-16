import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  blockSeller,
  countSnipers,
  countTerms,
  createSniper,
  deleteSniper,
  findByItem,
  getSeen,
  getSettings,
  getSniper,
  heldFinds,
  listBlocked,
  markFindsPushed,
  pruneSeen,
  recentFinds,
  recentFindsPerSniper,
  recordError,
  saveRun,
  saveSettings,
  setActive,
  setPausedUntil,
  setStarred,
  starredFinds,
  unblockSeller,
  updateSniper,
  type SniperInput,
} from "../src/db";

import { makeFind } from "./helpers";

const db = env.DB;

export const input: SniperInput = {
  name: "PS5",
  queries: ["ps5", "playstation 5"],
  minPriceCents: null,
  maxPriceCents: 30000,
  excludeWords: ["defect", "onderdelen"],
  titleOnly: true,
  postcode: "3511AA",
  distanceKm: 20,
  l1CategoryId: 356,
  categoryId: 2954,
  includeBids: false,
  active: true,
};

describe("db", () => {
  it("round-trips a sniper with all terms pending a baseline", async () => {
    const id = await createSniper(db, input);
    const s = await getSniper(db, id);
    expect(s).toMatchObject({ ...input, id, baselinePending: ["ps5", "playstation 5"], pausedUntil: null, consecutiveErrors: 0 });
    expect(await countSnipers(db)).toBeGreaterThanOrEqual(1);
  });

  it("a baseline run removes only its own term from pending", async () => {
    const id = await createSniper(db, input);
    await saveRun(db, id, [], [], { baselineTerm: "ps5", configVersion: 0 });
    expect((await getSniper(db, id))!.baselinePending).toEqual(["playstation 5"]);
  });

  it("a baseline run does not touch pending after a newer edit", async () => {
    const id = await createSniper(db, input);
    await updateSniper(db, id, { ...input, queries: ["switch"] });
    await saveRun(db, id, [], [], { baselineTerm: "switch", configVersion: 0 });
    expect((await getSniper(db, id))!.baselinePending).toEqual(["switch"]);
  });

  it("updateSniper resets pending to all terms and clears seen", async () => {
    const id = await createSniper(db, input);
    await saveRun(db, id, [{ itemId: "m1", lastPriceCents: 1, notified: false }], [], { baselineTerm: "ps5", configVersion: 0 });
    await saveRun(db, id, [], [], { baselineTerm: "playstation 5", configVersion: 0 });
    await updateSniper(db, id, { ...input, maxPriceCents: 35000 });
    const s = (await getSniper(db, id))!;
    expect(s.baselinePending).toEqual(["ps5", "playstation 5"]);
    expect(s.maxPriceCents).toBe(35000);
    expect((await getSeen(db, id, ["m1"])).size).toBe(0);
  });

  it("re-activating resets pending", async () => {
    const id = await createSniper(db, input);
    await saveRun(db, id, [], [], { baselineTerm: "ps5", configVersion: 0 });
    await setActive(db, id, false);
    await setActive(db, id, true);
    expect((await getSniper(db, id))!.baselinePending).toEqual(["ps5", "playstation 5"]);
  });

  it("countTerms sums terms of all snipers, optionally excluding one", async () => {
    const before = await countTerms(db);
    const id = await createSniper(db, input);
    expect(await countTerms(db)).toBe(before + 2);
    expect(await countTerms(db, id)).toBe(before);
  });

  it("getSeen handles more than 100 ids", async () => {
    const id = await createSniper(db, input);
    const ids = Array.from({ length: 150 }, (_, i) => `m${i}`);
    await saveRun(db, id, ids.map((itemId) => ({ itemId, lastPriceCents: 1, notified: false })), [], {});
    expect((await getSeen(db, id, ids)).size).toBe(150);
  });

  it("upsert keeps notified true and updates price", async () => {
    const id = await createSniper(db, input);
    await saveRun(db, id, [{ itemId: "m1", lastPriceCents: 100, notified: true }], [], {});
    await saveRun(db, id, [{ itemId: "m1", lastPriceCents: 90, notified: false }], [], {});
    expect((await getSeen(db, id, ["m1"])).get("m1")).toEqual({ lastPriceCents: 90, notified: true });
  });

  it("recordError counts and saveRun resets", async () => {
    const id = await createSniper(db, input);
    expect(await recordError(db, id, "boom")).toBe(1);
    expect(await recordError(db, id, "boom")).toBe(2);
    await saveRun(db, id, [], [], {});
    const s = (await getSniper(db, id))!;
    expect(s.consecutiveErrors).toBe(0);
    expect(s.lastError).toBeNull();
    expect(s.lastCheckedAt).not.toBeNull();
  });

  it("stores finds with seller and term, newest first", async () => {
    const id = await createSniper(db, input);
    await saveRun(db, id, [], [makeFind(id, "x1", { sellerId: 7, sellerName: "Piet" }), makeFind(id, "x2")], {});
    const finds = await recentFinds(db);
    expect(finds[0]).toMatchObject({ itemId: "x2", sniperName: "PS5", starred: false });
    expect(finds[1]).toMatchObject({ itemId: "x1", sellerId: 7, sellerName: "Piet", query: "ps5" });
  });

  it("stars finds and lists them", async () => {
    const id = await createSniper(db, input);
    await saveRun(db, id, [], [makeFind(id, "st1")], {});
    const f = (await findByItem(db, id, "st1"))!;
    await setStarred(db, f.id, true);
    expect((await starredFinds(db)).map((x) => x.itemId)).toContain("st1");
    await setStarred(db, f.id, false);
    expect((await starredFinds(db)).map((x) => x.itemId)).not.toContain("st1");
  });

  it("pruneSeen keeps old seen rows and starred finds, trims other finds to 500", async () => {
    const id = await createSniper(db, input);
    await saveRun(db, id, [{ itemId: "old", lastPriceCents: 1, notified: false }], [makeFind(id, "keep")], {});
    await setStarred(db, (await findByItem(db, id, "keep"))!.id, true);
    await saveRun(db, id, [], Array.from({ length: 510 }, (_, i) => makeFind(id, `p${i}`)), {});
    await pruneSeen(db);
    expect((await getSeen(db, id, ["old"])).has("old")).toBe(true);
    expect(await findByItem(db, id, "keep")).not.toBeNull();
    const n = await db.prepare("SELECT COUNT(*) AS n FROM finds WHERE starred = 0").first<{ n: number }>();
    expect(n!.n).toBeLessThanOrEqual(500);
  });

  it("recentFindsPerSniper keeps the newest N per sniper", async () => {
    await db.prepare("DELETE FROM finds").run();
    const a = await createSniper(db, input);
    const b = await createSniper(db, input);
    await saveRun(db, a, [], Array.from({ length: 30 }, (_, i) => makeFind(a, `a${i}`)), {});
    await saveRun(db, b, [], [makeFind(b, "b0"), makeFind(b, "b1")], {});
    const finds = await recentFindsPerSniper(db, 10);
    const ofA = finds.filter((f) => f.sniperId === a);
    expect(ofA).toHaveLength(10);
    expect(ofA[0].itemId).toBe("a29");
    expect(finds.filter((f) => f.sniperId === b).map((f) => f.itemId)).toEqual(["b1", "b0"]);
  });

  it("held finds are listed and can be marked", async () => {
    await db.prepare("DELETE FROM finds").run();
    const id = await createSniper(db, input);
    await saveRun(db, id, [], [makeFind(id, "h1", { pushed: 0 }), makeFind(id, "h2", { pushed: 1 })], {});
    const held = await heldFinds(db);
    expect(held.map((f) => f.itemId)).toEqual(["h1"]);
    await markFindsPushed(db, held.map((f) => f.id), 3);
    expect(await heldFinds(db)).toHaveLength(0);
  });

  it("pauses and resumes a sniper", async () => {
    const id = await createSniper(db, input);
    await setPausedUntil(db, id, "2030-01-01T00:00:00.000Z");
    expect((await getSniper(db, id))!.pausedUntil).toBe("2030-01-01T00:00:00.000Z");
    await setPausedUntil(db, id, null);
    expect((await getSniper(db, id))!.pausedUntil).toBeNull();
  });

  it("blocks and unblocks sellers", async () => {
    await blockSeller(db, 42, "Handelaar BV");
    await blockSeller(db, 42, "Handelaar BV");
    expect(await listBlocked(db)).toContainEqual(expect.objectContaining({ sellerId: 42, sellerName: "Handelaar BV" }));
    await unblockSeller(db, 42);
    expect((await listBlocked(db)).some((b) => b.sellerId === 42)).toBe(false);
  });

  it("has default settings and saves them", async () => {
    expect(await getSettings(db)).toEqual({ quietEnabled: true, quietStart: "23:00", quietEnd: "07:00", webhookActive: false });
    await saveSettings(db, { quietEnabled: false, quietStart: "22:30", quietEnd: "06:45" });
    expect(await getSettings(db)).toMatchObject({ quietEnabled: false, quietStart: "22:30", quietEnd: "06:45" });
    await saveSettings(db, { webhookActive: true });
    expect((await getSettings(db)).webhookActive).toBe(true);
  });

  it("deleteSniper removes seen rows and finds", async () => {
    const id = await createSniper(db, input);
    await saveRun(db, id, [{ itemId: "m1", lastPriceCents: 1, notified: false }], [makeFind(id, "d1")], {});
    await deleteSniper(db, id);
    expect(await getSniper(db, id)).toBeNull();
    const row = await db.prepare("SELECT COUNT(*) AS n FROM seen WHERE sniper_id = ?").bind(id).first<{ n: number }>();
    expect(row!.n).toBe(0);
  });
});
