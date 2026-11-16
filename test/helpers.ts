import type { FindInsert } from "../src/db";
import type { Listing, Sniper } from "../src/types";

export function makeListing(over: Partial<Listing> = {}): Listing {
  return {
    itemId: "m100",
    title: "PlayStation 5 Disc Edition",
    description: "",
    priceCents: 24000,
    priceType: "FIXED",
    hasPrice: true,
    city: "Utrecht",
    distanceMeters: null,
    imageUrl: null,
    url: "https://www.marktplaats.nl/v/m100",
    categoryId: 2954,
    sellerId: null,
    sellerName: null,
    ...over,
  };
}

export function makeSniper(over: Partial<Sniper> = {}): Sniper {
  return {
    id: 1,
    name: "PS5 tot €300",
    queries: ["ps5"],
    minPriceCents: null,
    maxPriceCents: 30000,
    excludeWords: [],
    titleOnly: false,
    postcode: null,
    distanceKm: null,
    l1CategoryId: null,
    categoryId: null,
    includeBids: true,
    active: true,
    baselinePending: [],
    pausedUntil: null,
    configVersion: 0,
    consecutiveErrors: 0,
    lastError: null,
    lastCheckedAt: null,
    ...over,
  };
}

export function makeFind(sniperId: number, itemId: string, over: Partial<FindInsert> = {}): FindInsert {
  return {
    sniperId, itemId, title: itemId, priceCents: 1, hasPrice: true, previousPriceCents: null, dealPercent: null,
    city: "c", imageUrl: null, url: "u", sellerId: null, sellerName: null, query: "ps5", pushed: 1, ...over,
  };
}
