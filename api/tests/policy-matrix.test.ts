// Role × action matrix test (Phase 3, work order C). Two layers:
//
// 1. POLICY: `can()` must match the Phase 8 docs/09 table cell-for-cell
//    (plus the decisions: Coordinator loses counseling:read, gains
//    baptism:write + checkin:read; Info Desk keeps people:edit; Pastor is
//    read-only except counseling:write). A policy change that fails no test
//    no longer ships.
//
// 2. HTTP: every action that HAS a registered route today is exercised for
//    every role through the real server (fastify.inject) against the real
//    test Postgres: allowed -> not 403/401 and not 5xx; denied -> exactly 403.
//
// Fake seed accounts and fake people only. Run: npm test
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, expect, test } from "vitest";
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from "fastify";
import { ACTIONS, type Action, type Role, can } from "../policy.js";
import { buildServer } from "../server.js";
import { createPrisma, type ApiPrisma } from "../db.js";
import { hashPassword } from "../auth/passwords.js";
import { loadEnv } from "../env.js";

// ---------------------------------------------------------------------------
// Part 1 — the expected matrix, straight from docs/09 Phase 8 + decisions.
// ---------------------------------------------------------------------------

const ALL: readonly Action[] = ACTIONS;

const EXPECTED: Record<Role, readonly Action[]> = {
  Admin: ALL,
  "Info Desk": [
    "account:me",
    "account:password",
    "checkin:read",
    "checkin:create",
    "checkin:undo",
    "attendance:read",
    "attendance:tick",
    "people:read",
    "people:create",
    "people:edit",
    "m1:read",
    "m1:tick",
    "m1:enroll",
    "baptism:read",
    "metrics:read",
    "templates:read",
  ],
  "Follow-up Coordinator": [
    "account:me",
    "account:password",
    "people:read",
    "people:read-notes",
    "people:assign",
    "followup:read",
    "followup:log",
    "board:move",
    "checkin:read",
    "attendance:read",
    "m1:read",
    "m1:tick",
    "m1:enroll",
    "baptism:write",
    "baptism:read",
    "metrics:read",
    "templates:read",
  ],
  Pastor: [
    "account:me",
    "account:password",
    "people:read",
    "people:read-notes",
    "counseling:read",
    "counseling:write",
    "followup:read",
    "checkin:read",
    "attendance:read",
    "m1:read",
    "baptism:read",
    "metrics:read",
  ],
};

test("policy matrix matches the Phase 8 table exactly, and default-denies unknown roles", () => {
  for (const role of Object.keys(EXPECTED) as Role[]) {
    for (const action of ACTIONS) {
      expect(can(role, action), `${role} -> ${action}`).toBe(EXPECTED[role].includes(action));
    }
  }
  for (const role of ["", "InfoDesk", "Anon"]) {
    for (const action of ACTIONS) {
      expect(can(role as Role, action), `"${role}" -> ${action}`).toBe(false);
    }
  }
});

// ---------------------------------------------------------------------------
// Part 2 — the per-role HTTP sweep. Each step's URL intentionally targets a
// plausible-but-throwaway fixture when an allowed mutation would be destructive
// (allowed -> 404 is fine; denied -> 403 is the point).
// ---------------------------------------------------------------------------

interface StepSpec {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  url(): string;
  body?(): unknown;
  /** capture response data (ids) into fixture state on allowed calls */
  capture?(res: LightMyRequestResponse): void;
}

const fixtureUuid = (): string =>
  `${randomBytes(4).toString("hex")}-${randomBytes(2).toString("hex")}-4${randomBytes(2).toString("hex")}-8${randomBytes(2).toString("hex")}-${randomBytes(6).toString("hex")}`;

let personId = "";
let lastCheckinId: string | null = null;
let m1ClassId = "";
let m1SessionId = "";
let m1EnrollmentId: string | null = null;
let baptismEventId: string | null = null;
let coordinatorMemberId = "";
const createdPersonIds: string[] = [];
const createdTemplateIds: string[] = [];
const createdRegistrationIds: string[] = [];

