import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { isAuthenticated, login, makeSessionCookie } from "../src/auth";

function loginRequest(password: string) {
  return new Request("https://radar.test/login", {
    method: "POST",
    body: new URLSearchParams({ password }),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
}

function withCookie(cookie: string) {
  return new Request("https://radar.test/", { headers: { Cookie: cookie } });
}

describe("auth", () => {
  it("logs in with the right password and the cookie authenticates", async () => {
    const res = await login(loginRequest("geheim"), env);
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/");
    const setCookie = res.headers.get("Set-Cookie")!;
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Strict");
    const cookie = setCookie.split(";")[0];
    expect(await isAuthenticated(withCookie(cookie), env)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const res = await login(loginRequest("fout"), env);
    expect(res.status).toBe(401);
    expect(await res.text()).toContain("Onjuist wachtwoord");
  });

  it("rejects a tampered cookie", async () => {
    const cookie = await makeSessionCookie(env, Date.now() + 60_000);
    const [, value] = cookie.split("=");
    const [exp, sig] = value.split(".");
    const tampered = `radar_session=${Number(exp) + 1}.${sig}`;
    expect(await isAuthenticated(withCookie(tampered), env)).toBe(false);
  });

  it("rejects an expired cookie", async () => {
    const cookie = await makeSessionCookie(env, Date.now() - 1000);
    expect(await isAuthenticated(withCookie(cookie), env)).toBe(false);
  });

  it("rejects missing cookie", async () => {
    expect(await isAuthenticated(new Request("https://radar.test/"), env)).toBe(false);
  });
});
