import { isAuthenticated, login, loginPage, logout } from "../auth";
import {
  countSnipers,
  countTerms,
  getSettings,
  listBlocked,
  saveSettings,
  setPausedUntil,
  setStarred,
  starredFinds,
  unblockSeller,
  createSniper,
  deleteSniper,
  getSniper,
  listSnipers,
  recentFindsPerSniper,
  setActive,
  updateSniper,
  type SniperInput,
} from "../db";
import { fetchSearch, parseCategories } from "../marktplaats";
import { handleInternalRun } from "../scheduler";
import { sendTelegram } from "../telegram";
import type { Env } from "../types";
import { activateWebhook, handleTelegramWebhook } from "../webhook";
import { getStatus } from "../stats";
import { faviconResponse } from "./favicon";
import { renderPage } from "./page";
import { renderStatusPage } from "./status";

export const MAX_SNIPERS = 20;
export const MAX_TERMS_PER_SNIPER = 3;
// Each term is one self-request per minute; stays under the 50 subrequests of a cron invocation.
export const MAX_TERMS_TOTAL = 40;

export interface WebOptions {
  fetchFn?: typeof fetch;
}

class ValidationError extends Error {}

const json = (data: unknown, status = 200) => Response.json(data, { status });

function optionalNumber(v: unknown, field: string): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new ValidationError(`${field} moet een positief getal zijn`);
  return n;
}

export function parseSniperInput(body: any): SniperInput {
  if (!body || typeof body !== "object") throw new ValidationError("Ongeldige invoer");
  const name = String(body.name ?? "").trim();
  if (!name) throw new ValidationError("Naam is verplicht");
  const rawTerms = Array.isArray(body.queries) ? body.queries : String(body.queries ?? body.query ?? "").split(",");
  const queries = [...new Set(rawTerms.map((q: unknown) => String(q).trim().replace(/\s+/g, " ")).filter(Boolean))] as string[];
  if (queries.length === 0) throw new ValidationError("Vul minstens één zoekterm in");
  if (queries.length > MAX_TERMS_PER_SNIPER) {
    throw new ValidationError(`Maximaal ${MAX_TERMS_PER_SNIPER} zoektermen per sniper`);
  }

  const minPrice = optionalNumber(body.minPrice, "Minimumprijs");
  const maxPrice = optionalNumber(body.maxPrice, "Maximumprijs");
  if (minPrice != null && maxPrice != null && minPrice > maxPrice) {
    throw new ValidationError("Minimumprijs mag niet hoger zijn dan maximumprijs");
  }

  const rawPostcode = String(body.postcode ?? "").trim();
  let postcode: string | null = null;
  if (rawPostcode) {
    if (!/^\d{4}\s?[A-Za-z]{2}$/.test(rawPostcode)) throw new ValidationError("Postcode moet zijn als 1234AB");
    postcode = rawPostcode.replace(/\s+/g, "").toUpperCase();
  }
  const distanceKm = optionalNumber(body.distanceKm, "Afstand");
  if (distanceKm != null && !postcode) throw new ValidationError("Vul een postcode in om op afstand te filteren");

  const words = Array.isArray(body.excludeWords) ? body.excludeWords : String(body.excludeWords ?? "").split(",");
  const excludeWords = words.map((w: unknown) => String(w).trim()).filter(Boolean);

  const l1CategoryId = optionalNumber(body.l1CategoryId, "Categorie");
  const categoryId = optionalNumber(body.categoryId, "Categorie");

  return {
    name,
    queries,
    minPriceCents: minPrice == null ? null : Math.round(minPrice * 100),
    maxPriceCents: maxPrice == null ? null : Math.round(maxPrice * 100),
    excludeWords,
    titleOnly: body.titleOnly !== false,
    postcode,
    distanceKm: distanceKm == null ? null : Math.round(distanceKm),
    l1CategoryId: categoryId == null ? null : l1CategoryId ?? categoryId,
    categoryId,
    includeBids: body.includeBids !== false,
    active: body.active !== false,
  };
}

function termsFull(): Response {
  return json({ error: `Maximaal ${MAX_TERMS_TOTAL} zoektermen in totaal (om gratis te blijven)` }, 409);
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ValidationError("Ongeldige JSON");
  }
}

