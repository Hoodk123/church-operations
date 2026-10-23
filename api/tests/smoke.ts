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
import { createPrisma } from "../db.js";
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
  const prisma = createPrisma(env);
  const app = await buildServer({ env, prisma });

  try {
    // Give the seeded fake Admin a throwaway password for this process only.
    const password = randomBytes(18).toString("base64url");
    const hash = await hashPassword(password);
    await prisma.users.update({
      where: { email: ADMIN_EMAIL },
      data: { passwordHash: hash, failedLoginCount: 0, lockedUntil: null, active: true },
    });
    const deskPassword = randomBytes(18).toString("base64url");
    const deskHash = await hashPassword(deskPassword);
    await prisma.users.update({
      where: { email: "desk@church.test" },
      data: { passwordHash: deskHash, failedLoginCount: 0, lockedUntil: null, active: true },
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

      // ---- People flow on the fully built server (people.features) ----
      const peopleHeaders = {
        origin: env.APP_ORIGIN,
        "content-type": "application/json",
      };
      const personBase = {
        firstName: "Smoke",
        lastName: `Person${randomBytes(3).toString("hex")}`,
        gender: "Male",
        phone: "+250788000111",
        location: "Kigali",
        category: "Visitor",
        followUpStatus: "Not Started",
        needsPastor: false,
        needsM1: false,
        needsBaptism: false,
      };

      const secondLogin = await second.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: peopleHeaders,
        payload: { email: ADMIN_EMAIL, password },
      });
      assert.strictEqual(secondLogin.statusCode, 200);
      const adminSession = secondLogin.cookies.find((c) => c.name === "ch_sess")?.value ?? "";
      const adminCsrf = secondLogin.cookies.find((c) => c.name === "ch_csrf")?.value ?? "";
      const adminCookie = `ch_sess=${adminSession}; ch_csrf=${adminCsrf}`;

      // invalid phone -> 400
      const badPhone = await second.inject({
        method: "POST",
        url: "/api/people",
        headers: { ...peopleHeaders, cookie: adminCookie, "x-csrf-token": adminCsrf },
        payload: { ...personBase, phone: "12345" },
      });
      assert.strictEqual(badPhone.statusCode, 400);

      // create -> 201
      const created = await second.inject({
        method: "POST",
        url: "/api/people",
        headers: { ...peopleHeaders, cookie: adminCookie, "x-csrf-token": adminCsrf },
        payload: personBase,
      });
      assert.strictEqual(created.statusCode, 201);
      const person = created.json();
      assert.strictEqual(person.notes, undefined);
      assert.ok(person.id);

      // duplicate phone -> 409
      const dup = await second.inject({
        method: "POST",
        url: "/api/people",
        headers: { ...peopleHeaders, cookie: adminCookie, "x-csrf-token": adminCsrf },
        payload: personBase,
      });
      assert.strictEqual(dup.statusCode, 409);

      // list contains the person
      const listed = await second.inject({
        method: "GET",
        url: "/api/people?limit=1&offset=0",
        headers: { origin: env.APP_ORIGIN, cookie: adminCookie },
      });
      assert.strictEqual(listed.statusCode, 200);
      assert.ok(listed.json().total >= 1);
      assert.ok(listed.json().items[0].createdAt);

      // edit: notes; assign to Pastor member? leave unassigned; contact log ->
      // trigger moves follow_up_status to "Contacted" and stamps last_contact_date
      const logged = await second.inject({
        method: "POST",
        url: `/api/people/${person.id}/contact-log`,
        headers: { ...peopleHeaders, cookie: adminCookie, "x-csrf-token": adminCsrf },
        payload: { method: "Call", outcome: "Reached", note: "smoke log", finished: false },
      });
      assert.strictEqual(logged.statusCode, 200);
      const detail = await second.inject({
        method: "GET",
        url: `/api/people/${person.id}`,
        headers: { origin: env.APP_ORIGIN, cookie: adminCookie },
      });
      assert.strictEqual(detail.statusCode, 200);
      const afterLog = detail.json();
      assert.strictEqual(afterLog.person.followUpStatus, "Contacted");
      assert.ok(afterLog.person.lastContactDate, "last contact date stamped");
      assert.strictEqual(afterLog.contactLogs.length, 1);
      assert.strictEqual(afterLog.contactLogs[0].outcome, "Reached");

      // deleting the log entry must recompute the person (trigger `revert`)
      await prisma.contactLog.deleteMany({ where: { personId: person.id } });
      const afterRevert = await second.inject({
        method: "GET",
        url: `/api/people/${person.id}`,
        headers: { origin: env.APP_ORIGIN, cookie: adminCookie },
      });
      assert.strictEqual(afterRevert.json().person.followUpStatus, "Not Started");

      // mark new convert sets category + needs_pastor
      const marked = await second.inject({
        method: "POST",
        url: `/api/people/${person.id}/mark-new-convert`,
        headers: { ...peopleHeaders, cookie: adminCookie, "x-csrf-token": adminCsrf },
      });
      assert.strictEqual(marked.statusCode, 200);
      assert.strictEqual(marked.json().category, "New Convert");
      assert.strictEqual(marked.json().needsPastor, true);

      // erase person (admin only)
      const erased = await second.inject({
        method: "DELETE",
        url: `/api/people/${person.id}`,
        headers: { ...peopleHeaders, cookie: adminCookie, "x-csrf-token": adminCsrf },
      });
      assert.strictEqual(erased.statusCode, 204);

      // Info Desk must not see notes, Admin must
      const deskLogin = await second.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: peopleHeaders,
        payload: { email: "desk@church.test", password: deskPassword },
      });
      assert.strictEqual(deskLogin.statusCode, 200);
      const deskSession = deskLogin.cookies.find((c) => c.name === "ch_sess")?.value ?? "";
      const deskCsrf = deskLogin.cookies.find((c) => c.name === "ch_csrf")?.value ?? "";
      const deskCookie = `ch_sess=${deskSession}; ch_csrf=${deskCsrf}`;

      const created2 = await second.inject({
        method: "POST",
        url: "/api/people",
        headers: { ...peopleHeaders, cookie: adminCookie, "x-csrf-token": adminCsrf },
        payload: { ...personBase, notes: "confidential note" },
      });
      assert.strictEqual(created2.statusCode, 201);
      const personId2 = created2.json().id;
      assert.strictEqual(created2.json().notes, undefined);
      const adminDetail = await second.inject({
        method: "GET",
        url: `/api/people/${personId2}`,
        headers: { origin: env.APP_ORIGIN, cookie: adminCookie },
      });
      assert.strictEqual(adminDetail.json().person.notes, "confidential note");
      const deskDetail = await second.inject({
        method: "GET",
        url: `/api/people/${personId2}`,
        headers: { origin: env.APP_ORIGIN, cookie: deskCookie },
      });
      assert.strictEqual(deskDetail.json().person.notes, undefined);
      const deskErase = await second.inject({
        method: "DELETE",
        url: `/api/people/${personId2}`,
        headers: { ...peopleHeaders, cookie: deskCookie, "x-csrf-token": deskCsrf },
      });
      assert.strictEqual(deskErase.statusCode, 403);
      await second.inject({
        method: "DELETE",
        url: `/api/people/${personId2}`,
        headers: { ...peopleHeaders, cookie: adminCookie, "x-csrf-token": adminCsrf },
      });
    } finally {
      await second.close();
    }

    console.log("SMOKE OK");
  } finally {
    // Restore clean lock state for the fake account.
    await prisma.users.update({
      where: { email: ADMIN_EMAIL },
      data: { failedLoginCount: 0, lockedUntil: null },
    }).catch(() => {});
    await app.close();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("SMOKE FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
