// Auth/identity slice tests (docs/09 Phase 4): /api/auth/me now carries the
// signed-in user's team_members row; login keeps its contract; metrics exposes
// lastPersonUpdatedAt for the shell header. Fake accounts only. Run: npm test
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../server.js";
import { createPrisma, type ApiPrisma } from "../db.js";
import { loadEnv } from "../env.js";
import { hashPassword } from "../auth/passwords.js";

let app: FastifyInstance;
let prisma: ApiPrisma;
let adminPassword = "";

beforeAll(async () => {
  const env = loadEnv();
  prisma = createPrisma(env);
  app = await buildServer({ env, prisma });
  adminPassword = randomBytes(18).toString("base64url");
  await prisma.users.update({
    where: { email: "admin@church.test" },
    data: { passwordHash: await hashPassword(adminPassword), failedLoginCount: 0, lockedUntil: null, active: true },
  });
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { entity: "users" } });
  await app.close();
  await prisma.$disconnect();
});

function loginHeaders(password: string) {
  return {
    method: "POST" as const,
    url: "/api/auth/login",
    remoteAddress: "10.9.0.99",
    headers: { origin: "http://localhost:5173", "content-type": "application/json" },
    payload: { email: "admin@church.test", password },
  };
}

test("me returns the user and their team-member row", async () => {
  const login = await app.inject(loginHeaders(adminPassword));
  expect(login.statusCode).toBe(200);
  const cookie = `ch_sess=${login.cookies.find((c) => c.name === "ch_sess")?.value ?? ""}`;

  const meRes = await app.inject({
    method: "GET",
    url: "/api/auth/me",
    headers: { origin: "http://localhost:5173", cookie },
  });
  expect(meRes.statusCode).toBe(200);
  const body = meRes.json() as {
    user: { id: string; email: string; role: string };
    member: { id: string; fullName: string; role: string } | null;
  };
  expect(body.user.email).toBe("admin@church.test");
  expect(typeof body.member?.fullName).toBe("string");
  expect(body.member?.role).toBeTruthy();
});

test("metrics carries lastPersonUpdatedAt for the shell", async () => {
  const login = await app.inject(loginHeaders(adminPassword));
  const cookie = `ch_sess=${login.cookies.find((c) => c.name === "ch_sess")?.value ?? ""}`;
  const res = await app.inject({
    method: "GET",
    url: "/api/metrics",
    headers: { origin: "http://localhost:5173", cookie },
  });
  expect(res.statusCode).toBe(200);
  const metrics = res.json() as { lastPersonUpdatedAt: string | null };
  expect(metrics.lastPersonUpdatedAt === null || typeof metrics.lastPersonUpdatedAt === "string").toBe(true);
});