const STEPS: ReadonlyArray<StepSpec & { action: Action }> = [
  { action: "account:me", method: "GET", url: () => "/api/auth/me" },
  // allowed: 400 (zod on empty body), denied: 403
  { action: "account:password", method: "POST", url: () => "/api/auth/password", body: () => ({}) },
  { action: "people:read", method: "GET", url: () => "/api/people?limit=1&offset=0" },
  {
    action: "people:create",
    method: "POST",
    url: () => "/api/people",
    body: () => ({
      firstName: "Matrix",
      lastName: `P${randomBytes(3).toString("hex")}`,
      gender: "Male",
      phone: `+2507882${randomBytes(3).toString("hex")}`,
      location: "Kigali",
      category: "Visitor",
      followUpStatus: "Not Started",
      needsPastor: false,
      needsM1: false,
      needsBaptism: false,
    }),
    capture: (res) => {
      const id = (res.json() as { id?: string }).id;
      if (typeof id === "string") createdPersonIds.push(id);
    },
  },
  {
    action: "people:edit",
    method: "PATCH",
    url: () => `/api/people/${personId}`,
    body: () => ({ location: "Kigali" }),
  },
  {
    action: "people:assign",
    method: "PATCH",
    url: () => `/api/people/${personId}/assign`,
    body: () => ({ assignedTo: coordinatorMemberId }),
  },
  {
    action: "followup:log",
    method: "POST",
    url: () => `/api/people/${personId}/contact-log`,
    body: () => ({ method: "Call", outcome: "Reached", note: "matrix step", finished: false }),
  },
  {
    action: "board:move",
    method: "PATCH",
    url: () => `/api/people/${personId}/follow-up-status`,
    body: () => ({ followUpStatus: "Contacted" }),
  },
  { action: "checkin:read", method: "GET", url: () => "/api/checkin/today" },
  {
    action: "checkin:create",
    method: "POST",
    url: () => "/api/checkin",
    body: () => ({ personId }),
    capture: (res) => {
      const id = (res.json() as { id?: string }).id;
      if (typeof id === "string") lastCheckinId = id;
    },
  },
  { action: "checkin:undo", method: "DELETE", url: () => `/api/checkin/${lastCheckinId ?? fixtureUuid()}` },
  { action: "m1:read", method: "GET", url: () => "/api/m1/classes" },
  {
    action: "m1:enroll",
    method: "POST",
    url: () => `/api/m1/classes/${m1ClassId}/enrollments`,
    body: () => ({ personId }),
    capture: (res) => {
      const id = (res.json() as { id?: string }).id;
      if (typeof id === "string") m1EnrollmentId = id;
    },
  },
  {
    action: "m1:tick",
    method: "PATCH",
    url: () => `/api/m1/sessions/${m1SessionId}/attendance`,
    body: () => ({ personId, status: "Present" }),
  },
  {
    action: "m1:certificates",
    method: "POST",
    url: () => "/api/m1/certificates",
    body: () => ({ enrollmentIds: [m1EnrollmentId ?? fixtureUuid()] }),
  },
  { action: "m1:materials-manage", method: "DELETE", url: () => `/api/m1/materials/${fixtureUuid()}` }, // allowed: 404
  { action: "m1:delete", method: "DELETE", url: () => `/api/m1/classes/${fixtureUuid()}` }, // allowed: 404
  { action: "baptism:read", method: "GET", url: () => "/api/baptism/events" },
  {
    action: "baptism:write",
    method: "POST",
    url: () => "/api/baptism/registrations",
    body: () => ({ eventId: baptismEventId ?? fixtureUuid(), personId }),
    capture: (res) => {
      const id = (res.json() as { id?: string }).id;
      if (typeof id === "string") createdRegistrationIds.push(id);
    },
  },
  { action: "baptism:delete", method: "DELETE", url: () => `/api/baptism/events/${fixtureUuid()}` }, // allowed: 404
  { action: "metrics:read", method: "GET", url: () => "/api/metrics" },
  { action: "metrics:volunteers", method: "GET", url: () => "/api/metrics/volunteers" },
  { action: "templates:read", method: "GET", url: () => "/api/templates" },
  {
    action: "templates:write",
    method: "POST",
    url: () => "/api/templates",
    body: () => ({ name: `MIT ${randomBytes(3).toString("hex")}`, body: "matrix template text" }),
    capture: (res) => {
      const id = (res.json() as { id?: string }).id;
      if (typeof id === "string") createdTemplateIds.push(id);
    },
  },
  { action: "admin:users", method: "GET", url: () => "/api/admin/users" },
  { action: "erase-person", method: "DELETE", url: () => `/api/people/${fixtureUuid()}` }, // allowed: 404
];

