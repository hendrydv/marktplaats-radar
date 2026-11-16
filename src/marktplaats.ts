import type { Category, Listing, Sniper } from "./types";

const API = "https://www.marktplaats.nl/lrp/api/search";
const SITE = "https://www.marktplaats.nl";
const PRICED_TYPES = new Set(["FIXED", "MIN_BID"]);
const PAGE_SIZE = 100;
// Sponsored "dagtoppers" sit on top (68 of 100 for "gratis"). With fewer
// regular listings than this on page 1, page 2 is fetched as well.
const MIN_REGULAR = 10;

export class MarktplaatsError extends Error {
  name = "MarktplaatsError";
}

export type SearchParams = { query: string } & Pick<Sniper, "postcode" | "distanceKm" | "l1CategoryId">;

export function buildSearchUrl(s: SearchParams, offset = 0): string {
  const p = new URLSearchParams({
    query: s.query,
    limit: String(PAGE_SIZE),
    offset: String(offset),
    sortBy: "SORT_INDEX",
    sortOrder: "DECREASING",
    viewOptions: "list-view",
  });
  if (s.postcode) {
    p.set("postcode", s.postcode.replace(/\s+/g, "").toUpperCase());
    if (s.distanceKm) p.set("distanceMeters", String(Math.round(s.distanceKm * 1000)));
  }
  if (s.l1CategoryId) p.set("l1CategoryId", String(s.l1CategoryId));
  return `${API}?${p}`;
}

export async function fetchSearch(s: SearchParams, fetchFn: typeof fetch = fetch, offset = 0): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchFn(buildSearchUrl(s, offset), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        Accept: "application/json",
      },
    });
  } catch (e) {
    throw new MarktplaatsError(`Netwerkfout: ${(e as Error).message}`);
  }
  if (res.status !== 200) throw new MarktplaatsError(`Marktplaats gaf status ${res.status}`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new MarktplaatsError("Marktplaats gaf geen JSON terug");
  }
}

function absolute(url: unknown, prefix: string): string | null {
  if (typeof url !== "string" || url === "") return null;
  if (url.startsWith("http")) return url;
  return prefix + url;
}

export function parseListings(json: unknown): Listing[] {
  const listings = (json as any)?.listings;
  if (!Array.isArray(listings)) throw new MarktplaatsError("Onverwacht antwoord: geen listings");
  return listings
    .filter((l: any) => l?.priorityProduct === "NONE" && typeof l.itemId === "string" && l.itemId.startsWith("m"))
    .map((l: any): Listing => {
      const priceCents = Number(l.priceInfo?.priceCents) || 0;
      const priceType = String(l.priceInfo?.priceType ?? "");
      const distance = Number(l.location?.distanceMeters);
      return {
        itemId: l.itemId,
        title: String(l.title ?? ""),
        description: String(l.description ?? ""),
        priceCents,
        priceType,
        hasPrice: PRICED_TYPES.has(priceType) && priceCents > 0,
        city: String(l.location?.cityName ?? ""),
        distanceMeters: Number.isFinite(distance) && distance >= 0 ? distance : null,
        imageUrl: absolute(l.imageUrls?.[0], "https:"),
        url: absolute(l.vipUrl, SITE) ?? `${SITE}/v/${l.itemId}`,
        categoryId: Number(l.categoryId) || 0,
        sellerId: Number(l.sellerInformation?.sellerId) || null,
        sellerName: l.sellerInformation?.sellerName ? String(l.sellerInformation.sellerName) : null,
      };
    });
}

export function parseCategories(json: unknown): Category[] {
  const facets = (json as any)?.facets;
  if (!Array.isArray(facets)) return [];
  const facet = facets.find((f: any) => f?.key === "RelevantCategories");
  if (!Array.isArray(facet?.categories)) return [];
  return facet.categories.map((c: any) => ({
    id: Number(c.id),
    label: String(c.label),
    parentId: c.parentId == null ? null : Number(c.parentId),
  }));
}

// Page 1, plus page 2 when page 1 is full but nearly all sponsored.
export async function fetchSearchPages(s: SearchParams, fetchFn: typeof fetch = fetch): Promise<unknown> {
  const first = (await fetchSearch(s, fetchFn)) as any;
  const listings = first?.listings;
  if (!Array.isArray(listings) || listings.length < PAGE_SIZE) return first;
  const regular = listings.filter((l: any) => l?.priorityProduct === "NONE").length;
  if (regular >= MIN_REGULAR) return first;
  const second = (await fetchSearch(s, fetchFn, PAGE_SIZE)) as any;
  return { ...first, listings: [...listings, ...(Array.isArray(second?.listings) ? second.listings : [])] };
}
