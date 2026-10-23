// Phase 3 smoke test — runs the real server (fastify.inject, no network)
// against the real local database, exercising auth end to end:
// failed login, successful login, session cookies, CSRF, origin checks,
// lockout counting, rate limiting and logout.
// Fake/demo accounts only (seed data). Run: npx tsx api/tests/smoke.ts
import "dotenv/config";
import { randomBytes } from "node:crypto";
import assert from "node:assert";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../server.js";
import { hashPassword } from "../auth/passwords.js";
import { loadEnv } from "../env.js";

const ADMIN_EMAIL = "admin@church.test";

function cookieValue(setCookie: string | readonly string[], name: string): string | null {
  const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!header) return null;
  const match = new RegExp(`${name}=([^;]*)`).exec(header);
  return match?.[1] ?? null;
}

async function main(): Promise<void> {
  const env = loadEnv();
  const app = await buildServer({ env });

  try {
    // Give the seeded fake Admin a throwaway password for this process only.
    const password = randomBytes(18).toString("base64url");
    const hash = await hashPassword(password);
    await app.prisma.users.update({
      where: { email: ADMIN_EMAIL },
      data: { passwordHash: hash, failedLoginCount: 0, lockedUntil: null, active: true },
    });

    // 1) wrong password -> constant 401
    const bad = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: env.APP_ORIGIN, "content-type": "application/json" },
      payload: { email: ADMIN_EMAIL, password: "wrong-password" },
    });
    assert.strictEqual(bad.statusCode, 401);
    assert.deepStrictEqual(bad.json().password ?? undefined, undefined);
    assert.ok(bad.json().error.includes("invalid email or password"));

    // 2) missing origin on a state-changing request -> 403
    const noOrigin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { "content-type": "application/json" },
      payload: { email: ADMIN_EMAIL, password },
    });
    assert.strictEqual(noOrigin.statusCode, 403);

    // 3) wrong origin -> 403
    const evilOrigin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: "https://evil.example", "content-type": "application/json" },
      payload: { email: ADMIN_EMAIL, password },
    });
    assert.strictEqual(evilOrigin.statusCode, 403);

    // 4) correct credentials -> 200, cookies, csrf token
    const good = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: env.APP_ORIGIN, "content-type": "application/json" },
      payload: { email: ADMIN_EMAIL, password },
    });
    assert.strictEqual(good.statusCode, 200);
    const session = cookieValue(good.cookies.map((c) => `${c.name}=${c.value}`.concat()), "ch_sess")
      ?? good.cookies.find((c) => c.name === "ch_sess")?.value ?? null;
    const csrfCookie = good.cookies.find((c) => c.name === "ch_csrf")?.value ?? null;
    assert.ok(session, "session cookie set");
    assert.ok(csrfCookie, "csrf cookie set");
    const loginBody = good.json();
    assert.strictEqual(loginBody.user.role, "Admin");

    // 5) /me without a session -> 401; with session -> 200
    const meAnon = await app.inject({ method: "GET", url: "/api/auth/me" });
    assert.strictEqual(meAnon.statusCode, 401);
    const me = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie: `ch_sess=${session}` },
    });
    assert.strictEqual(me.statusCode, 200);
    assert.strictEqual(me.json().user.email, ADMIN_EMAIL);
    assert.ok(me.headers["cache-control"]?.includes("no-store"));

    // 6) unsafe request without CSRF header -> 403
    const noCsrf = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { origin: env.APP_ORIGIN, cookie: `ch_sess=${session}; ch_csrf=${csrfCookie}` },
      payload: {},
    });
    assert.strictEqual(noCsrf.statusCode, 403);

    // 7) logout with CSRF -> 200; then the session is gone -> 401
    const logout = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: {
        origin: env.APP_ORIGIN,
        cookie: `ch_sess=${session}; ch_csrf=${csrfCookie}`,
        "x-csrf-token": csrfCookie!,
      },
      payload: {},
    });
    assert.strictEqual(logout.statusCode, 200);
    const meAfterLogout = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie: `ch_sess=${session}` },
    });
    assert.strictEqual(meAfterLogout.statusCode, 401);

    // 8) rate limit: 5 free + 1 more login attempt -> the 6th is 429
    for (let i = 0; i < 5; i += 1) {
      await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { origin: env.APP_ORIGIN, "content-type": "application/json" },
        payload: { email: ADMIN_EMAIL, password: `attempt-${i}` },
      });
    }
    const limited = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: env.APP_ORIGIN, "content-type": "application/json" },
      payload: { email: ADMIN_EMAIL, password: "attempt-6" },
    });
    assert.strictEqual(limited.statusCode, 429);
    assert.ok(limited.headers["retry-after"], "429 carries Retry-After");

    // Reset the strict limiter (5/min) to run the last checks.
    const second: FastifyInstance = await buildServer({ env: { ...env, APP_ORIGIN: env.APP_ORIGIN } });
    try {
      const recovered = await second.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { origin: env.APP_ORIGIN, "content-type": "application/json" },
        payload: { email: ADMIN_EMAIL, password },
      });
      assert.strictEqual(recovered.statusCode, 200);
      const body = recovered.json();
      assert.strictEqual(body.user.role, "Admin");

      // 9) deep-nested JSON -> 400
      let payload: unknown = {};
      let cursor = payload as Record<string, unknown>;
      for (let i = 0; i < 20; i += 1) {
        cursor.nest = {};
        cursor = cursor.nest as Record<string, unknown>;
      }
      const deep = await second.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { origin: env.APP_ORIGIN, "content-type": "application/json" },
        payload: JSON.stringify(payload),
      });
      assert.strictEqual(deep.statusCode, 400);
    } finally {
      await second.close();
      await second.prisma.$disconnect();
    }

    console.log("SMOKE OK");
  } finally {
    // Restore clean lock state for the fake account.
    await app.prisma.users.update({
      where: { email: ADMIN_EMAIL },
      data: { failedLoginCount: 0, lockedUntil: null },
    }).catch(() => {});
    await app.close();
    await app.prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("SMOKE FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
