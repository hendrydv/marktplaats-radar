import { describe, expect, it } from "vitest";
import { dealPercent, marketPriceCents } from "../src/score";
import { makeListing } from "./helpers";

const priced = (euros: number[]) => euros.map((e, i) => makeListing({ itemId: `m${i}`, priceCents: e * 100 }));
const bid = () => makeListing({ priceCents: 0, priceType: "FAST_BID", hasPrice: false });

describe("marketPriceCents", () => {
  it("returns the median of priced listings", () => {
    expect(marketPriceCents(priced([100, 500, 300, 200, 400]))).toBe(30000);
  });

  it("averages the middle two for an even count", () => {
    expect(marketPriceCents(priced([100, 200, 300, 400, 500, 600]))).toBe(35000);
  });

  it("returns null with fewer than 5 priced listings", () => {
    expect(marketPriceCents([...priced([100, 200, 300, 400]), bid(), bid(), bid()])).toBeNull();
  });
});

describe("dealPercent", () => {
  it("computes percentage below market", () => {
    expect(dealPercent(14000, 33000)).toBe(58);
  });
  it("returns null above market, at zero price, or without market", () => {
    expect(dealPercent(40000, 33000)).toBeNull();
    expect(dealPercent(0, 33000)).toBeNull();
    expect(dealPercent(14000, null)).toBeNull();
  });
});
