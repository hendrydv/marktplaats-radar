import { describe, expect, it } from "vitest";
import { matchesSniper, normalize } from "../src/filters";
import { makeListing, makeSniper } from "./helpers";

describe("normalize", () => {
  it("lowercases, strips accents and collapses whitespace", () => {
    expect(normalize("  Défect   SCHERM ")).toBe("defect scherm");
  });
});

describe("matchesSniper", () => {
  it("checks max price", () => {
    const l = makeListing({ priceCents: 24000 });
    expect(matchesSniper(l, makeSniper({ maxPriceCents: 30000 }))).toBe(true);
    expect(matchesSniper(l, makeSniper({ maxPriceCents: 20000 }))).toBe(false);
  });

  it("checks min price", () => {
    const l = makeListing({ priceCents: 500 });
    expect(matchesSniper(l, makeSniper({ minPriceCents: 5000 }))).toBe(false);
  });

  it("excludes words case- and accent-insensitive in title and description", () => {
    const s = makeSniper({ excludeWords: ["defect"] });
    expect(matchesSniper(makeListing({ title: "PS5 Défect" }), s)).toBe(false);
    expect(matchesSniper(makeListing({ description: "scherm DEFECT" }), s)).toBe(false);
    expect(matchesSniper(makeListing(), s)).toBe(true);
  });

  it("title-only requires every word of the searched term in the title", () => {
    const s = makeSniper({ queries: ["iphone 13", "ipad"], titleOnly: true });
    expect(matchesSniper(makeListing({ title: "Apple iPhone 13 128GB" }), s, "iphone 13")).toBe(true);
    expect(matchesSniper(makeListing({ title: "iPhone 12 hoesje" }), s, "iphone 13")).toBe(false);
    expect(matchesSniper(makeListing({ title: "iPad Air" }), s, "ipad")).toBe(true);
    expect(matchesSniper(makeListing({ title: "iPhone 12 hoesje" }), makeSniper({ queries: ["iphone 13"] }), "iphone 13")).toBe(true);
  });

  it("listings without price match only when bids are included", () => {
    const l = makeListing({ priceCents: 0, priceType: "FAST_BID", hasPrice: false });
    expect(matchesSniper(l, makeSniper({ includeBids: true }))).toBe(true);
    expect(matchesSniper(l, makeSniper({ includeBids: false }))).toBe(false);
  });

  it("filters on sub-category locally", () => {
    const s = makeSniper({ l1CategoryId: 356, categoryId: 2954 });
    expect(matchesSniper(makeListing({ categoryId: 2952 }), s)).toBe(false);
    expect(matchesSniper(makeListing({ categoryId: 2954 }), s)).toBe(true);
    const main = makeSniper({ l1CategoryId: 356, categoryId: 356 });
    expect(matchesSniper(makeListing({ categoryId: 2952 }), main)).toBe(true);
  });
});
