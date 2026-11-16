import { describe, expect, it } from "vitest";
import fixture from "./fixtures/search-ps5.json";
import {
  MarktplaatsError,
  buildSearchUrl,
  fetchSearch,
  fetchSearchPages,
  parseCategories,
  parseListings,
} from "../src/marktplaats";

const raw = fixture as any;

function rawListing(over: Record<string, unknown>) {
  return {
    itemId: "m1",
    title: "Test",
    description: "",
    priceInfo: { priceCents: 0, priceType: "FIXED" },
    location: { cityName: "Utrecht", distanceMeters: -1000 },
    imageUrls: [],
    vipUrl: "/v/x/m1-test",
    categoryId: 1,
    priorityProduct: "NONE",
    ...over,
  };
}

describe("parseListings", () => {
  it("keeps only regular m-listings", () => {
    const expected = raw.listings.filter(
      (l: any) => l.priorityProduct === "NONE" && l.itemId.startsWith("m"),
    ).length;
    const result = parseListings(raw);
    expect(result.length).toBe(expected);
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((l) => l.itemId.startsWith("a"))).toBe(false);
  });

  it("makes urls absolute", () => {
    for (const l of parseListings(raw)) {
      expect(l.url.startsWith("https://www.marktplaats.nl/")).toBe(true);
      if (l.imageUrl !== null) expect(l.imageUrl.startsWith("https://")).toBe(true);
    }
  });

  it("derives hasPrice from price type", () => {
    const [fixed, fast, minBid] = parseListings({
      listings: [
        rawListing({ itemId: "m1", priceInfo: { priceCents: 24000, priceType: "FIXED" } }),
        rawListing({ itemId: "m2", priceInfo: { priceCents: 0, priceType: "FAST_BID" } }),
        rawListing({ itemId: "m3", priceInfo: { priceCents: 10000, priceType: "MIN_BID" } }),
      ],
    });
    expect(fixed.hasPrice).toBe(true);
    expect(fixed.sellerId).toBeNull();
    expect(fixed.priceCents).toBe(24000);
    expect(fast.hasPrice).toBe(false);
    expect(minBid.hasPrice).toBe(true);
  });

  it("reads seller id and name", () => {
    const [l] = parseListings({ listings: [rawListing({ sellerInformation: { sellerId: 12194300, sellerName: "Berry" } })] });
    expect(l.sellerId).toBe(12194300);
    expect(l.sellerName).toBe("Berry");
  });

  it("treats unknown distance (-1000) as null", () => {
    const [l] = parseListings({ listings: [rawListing({})] });
    expect(l.distanceMeters).toBeNull();
  });

  it("throws on a response without listings", () => {
    expect(() => parseListings({})).toThrow(MarktplaatsError);
  });
});

describe("buildSearchUrl", () => {
  it("includes query, sorting, location and category", () => {
    const url = buildSearchUrl({ query: "iphone 13", postcode: "3511 aa", distanceKm: 10, l1CategoryId: 356 });
    expect(url).toMatch(/query=iphone(\+|%20)13/);
    expect(url).toContain("limit=100");
    expect(url).toContain("offset=0");
    expect(url).toContain("sortBy=SORT_INDEX");
    expect(url).toContain("sortOrder=DECREASING");
    expect(url).toContain("postcode=3511AA");
    expect(url).toContain("distanceMeters=10000");
    expect(url).toContain("l1CategoryId=356");
  });

  it("omits location when no postcode", () => {
    const url = buildSearchUrl({ query: "ps5", postcode: null, distanceKm: null, l1CategoryId: null });
    expect(url).not.toContain("postcode");
    expect(url).not.toContain("distanceMeters");
    expect(url).not.toContain("l1CategoryId");
  });
});

describe("parseCategories", () => {
  it("reads relevant categories", () => {
    const cats = parseCategories(raw);
    expect(cats).toContainEqual({ id: 356, label: "Spelcomputers en Games", parentId: null });
    expect(cats.find((c) => c.id === 2954)?.parentId).toBe(356);
  });
});

describe("fetchSearch", () => {
  const s = { query: "ps5", postcode: null, distanceKm: null, l1CategoryId: null };

  it("throws on non-200", async () => {
    const f = async () => new Response("nope", { status: 403 });
    await expect(fetchSearch(s, f as any)).rejects.toThrow(MarktplaatsError);
  });

  it("throws on html body", async () => {
    const f = async () => new Response("<html></html>", { status: 200 });
    await expect(fetchSearch(s, f as any)).rejects.toThrow(MarktplaatsError);
  });

  it("returns parsed json", async () => {
    const f = async () => Response.json({ listings: [] });
    await expect(fetchSearch(s, f as any)).resolves.toEqual({ listings: [] });
  });
});

describe("fetchSearchPages", () => {
  const s = { query: "gratis", postcode: null, distanceKm: null, l1CategoryId: null };
  const page = (sponsored: number, regular: number, prefix: string) => ({
    listings: [
      ...Array.from({ length: sponsored }, (_, i) => rawListing({ itemId: `m${prefix}s${i}`, priorityProduct: "DAGTOPPER" })),
      ...Array.from({ length: regular }, (_, i) => rawListing({ itemId: `m${prefix}r${i}` })),
    ],
    facets: [],
  });

  it("fetches a second page when the first is mostly sponsored", async () => {
    const urls: string[] = [];
    const f = async (url: string) => {
      urls.push(url);
      return Response.json(url.includes("offset=100") ? page(4, 96, "p2") : page(95, 5, "p1"));
    };
    const json = await fetchSearchPages(s, f as any);
    expect(urls).toHaveLength(2);
    expect(urls[1]).toContain("offset=100");
    const ids = parseListings(json).map((l) => l.itemId);
    expect(ids).toContain("mp1r0");
    expect(ids).toContain("mp2r0");
  });

  it("uses one request when the first page has enough regular listings", async () => {
    let calls = 0;
    const f = async () => {
      calls++;
      return Response.json(page(68, 32, "p1"));
    };
    await fetchSearchPages(s, f as any);
    expect(calls).toBe(1);
  });

  it("does not fetch a second page when the first is not full", async () => {
    let calls = 0;
    const f = async () => {
      calls++;
      return Response.json(page(3, 2, "p1"));
    };
    await fetchSearchPages(s, f as any);
    expect(calls).toBe(1);
  });
});