const KNOWN_ROUTE_LESS: readonly Action[] = [
  "attendance:read",
  "attendance:tick",
  "people:read-notes",
  "counseling:read",
  "counseling:write",
  "followup:read",
  "admin:settings",
  "admin:audit",
  "admin:health",
  "import:run",
  "export-person",
];

test("actions without an HTTP step are consciously listed as route-less", () => {
  const stepsWithAction = new Set<string>(STEPS.map((s) => s.action));
  const routeLess = ACTIONS.filter((a) => !stepsWithAction.has(a)).sort();
  expect(routeLess).toEqual([...KNOWN_ROUTE_LESS].sort());
});

// ---------------------------------------------------------------------------
// Harness — serial fixture state, one process. Role order: destructive
// allowed-only-for-Admin steps deliberately run last.
// ---------------------------------------------------------------------------

let app: FastifyInstance;
let prisma: ApiPrisma;
const sessionOf = new Map<Role, { cookie: string; csrf: string }>();

const ROLES: ReadonlyArray<{ role: Role; email: string; remote: string }> = [
  { role: "Pastor", email: "pastor@church.test", remote: "10.9.0.11" },
  { role: "Follow-up Coordinator", email: "coordinator@church.test", remote: "10.9.0.22" },
  { role: "Info Desk", email: "desk@church.test", remote: "10.9.0.33" },
  { role: "Admin", email: "admin@church.test", remote: "10.9.0.44" },
];

async function loginAs(role: Role, email: string, password: string, remote: string): Promise<void> {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    remoteAddress: remote,
    headers: { origin: "http://localhost:5173", "content-type": "application/json" },
    payload: { email, password },
  });
  expect(res.statusCode, `login as ${role}`).toBe(200);
  const cookieValue = res.cookies.find((c) => c.name === "ch_sess")?.value ?? "";
  const csrf = res.cookies.find((c) => c.name === "ch_csrf")?.value ?? "";
  sessionOf.set(role, { cookie: `ch_sess=${cookieValue}; ch_csrf=${csrf}`, csrf });
}

