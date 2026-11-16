import { FAVICON_LINK } from "./web/favicon";
import type { Env } from "./types";

const COOKIE = "radar_session";
const MAX_AGE_S = 30 * 24 * 60 * 60;

type AuthEnv = Pick<Env, "APP_PASSWORD" | "SESSION_SECRET">;

export async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function makeSessionCookie(env: AuthEnv, expiresAt: number): Promise<string> {
  return `${COOKIE}=${expiresAt}.${await hmac(env.SESSION_SECRET, String(expiresAt))}`;
}

export async function isAuthenticated(request: Request, env: AuthEnv): Promise<boolean> {
  const cookies = request.headers.get("Cookie") ?? "";
  const match = cookies.match(new RegExp(`(?:^|;\\s*)${COOKIE}=(\\d+)\\.([0-9a-f]+)`));
  if (!match) return false;
  const [, exp, sig] = match;
  if (Number(exp) < Date.now()) return false;
  return timingSafeEqual(sig, await hmac(env.SESSION_SECRET, exp));
}

export async function login(request: Request, env: AuthEnv): Promise<Response> {
  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  // Compare HMACs so the comparison time does not depend on the password.
  const ok = timingSafeEqual(
    await hmac(env.SESSION_SECRET, `pw:${password}`),
    await hmac(env.SESSION_SECRET, `pw:${env.APP_PASSWORD}`),
  );
  if (!ok) return loginPage("Onjuist wachtwoord", 401);
  const cookie = await makeSessionCookie(env, Date.now() + MAX_AGE_S * 1000);
  return new Response(null, {
    status: 303,
    headers: {
      Location: "/",
      "Set-Cookie": `${cookie}; Max-Age=${MAX_AGE_S}; Path=/; HttpOnly; Secure; SameSite=Strict`,
    },
  });
}

export function logout(): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: "/login", "Set-Cookie": `${COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict` },
  });
}

export function loginPage(error?: string, status = 200): Response {
  const html = `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
${FAVICON_LINK}
<title>Marktplaats Radar</title>
<style>
:root{--bg:#f6f5f2;--card:#fff;--text:#1d1d1b;--muted:#6b6a66;--accent:#e8590c;--border:#e3e1dc;--danger:#c92a2a}
@media (prefers-color-scheme:dark){:root{--bg:#141413;--card:#1f1f1d;--text:#f1f0ec;--muted:#a3a29d;--border:#33322f}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,-apple-system,sans-serif;padding:16px}
form{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:28px;width:100%;max-width:340px}
h1{margin:0 0 4px;font-size:22px}p{margin:0 0 20px;color:var(--muted)}
input{width:100%;padding:12px;border:1px solid var(--border);border-radius:10px;background:var(--bg);color:var(--text);font:inherit}
button{margin-top:12px;width:100%;padding:12px;border:0;border-radius:10px;background:var(--accent);color:#fff;font:inherit;font-weight:600;cursor:pointer}
.err{color:var(--danger);margin:10px 0 0}
</style></head><body>
<form method="post" action="/login">
<h1>🎯 Marktplaats Radar</h1><p>Log in om je snipers te beheren.</p>
<input type="password" name="password" placeholder="Wachtwoord" autocomplete="current-password" autofocus required>
<button type="submit">Inloggen</button>
${error ? `<p class="err">${error}</p>` : ""}
</form></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
