// Route registry test (Phase 3, work order B). Asserts the EXACT set of
// registered routes (method + path + action), so a feature module can never
// silently go unregistered in api/routes/index.ts again. The server's own
// startup check only rejects routes WITHOUT a policy; it cannot notice a
// module that was removed from the registration hub. This test can.
//
// Fake data only; needs the test Postgres from .env / CI environment.
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { ACTIONS } from "../policy.js";
import { buildServer } from "../server.js";
import { createPrisma, type ApiPrisma } from "../db.js";
import { loadEnv } from "../env.js";

let app: FastifyInstance;
let prisma: ApiPrisma;

beforeAll(async () => {
  const env = loadEnv();
  prisma = createPrisma(env);
  app = await buildServer({ env, prisma });
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

/** The exact expected inventory. Sorted, so the comparison is order-proof. */
const EXPECTED_ROUTES: ReadonlyArray<{ method: string; url: string; action: string | null }> = [
  { method: "GET", url: "/api/health", action: null },
  { method: "HEAD", url: "/api/health", action: null },
  { method: "POST", url: "/api/auth/login", action: null },
  { method: "GET", url: "/api/attention", action: "attention:read" },
  { method: "HEAD", url: "/api/attention", action: "attention:read" },
  { method: "GET", url: "/api/auth/me", action: "account:me" },
  { method: "HEAD", url: "/api/auth/me", action: "account:me" },
  { method: "POST", url: "/api/auth/logout", action: "account:me" },
  { method: "POST", url: "/api/auth/password", action: "account:password" },
  { method: "GET", url: "/api/people", action: "people:read" },
  { method: "HEAD", url: "/api/people", action: "people:read" },
  { method: "GET", url: "/api/people-recent", action: "people:read" },
  { method: "HEAD", url: "/api/people-recent", action: "people:read" },
  { method: "GET", url: "/api/team-members", action: "people:read" },
  { method: "HEAD", url: "/api/team-members", action: "people:read" },
  { method: "GET", url: "/api/people/:id", action: "people:read" },
  { method: "HEAD", url: "/api/people/:id", action: "people:read" },
  { method: "GET", url: "/api/people/:id/export", action: "export-person" },
  { method: "HEAD", url: "/api/people/:id/export", action: "export-person" },
  { method: "POST", url: "/api/people", action: "people:create" },
  { method: "PATCH", url: "/api/people/:id", action: "people:edit" },
  { method: "PATCH", url: "/api/people/:id/assign", action: "people:assign" },
  { method: "PATCH", url: "/api/people/bulk-assign", action: "people:assign" },
  { method: "POST", url: "/api/people/:id/mark-new-convert", action: "people:edit" },
  { method: "POST", url: "/api/people/:id/contact-log", action: "followup:log" },
  { method: "DELETE", url: "/api/people/:id", action: "erase-person" },
  { method: "GET", url: "/api/checkin/search", action: "checkin:read" },
  { method: "HEAD", url: "/api/checkin/search", action: "checkin:read" },
  { method: "GET", url: "/api/checkin/today", action: "checkin:read" },
  { method: "HEAD", url: "/api/checkin/today", action: "checkin:read" },
  { method: "POST", url: "/api/checkin", action: "checkin:create" },
  { method: "DELETE", url: "/api/checkin/:id", action: "checkin:undo" },
  { method: "POST", url: "/api/checkin/new-visitor", action: "checkin:create" },
  { method: "GET", url: "/api/checkin/expected-today", action: "checkin:read" },
  { method: "HEAD", url: "/api/checkin/expected-today", action: "checkin:read" },
  { method: "GET", url: "/api/board", action: "people:read" },
  { method: "HEAD", url: "/api/board", action: "people:read" },
  { method: "PATCH", url: "/api/people/:id/follow-up-status", action: "board:move" },
  { method: "GET", url: "/api/templates", action: "templates:read" },
  { method: "HEAD", url: "/api/templates", action: "templates:read" },
  { method: "POST", url: "/api/templates", action: "templates:write" },
  { method: "PATCH", url: "/api/templates/:id", action: "templates:write" },
  { method: "PATCH", url: "/api/templates/reorder", action: "templates:write" },
  { method: "DELETE", url: "/api/templates/:id", action: "templates:write" },
  { method: "GET", url: "/api/m1/classes", action: "m1:read" },
  { method: "HEAD", url: "/api/m1/classes", action: "m1:read" },
  { method: "POST", url: "/api/m1/classes", action: "m1:delete" },
  { method: "PATCH", url: "/api/m1/classes/:id", action: "m1:delete" },
  { method: "DELETE", url: "/api/m1/classes/:id", action: "m1:delete" },
  { method: "GET", url: "/api/m1/classes/:id/sessions", action: "m1:read" },
  { method: "HEAD", url: "/api/m1/classes/:id/sessions", action: "m1:read" },
  { method: "GET", url: "/api/m1/classes/:id/enrollments", action: "m1:read" },
  { method: "HEAD", url: "/api/m1/classes/:id/enrollments", action: "m1:read" },
  { method: "POST", url: "/api/m1/classes/:id/enrollments", action: "m1:enroll" },
  { method: "GET", url: "/api/m1/classes/:id/attendance", action: "m1:read" },
  { method: "HEAD", url: "/api/m1/classes/:id/attendance", action: "m1:read" },
  { method: "PATCH", url: "/api/m1/sessions/:id/attendance", action: "m1:tick" },
  { method: "POST", url: "/api/m1/sessions/:id/close", action: "m1:tick" },
  { method: "POST", url: "/api/m1/certificates", action: "m1:certificates" },
  { method: "GET", url: "/api/m1/waiting-list", action: "m1:read" },
  { method: "HEAD", url: "/api/m1/waiting-list", action: "m1:read" },
  { method: "GET", url: "/api/metrics", action: "metrics:read" },
  { method: "HEAD", url: "/api/metrics", action: "metrics:read" },
  { method: "GET", url: "/api/metrics/people-open", action: "metrics:read" },
  { method: "HEAD", url: "/api/metrics/people-open", action: "metrics:read" },
  { method: "GET", url: "/api/metrics/volunteers", action: "metrics:volunteers" },
  { method: "HEAD", url: "/api/metrics/volunteers", action: "metrics:volunteers" },
  { method: "GET", url: "/api/admin/users", action: "admin:users" },
  { method: "HEAD", url: "/api/admin/users", action: "admin:users" },
  { method: "POST", url: "/api/admin/users/:id/password", action: "admin:users" },
  { method: "GET", url: "/api/baptism/candidates", action: "baptism:read" },
  { method: "HEAD", url: "/api/baptism/candidates", action: "baptism:read" },
  { method: "GET", url: "/api/baptism/events", action: "baptism:read" },
  { method: "HEAD", url: "/api/baptism/events", action: "baptism:read" },
  { method: "GET", url: "/api/baptism/registrations", action: "baptism:read" },
  { method: "HEAD", url: "/api/baptism/registrations", action: "baptism:read" },
  { method: "POST", url: "/api/baptism/events", action: "baptism:write" },
  { method: "PATCH", url: "/api/baptism/events/:id", action: "baptism:write" },
  { method: "POST", url: "/api/baptism/events/:id/mark-done", action: "baptism:write" },
  { method: "DELETE", url: "/api/baptism/events/:id", action: "baptism:delete" },
  { method: "POST", url: "/api/baptism/registrations", action: "baptism:write" },
  { method: "DELETE", url: "/api/baptism/registrations/:id", action: "baptism:write" },
  { method: "GET", url: "/api/m1/classes/:id/materials", action: "m1:read" },
  { method: "HEAD", url: "/api/m1/classes/:id/materials", action: "m1:read" },
  { method: "POST", url: "/api/m1/classes/:id/materials", action: "m1:enroll" },
  { method: "GET", url: "/api/m1/materials/:id/signed", action: "m1:read" },
  { method: "HEAD", url: "/api/m1/materials/:id/signed", action: "m1:read" },
  { method: "DELETE", url: "/api/m1/materials/:id", action: "m1:materials-manage" },
  { method: "GET", url: "/api/public/files/:token", action: null },
  { method: "HEAD", url: "/api/public/files/:token", action: null },
  { method: "GET", url: "/api/m1/sessions/:id/messages", action: "m1:read" },
  { method: "HEAD", url: "/api/m1/sessions/:id/messages", action: "m1:read" },
  { method: "GET", url: "/api/m1/classes/:id/absence-replies", action: "m1:read" },
  { method: "HEAD", url: "/api/m1/classes/:id/absence-replies", action: "m1:read" },
  { method: "POST", url: "/api/m1/messages", action: "m1:enroll" },
  { method: "POST", url: "/api/m1/sessions/:id/reply-links", action: "m1:enroll" },
  { method: "GET", url: "/api/public/reply/:token", action: null },
  { method: "HEAD", url: "/api/public/reply/:token", action: null },
  { method: "POST", url: "/api/public/reply/:token", action: null },
  { method: "POST", url: "/api/public/welcome", action: null },
  { method: "POST", url: "/api/public/welcome/returning", action: null },
  { method: "POST", url: "/api/imports/people", action: "import:run" },
];

const ACTION_SET = new Set<string>(ACTIONS);

function actualRoutes(): Array<{ method: string; url: string; action: string | null }> {
  return (app.declaredRoutes ?? []).map((route) => ({
    method: route.method,
    url: route.url,
    action: route.action ?? null,
  }));
}

function sortRoutes(routes: ReadonlyArray<{ method: string; url: string; action: string | null }>): Array<{ method: string; url: string; action: string | null }> {
  return routes.slice().sort((a, b) => `${a.method}|${a.url}|${a.action}`.localeCompare(`${b.method}|${b.url}|${b.action}`));
}

describe("route registry", () => {
  it("registers exactly the expected set (a module can never go unregistered)", () => {
    const actual = sortRoutes(actualRoutes());
    const expected = sortRoutes(EXPECTED_ROUTES);
    expect(actual).toHaveLength(expected.length);
    expect(expected).toEqual(actual);
  });

  it("declares an access on every route", () => {
    for (const route of app.declaredRoutes ?? []) {
      expect(
        route.access === "public" || route.access === "auth",
        `${route.method} ${route.url}: access=${String(route.access)}`,
      ).toBe(true);
    }
  });

  it("declares a valid action on every auth route and none on public routes", () => {
    for (const route of app.declaredRoutes ?? []) {
      if (route.access === "auth") {
        expect(route.action, `${route.method} ${route.url}`).toBeDefined();
        expect(ACTION_SET.has(route.action as string), `${route.method} ${route.url}: ${route.action}`).toBe(true);
      } else {
        expect(route.action, `${route.method} ${route.url}`).toBeUndefined();
      }
    }
  });
});

