import { getSettings, getSniper, heldFinds, listBlocked, listSnipers, markFindsPushed, pruneSeen } from "./db";
import { fetchSearchPages } from "./marktplaats";
import { isQuiet, localTime } from "./quiet";
import { cronStatStmt } from "./stats";
import { runSniper, type RadarDeps, type RunContext } from "./radar";
import { escapeHtml, findButtons, formatEuro, formatFind, formatSummary, sendTelegram } from "./telegram";
import type { Env, Sniper } from "./types";

export const WARN_AFTER_ERRORS = 15;

export interface RunOverrides {
  fetchSearch?: RadarDeps["fetchSearch"];
  notify?: RadarDeps["notify"];
  warn?: (text: string) => Promise<void>;
}

interface RunBody {
  sniper: Sniper;
  ctx: Omit<RunContext, "now">;
}

export async function handleInternalRun(
  request: Request,
  env: Env,
  id: number,
  overrides: RunOverrides = {},
): Promise<Response> {
  if (request.headers.get("x-internal-token") !== env.INTERNAL_TOKEN) {
    return new Response("Forbidden", { status: 403 });
  }
  // The cron passes sniper + context in the body (saves D1 reads); fall back to D1 otherwise.
  const raw = await request.text();
  let sniper: Sniper | null;
  let ctx: Omit<RunContext, "now">;
  if (raw) {
    let body: RunBody;
    try {
      body = JSON.parse(raw);
    } catch {
      return new Response("Bad request", { status: 400 });
    }
    if (body?.sniper?.id !== id || typeof body?.ctx?.term !== "string") return new Response("Bad request", { status: 400 });
    sniper = body.sniper;
    ctx = body.ctx;
  } else {
    sniper = await getSniper(env.DB, id);
    ctx = { term: sniper?.queries[0] ?? "", quiet: false, blockedSellers: [] };
  }
  if (!sniper || !sniper.active) return new Response("Not found", { status: 404 });

  const result = await runSniper(sniper, ctx, {
    db: env.DB,
    fetchSearch: overrides.fetchSearch ?? ((s, term) => fetchSearchPages({ ...s, query: term })),
    notify:
      overrides.notify ??
      ((n) => sendTelegram(env, formatFind(n), n.listing.imageUrl, fetch, findButtons(n.sniper.id, n.listing.itemId))),
    summarize: overrides.notify ? undefined : (s, extra) => sendTelegram(env, formatSummary(s, extra)),
  });

  if (result.status === "error" && result.consecutiveErrors === WARN_AFTER_ERRORS) {
    const warn = overrides.warn ?? ((text: string) => sendTelegram(env, text));
    const text =
      `⚠️ Radar "${escapeHtml(sniper.name)}" kan Marktplaats al ${WARN_AFTER_ERRORS} keer achter elkaar niet bereiken: ` +
      escapeHtml(result.message);
    try {
      await warn(text);
    } catch {
      // Nothing more we can do; the error is visible on the page.
    }
  }
  return Response.json(result);
}

/** Sends one message with everything held back during quiet hours, then marks it as summarized. */
export async function sendMorningSummary(
  env: Env,
  sendText: (text: string) => Promise<void> = (t) => sendTelegram(env, t),
): Promise<void> {
  const held = await heldFinds(env.DB);
  if (held.length === 0) return;
  const perSniper = new Map<string, number>();
  for (const f of held) perSniper.set(f.sniperName ?? "?", (perSniper.get(f.sniperName ?? "?") ?? 0) + 1);
  const top = [...held].sort((a, b) => (b.dealPercent ?? -1) - (a.dealPercent ?? -1) || b.id - a.id).slice(0, 3);
  const lines = [`🌅 Vannacht gevonden: ${held.length}`];
  for (const [name, n] of perSniper) lines.push(`• ${escapeHtml(name)}: ${n}`);
  lines.push("", "<b>Uitgelicht:</b>");
  for (const f of top) {
    const price = f.hasPrice ? formatEuro(f.priceCents) : "Bieden";
    const deal = f.dealPercent != null ? ` (−${f.dealPercent}%)` : "";
    lines.push(`${escapeHtml(f.title)} — ${price}${deal} · ${escapeHtml(f.city)}`, escapeHtml(f.url));
  }
  await sendText(lines.join("\n"));
  await markFindsPushed(env.DB, held.map((f) => f.id), 3);
}

export async function scheduled(
  controller: Pick<ScheduledController, "scheduledTime">,
  env: Env,
  ctx: Pick<ExecutionContext, "waitUntil">,
  opts: { sendText?: (text: string) => Promise<void> } = {},
): Promise<void> {
  const [snipers, settings, blocked] = await Promise.all([listSnipers(env.DB), getSettings(env.DB), listBlocked(env.DB)]);
  const now = controller.scheduledTime;
  const hhmm = localTime(now);
  const quiet = isQuiet(settings, hhmm);
  const blockedSellers = blocked.map((b) => b.sellerId);

  let dispatched = 0;
  for (const s of snipers.filter((x) => x.active)) {
    for (const term of s.queries) {
      const body: RunBody = { sniper: s, ctx: { term, quiet, blockedSellers } };
      dispatched++;
      ctx.waitUntil(
        // Read the body so the run's response is not reported as "canceled".
        env.SELF.fetch(`https://internal/internal/run/${s.id}`, {
          method: "POST",
          headers: { "x-internal-token": env.INTERNAL_TOKEN, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).then((r) => r.text()),
      );
    }
  }

  // Counted after dispatching so the status page can compare started vs completed runs.
  ctx.waitUntil(cronStatStmt(env.DB, now, dispatched).run());

  if (settings.quietEnabled && hhmm === settings.quietEnd) {
    ctx.waitUntil(sendMorningSummary(env, opts.sendText).catch(() => {}));
  }
  const t = new Date(now);
  if (t.getUTCHours() === 3 && t.getUTCMinutes() === 0) ctx.waitUntil(pruneSeen(env.DB));
}
