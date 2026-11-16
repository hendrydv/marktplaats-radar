import type { Notification } from "./radar";
import type { Env, Sniper } from "./types";

export function formatEuro(cents: number): string {
  const euros = Math.floor(cents / 100);
  const rest = cents % 100;
  const whole = euros.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return rest === 0 ? `€${whole}` : `€${whole},${rest.toString().padStart(2, "0")}`;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function formatFind(n: Notification): string {
  const l = n.listing;
  const price = l.hasPrice ? formatEuro(l.priceCents) : "Bieden";
  const km = l.distanceMeters != null ? ` (${Math.round(l.distanceMeters / 1000)} km)` : "";
  const lines = [
    `🎯 ${escapeHtml(n.sniper.name)}`,
    `<b>${escapeHtml(l.title)}</b>`,
    `${price} · ${escapeHtml(l.city)}${km}`,
  ];
  if (n.previousPriceCents != null) {
    lines.push(`Prijs verlaagd: ${formatEuro(n.previousPriceCents)} → ${formatEuro(l.priceCents)}`);
  }
  if (n.dealPercent != null && n.marketPriceCents != null) {
    lines.push(`${n.dealPercent}% onder gangbaar (${formatEuro(n.marketPriceCents)})`);
  }
  lines.push(escapeHtml(l.url));
  return lines.join("\n");
}

export function formatSummary(sniper: Sniper, extraCount: number): string {
  return `…en nog ${extraCount} nieuwe vondsten voor 🎯 ${escapeHtml(sniper.name)}. Bekijk ze op de pagina.`;
}

type TelegramEnv = Pick<Env, "TELEGRAM_BOT_TOKEN" | "TELEGRAM_CHAT_ID">;

export interface ReplyMarkup {
  inline_keyboard: { text: string; callback_data: string }[][];
}

/** Buttons under a find; the webhook handles the presses (callback_data max 64 bytes). */
export function findButtons(sniperId: number, itemId: string): ReplyMarkup {
  return {
    inline_keyboard: [
      [
        { text: "🔕 Pauze 1 uur", callback_data: `p:${sniperId}` },
        { text: "👎 Verkoper", callback_data: `b:${sniperId}:${itemId}` },
        { text: "⭐ Bewaren", callback_data: `s:${sniperId}:${itemId}` },
      ],
    ],
  };
}

export async function callTelegram(
  env: Pick<Env, "TELEGRAM_BOT_TOKEN">,
  method: string,
  body: object,
  fetchFn: typeof fetch = fetch,
): Promise<Response> {
  return fetchFn(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function call(env: TelegramEnv, method: string, body: object, fetchFn: typeof fetch): Promise<Response> {
  return callTelegram(env, method, { chat_id: env.TELEGRAM_CHAT_ID, parse_mode: "HTML", ...body }, fetchFn);
}

export async function sendTelegram(
  env: TelegramEnv,
  text: string,
  photoUrl?: string | null,
  fetchFn: typeof fetch = fetch,
  replyMarkup?: ReplyMarkup,
): Promise<void> {
  const extra = replyMarkup ? { reply_markup: replyMarkup } : {};
  if (photoUrl) {
    const res = await call(env, "sendPhoto", { photo: photoUrl, caption: text, ...extra }, fetchFn);
    if (res.ok) return;
    if (res.status !== 400) throw new Error(`Telegram sendPhoto gaf status ${res.status}`);
  }
  const res = await call(env, "sendMessage", { text, ...extra }, fetchFn);
  if (!res.ok) throw new Error(`Telegram sendMessage gaf status ${res.status}: ${await res.text()}`);
}