async function api(request: Request, env: Env, path: string, opts: WebOptions): Promise<Response> {
  const m = request.method;
  const db = env.DB;

  if (path === "/api/snipers" && m === "GET") return json(await listSnipers(db));
  if (path === "/api/snipers" && m === "POST") {
    const input = parseSniperInput(await readJson(request));
    if ((await countSnipers(db)) >= MAX_SNIPERS) return json({ error: `Maximaal ${MAX_SNIPERS} snipers` }, 409);
    if ((await countTerms(db)) + input.queries.length > MAX_TERMS_TOTAL) return termsFull();
    return json({ id: await createSniper(db, input) }, 201);
  }

  const one = path.match(/^\/api\/snipers\/(\d+)(\/active|\/pause)?$/);
  if (one) {
    const id = Number(one[1]);
    if (!(await getSniper(db, id))) return json({ error: "Sniper niet gevonden" }, 404);
    if (one[2] === "/active" && m === "POST") {
      const body = (await readJson(request)) as any;
      await setActive(db, id, !!body?.active);
      return json({ ok: true });
    }
    if (one[2] === "/pause" && m === "POST") {
      const body = (await readJson(request)) as any;
      const minutes = optionalNumber(body?.minutes, "Pauze");
      await setPausedUntil(db, id, minutes ? new Date(Date.now() + minutes * 60_000).toISOString() : null);
      return json({ ok: true });
    }
    if (!one[2] && m === "PUT") {
      const input = parseSniperInput(await readJson(request));
      if ((await countTerms(db, id)) + input.queries.length > MAX_TERMS_TOTAL) return termsFull();
      await updateSniper(db, id, input);
      return json({ ok: true });
    }
    if (!one[2] && m === "DELETE") {
      await deleteSniper(db, id);
      return json({ ok: true });
    }
  }

  if (path === "/api/categories" && m === "GET") {
    const q = new URL(request.url).searchParams.get("q")?.trim();
    if (!q) throw new ValidationError("Vul eerst een zoekterm in");
    try {
      const res = await fetchSearch({ query: q, postcode: null, distanceKm: null, l1CategoryId: null }, opts.fetchFn);
      return json(parseCategories(res));
    } catch (e) {
      return json({ error: `Marktplaats niet bereikbaar: ${(e as Error).message}` }, 502);
    }
  }

  if (path === "/api/finds" && m === "GET") return json(await recentFindsPerSniper(db, 10));
  if (path === "/api/status" && m === "GET") return json(await getStatus(db));
  if (path === "/api/starred" && m === "GET") return json(await starredFinds(db));
  const star = path.match(/^\/api\/finds\/(\d+)\/star$/);
  if (star && m === "POST") {
    const body = (await readJson(request)) as any;
    if (!(await setStarred(db, Number(star[1]), !!body?.starred))) return json({ error: "Vondst niet gevonden" }, 404);
    return json({ ok: true });
  }

  if (path === "/api/blocked" && m === "GET") return json(await listBlocked(db));
  const unblock = path.match(/^\/api\/blocked\/(\d+)$/);
  if (unblock && m === "DELETE") {
    await unblockSeller(db, Number(unblock[1]));
    return json({ ok: true });
  }

  if (path === "/api/settings" && m === "GET") return json(await getSettings(db));
  if (path === "/api/settings" && m === "PUT") {
    const body = (await readJson(request)) as any;
    const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!hhmm.test(String(body?.quietStart)) || !hhmm.test(String(body?.quietEnd))) {
      throw new ValidationError("Tijden moeten zijn als 23:00");
    }
    await saveSettings(db, { quietEnabled: !!body.quietEnabled, quietStart: body.quietStart, quietEnd: body.quietEnd });
    return json(await getSettings(db));
  }

  if (path === "/api/telegram/activate" && m === "POST") {
    try {
      await activateWebhook(env, new URL(request.url).origin, opts.fetchFn);
      return json({ ok: true });
    } catch (e) {
      return json({ error: (e as Error).message }, 502);
    }
  }

  if (path === "/api/test-telegram" && m === "POST") {
    try {
      await sendTelegram(env, "✅ Marktplaats Radar is gekoppeld.", null, opts.fetchFn);
      return json({ ok: true });
    } catch (e) {
      return json({ error: (e as Error).message }, 502);
    }
  }

  return json({ error: "Niet gevonden" }, 404);
}

export async function handleRequest(request: Request, env: Env, opts: WebOptions = {}): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  const run = path.match(/^\/internal\/run\/(\d+)$/);
  if (run && request.method === "POST") return handleInternalRun(request, env, Number(run[1]));

  if (path === "/telegram/webhook" && request.method === "POST") return handleTelegramWebhook(request, env);
  if (path === "/favicon.svg" || path === "/favicon.ico") return faviconResponse();

  if (path === "/login") return request.method === "POST" ? login(request, env) : loginPage();

  const authed = await isAuthenticated(request, env);
  if (path.startsWith("/api/")) {
    if (!authed) return json({ error: "Niet ingelogd" }, 401);
    try {
      return await api(request, env, path, opts);
    } catch (e) {
      if (e instanceof ValidationError) return json({ error: e.message }, 400);
      throw e;
    }
  }

  if (!authed) return new Response(null, { status: 303, headers: { Location: "/login" } });
  if (path === "/logout" && request.method === "POST") return logout();
  if (path === "/status" && request.method === "GET") {
    return new Response(renderStatusPage(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
  if (path === "/" && request.method === "GET") {
    return new Response(renderPage(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
  return new Response("Niet gevonden", { status: 404 });
}