beforeAll(async () => {
  const env = loadEnv();
  prisma = createPrisma(env);
  app = await buildServer({ env, prisma });

  // Throwaway passwords for the seeded fake accounts (this run only).
  const passwordOf = new Map<Role, string>();
  for (const { role, email } of ROLES) {
    const password = randomBytes(18).toString("base64url");
    await prisma.users.update({
      where: { email },
      data: {
        passwordHash: await hashPassword(password),
        failedLoginCount: 0,
        lockedUntil: null,
        active: true,
      },
    });
    passwordOf.set(role, password);
  }

  // Fake person fixture, assigned to the coordinator (row-scope prerequisite).
  const person = await prisma.people.create({
    data: {
      firstName: "Matrix",
      lastName: `F${randomBytes(3).toString("hex")}`,
      gender: "Male",
      phone: `+2507883${randomBytes(3).toString("hex")}${String(Date.now() % 100).padStart(2, "0")}`,
      location: "Kigali",
      category: "Visitor",
      followUpStatus: "NotStarted",
    },
  });
  personId = person.id;
  createdPersonIds.push(personId);

  coordinatorMemberId = (await prisma.teamMembers.findFirstOrThrow({ where: { role: "FollowUpCoordinator" } })).id;
  await prisma.people.update({
    where: { id: personId },
    data: { assignedTo: coordinatorMemberId, assignedBy: coordinatorMemberId },
  });

  const baptismEvent = await prisma.baptismEvents.create({
    data: { eventDate: new Date(Date.now() + 14 * 86_400_000), status: "Scheduled" },
  });
  baptismEventId = baptismEvent.id;

  for (const { role, email, remote } of ROLES) {
    await loginAs(role, email, passwordOf.get(role)!, remote);
  }

  // M1 class fixture via the API (session rows are auto-built by the service).
  // firstDate must be a real service day (Sunday), same rule as the smoke test.
  const now = new Date();
  const firstSunday = new Date(now);
  const daysUntilSunday = (7 - now.getDay()) % 7 || 7;
  firstSunday.setDate(now.getDate() + daysUntilSunday);
  const firstDate = firstSunday.toISOString().slice(0, 10);
  const admin = sessionOf.get("Admin")!;
  const created = await app.inject({
    method: "POST",
    url: "/api/m1/classes",
    headers: {
      origin: "http://localhost:5173",
      "content-type": "application/json",
      cookie: admin.cookie,
      "x-csrf-token": admin.csrf,
    },
    payload: { title: "Matrix M1", venue: "Hall", requiredDays: 2, startTime: "17:00", firstDate },
  });
  expect(created.statusCode, JSON.stringify(created.json())).toBe(201);
  m1ClassId = String((created.json() as { id: string }).id);
  const sessionsRes = await app.inject({
    method: "GET",
    url: `/api/m1/classes/${m1ClassId}/sessions`,
    headers: { origin: "http://localhost:5173", cookie: admin.cookie },
  });
  const items = (sessionsRes.json() as { items: Array<{ id: string }> }).items;
  const first = items[0];
  if (!first) throw new Error("M1 fixture class produced no sessions");
  m1SessionId = String(first.id);
});

afterAll(async () => {
  // Cleanup by data (fk order), never leaving fake rows behind.
  await prisma.contactLog.deleteMany({ where: { personId: { in: createdPersonIds } } });
  await prisma.m1Attendance.deleteMany({ where: { personId: { in: createdPersonIds } } });
  await prisma.m1Enrollments.deleteMany({ where: { personId: { in: createdPersonIds } } });
  if (m1ClassId) {
    await prisma.m1Classes.deleteMany({ where: { id: m1ClassId } });
  }
  await prisma.attendance.deleteMany({ where: { personId: { in: createdPersonIds } } });
  await prisma.baptismRegistrations.deleteMany({ where: { id: { in: createdRegistrationIds } } });
  if (baptismEventId) {
    await prisma.baptismEvents.deleteMany({ where: { id: baptismEventId } });
  }
  await prisma.messageTemplates.deleteMany({ where: { id: { in: createdTemplateIds } } });
  await prisma.people.deleteMany({ where: { id: { in: createdPersonIds } } });
  await prisma.auditLog.deleteMany({ where: { entity: "route" } });
  await app.close();
  await prisma.$disconnect();
});

test("every role x every exposed action obeys the matrix over HTTP", async () => {
  for (const { role } of ROLES) {
    const session = sessionOf.get(role)!;
    for (const step of STEPS) {
      const allowed = EXPECTED[role].includes(step.action);
      const headers: Record<string, string> = { origin: "http://localhost:5173", cookie: session.cookie };
      if (step.method !== "GET") {
        headers["x-csrf-token"] = session.csrf;
        headers["content-type"] = "application/json";
      }
      const injectOptions: InjectOptions = {
        method: step.method,
        url: step.url(),
        headers,
      };
      if (step.body) injectOptions.payload = JSON.stringify(step.body());
      const res = await app.inject(injectOptions);
      const label = `${step.action} as ${role}`;
      if (!allowed) {
        expect(res.statusCode, `${label} must be exactly 403`).toBe(403);
      } else {
        expect(res.statusCode < 500, `${label} must not be a server error (got ${res.statusCode})`).toBe(true);
        expect([401, 403]).not.toContain(res.statusCode);
        step.capture?.(res);
      }
    }
  }
  // Sanity: allowed roles really exercised the fixtures, not a 403 wall.
  expect(createdPersonIds.length).toBeGreaterThanOrEqual(1);
  expect(m1EnrollmentId, "m1 enrollment fixture captured").toBeTruthy();
});

