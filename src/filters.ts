import type { Listing, Sniper } from "./types";

export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function matchesSniper(l: Listing, s: Sniper, term: string = s.queries[0] ?? ""): boolean {
  if (s.categoryId != null && s.categoryId !== s.l1CategoryId && l.categoryId !== s.categoryId) {
    return false;
  }

  const title = normalize(l.title);
  if (s.titleOnly) {
    const words = normalize(term).split(" ").filter(Boolean);
    if (!words.every((w) => title.includes(w))) return false;
  }

  if (s.excludeWords.length > 0) {
    const text = `${title} ${normalize(l.description)}`;
    if (s.excludeWords.some((w) => normalize(w) !== "" && text.includes(normalize(w)))) return false;
  }

  if (!l.hasPrice) return s.includeBids;
  if (s.minPriceCents != null && l.priceCents < s.minPriceCents) return false;
  if (s.maxPriceCents != null && l.priceCents > s.maxPriceCents) return false;
  return true;
}
