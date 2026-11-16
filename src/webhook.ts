import { hmac, timingSafeEqual } from "./auth";
import { blockSeller, findByItem, saveSettings, setPausedUntil, setStarred } from "./db";
import { localTime } from "./quiet";
import { callTelegram } from "./telegram";
import type { Env } from "./types";

const PAUSE_MS = 60 * 60 * 1000;

/** Secret Telegram sends back on every webhook call; derived, so no extra secret to manage. */
export async function webhookSecret(env: Pick<Env, "SESSION_SECRET">): Promise<string> {
  return hmac(env.SESSION_SECRET, "telegram-webhook");
}

export async function activateWebhook(env: Env, origin: string, fetchFn: typeof fetch = fetch): Promise<void> {
  const res = await callTelegram(
    env,
    "setWebhook",
    { url: `${origin}/telegram/webhook`, secret_token: await webhookSecret(env), allowed_updates: ["callback_query"] },
    fetchFn,
  );
  if (!res.ok) throw new Error(`Telegram setWebhook gaf status ${res.status}: ${await res.text()}`);
  await saveSettings(env.DB, { webhookActive: true });
}

async function handleAction(env: Env, data: string, now: number): Promise<string> {
  const [kind, a, item] = data.split(":");
  const sniperId = Number(a);
  if (kind === "p" && sniperId) {
    await setPausedUntil(env.DB, sniperId, new Date(now + PAUSE_MS).toISOString());
    return `🔕 Gepauzeerd tot ${localTime(now + PAUSE_MS)}. Vondsten blijven op de pagina staan.`;
  }
  if ((kind === "b" || kind === "s") && sniperId && item) {
    const find = await findByItem(env.DB, sniperId, item);
    if (!find) return "Deze vondst bestaat niet meer.";
    if (kind === "s") {
      await setStarred(env.DB, find.id, true);
      return "⭐ Bewaard op de pagina.";
    }
    if (find.sellerId == null) return "Verkoper onbekend, kan niet blokkeren.";
    await blockSeller(env.DB, find.sellerId, find.sellerName);
    return `👎 ${find.sellerName ?? "Verkoper"} geblokkeerd. Opheffen kan op de pagina.`;
  }
  return "Onbekende actie.";
}

export async function handleTelegramWebhook(
  request: Request,
  env: Env,
  opts: { fetchFn?: typeof fetch; now?: number } = {},
): Promise<Response> {
  const got = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
  if (!timingSafeEqual(got, await webhookSecret(env))) return new Response("Forbidden", { status: 403 });

  const update = (await request.json().catch(() => null)) as any;
  const cb = update?.callback_query;
  if (!cb) return new Response("ok");
  // Only the owner's chat may press buttons.
  const chatId = String(cb.message?.chat?.id ?? cb.from?.id ?? "");
  if (chatId !== String(env.TELEGRAM_CHAT_ID)) return new Response("ok");

  let text: string;
  try {
    text = await handleAction(env, String(cb.data ?? ""), opts.now ?? Date.now());
  } catch (e) {
    text = `Er ging iets mis: ${(e as Error).message}`;
  }
  await callTelegram(env, "answerCallbackQuery", { callback_query_id: cb.id, text: text.slice(0, 190) }, opts.fetchFn)
    .catch(() => {});
  return new Response("ok");
}
