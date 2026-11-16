export interface Listing {
  itemId: string;
  title: string;
  description: string;
  priceCents: number;
  priceType: string;
  hasPrice: boolean;
  city: string;
  distanceMeters: number | null;
  imageUrl: string | null;
  url: string;
  categoryId: number;
  sellerId: number | null;
  sellerName: string | null;
}

export interface Sniper {
  id: number;
  name: string;
  /** 1–3 search terms; each runs as its own invocation. */
  queries: string[];
  minPriceCents: number | null;
  maxPriceCents: number | null;
  excludeWords: string[];
  titleOnly: boolean;
  postcode: string | null;
  distanceKm: number | null;
  l1CategoryId: number | null;
  categoryId: number | null;
  includeBids: boolean;
  active: boolean;
  /** Terms that still need a silent baseline run. */
  baselinePending: string[];
  /** While in the future: keep searching, but no Telegram pushes. */
  pausedUntil: string | null;
  configVersion: number;
  consecutiveErrors: number;
  lastError: string | null;
  lastCheckedAt: string | null;
}

export interface Category {
  id: number;
  label: string;
  parentId: number | null;
}

export interface Env {
  DB: D1Database;
  SELF: Fetcher;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  APP_PASSWORD: string;
  SESSION_SECRET: string;
  INTERNAL_TOKEN: string;
}
