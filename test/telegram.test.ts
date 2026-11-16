import { describe, expect, it } from "vitest";
import { findButtons, formatEuro, formatFind, formatSummary, sendTelegram } from "../src/telegram";
import { makeListing, makeSniper } from "./helpers";

const env = { TELEGRAM_BOT_TOKEN: "tok", TELEGRAM_CHAT_ID: "42" };

describe("formatEuro", () => {
  it("formats whole and fractional euros", () => {
    expect(formatEuro(24000)).toBe("€240");
    expect(formatEuro(24050)).toBe("€240,50");
    expect(formatEuro(125000)).toBe("€1.250");
  });
});

describe("formatFind", () => {
  const base = { sniper: makeSniper(), previousPriceCents: null, dealPercent: null, marketPriceCents: null };

  it("shows a price drop and deal score", () => {
    const text = formatFind({
      ...base, listing: makeListing({ priceCents: 25000 }), previousPriceCents: 40000, dealPercent: 24, marketPriceCents: 33000,
    });
    expect(text).toContain("🎯 PS5 tot €300");
    expect(text).toContain("Prijs verlaagd: €400 → €250");
    expect(text).toContain("24% onder gangbaar (€330)");
    expect(text).toContain("https://www.marktplaats.nl/v/m100");
  });

  it("shows Bieden for listings without price", () => {
    const text = formatFind({ ...base, listing: makeListing({ priceCents: 0, hasPrice: false, priceType: "FAST_BID" }) });
    expect(text).toContain("Bieden · Utrecht");
  });

  it("escapes html in titles", () => {
    expect(formatFind({ ...base, listing: makeListing({ title: "<b>PS5</b> & co" }) })).toContain("&lt;b&gt;PS5&lt;/b&gt; &amp; co");
  });

  it("escapes ampersands in the url", () => {
    const text = formatFind({ ...base, listing: makeListing({ url: "https://www.marktplaats.nl/v/a?x=1&y=2" }) });
    expect(text).toContain("https://www.marktplaats.nl/v/a?x=1&amp;y=2");
  });

  it("shows distance only when known", () => {
    expect(formatFind({ ...base, listing: makeListing() })).not.toContain("km");
    expect(formatFind({ ...base, listing: makeListing({ distanceMeters: 8000 }) })).toContain("Utrecht (8 km)");
  });
});

describe("formatSummary", () => {
  it("mentions the extra count and the sniper", () => {
    expect(formatSummary(makeSniper({ name: "Gratis <spul>" }), 3)).toBe("…en nog 3 nieuwe vondsten voor 🎯 Gratis &lt;spul&gt;. Bekijk ze op de pagina.");
  });
});

describe("sendTelegram", () => {
  it("falls back to sendMessage when the photo is rejected", async () => {
    const calls: string[] = [];
    const f = async (url: string) => {
      calls.push(url);
      return url.endsWith("/sendPhoto") ? new Response("{}", { status: 400 }) : new Response("{}", { status: 200 });
    };
    await sendTelegram(env, "hoi", "https://img/x.jpg", f as any);
    expect(calls).toEqual(["https://api.telegram.org/bottok/sendPhoto", "https://api.telegram.org/bottok/sendMessage"]);
  });

  it("uses sendMessage without a photo and sends chat id + html mode", async () => {
    let body: any;
    const f = async (url: string, init: RequestInit) => {
      body = JSON.parse(init.body as string);
      expect(url).toBe("https://api.telegram.org/bottok/sendMessage");
      return new Response("{}");
    };
    await sendTelegram(env, "hoi", null, f as any);
    expect(body).toMatchObject({ chat_id: "42", text: "hoi", parse_mode: "HTML" });
  });

  it("adds inline buttons when given", async () => {
    let body: any;
    const f = async (_url: string, init: RequestInit) => {
      body = JSON.parse(init.body as string);
      return new Response("{}");
    };
    await sendTelegram(env, "hoi", null, f as any, findButtons(3, "m9"));
    const row = body.reply_markup.inline_keyboard[0];
    expect(row.map((b: any) => b.callback_data)).toEqual(["p:3", "b:3:m9", "s:3:m9"]);
    expect(row.map((b: any) => b.text)).toEqual(["🔕 Pauze 1 uur", "👎 Verkoper", "⭐ Bewaren"]);
  });

  it("throws on server errors", async () => {
    const f = async () => new Response("{}", { status: 500 });
    await expect(sendTelegram(env, "hoi", null, f as any)).rejects.toThrow();
  });
});
