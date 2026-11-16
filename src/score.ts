import type { Listing } from "./types";

const MIN_SAMPLES = 5;

export function marketPriceCents(listings: Listing[]): number | null {
  const prices = listings
    .filter((l) => l.hasPrice && l.priceCents > 0)
    .map((l) => l.priceCents)
    .sort((a, b) => a - b);
  if (prices.length < MIN_SAMPLES) return null;
  const mid = Math.floor(prices.length / 2);
  return prices.length % 2 === 1 ? prices[mid] : Math.round((prices[mid - 1] + prices[mid]) / 2);
}

export function dealPercent(priceCents: number, marketCents: number | null): number | null {
  if (priceCents <= 0 || marketCents == null || marketCents <= 0) return null;
  const pct = Math.round((1 - priceCents / marketCents) * 100);
  return pct > 0 ? pct : null;
}
