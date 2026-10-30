// Public welcome-form tests (docs/08 1.5, work order D): validation shapes,
// honeypot, per-phone window, returning-visitor shortcut. Fake phones/people
// only. Run: npm test
import "dotenv/config";
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, test } from "vitest";
import type { FastifyInstance, InjectOptions } from "fastify";
import { normalizeRwandaPhone } from "../lib/phone.js";
import { buildServer } from "../server.js";
import { createPrisma, type ApiPrisma } from "../db.js";
import { loadEnv } from "../env.js";

let app: FastifyInstance;
let prisma: ApiPrisma;
const phones: string[] = [];

function freshPhone(): string {
  // Rwandan mobile, unique per run; normalized through the same helper the
  // route uses so DB comparisons match what is stored (+250 formatted).
  const raw = `+250788${String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0")}`;
  const phone = normalizeRwandaPhone(raw);
  if (!phone) throw new Error("test fixture produced an unparseable phone");
  phones.push(phone);
  return phone;
}

function validBody(phone: string): Record<string, unknown> {
  return {
    fullName: "Welcome Test Person",
    phone,
    location: "Kigali",
    preferredContact: "whatsapp",
    firstTime: true,
    familyStatus: "alone",
    wantsFamilyRegistration: false,
    classReadiness: "ready",
    classTypes: ["m1_membership"],
    feedback: "test feedback",
    consent: true,
    qrSource: "door",
  };
}

async function postWelcome(body: unknown, remote: string) {
  const options: InjectOptions = {
    method: "POST",
    url: "/api/public/welcome",
    remoteAddress: remote,
    headers: { origin: "http://localhost:5173", "content-type": "application/json" },
  };
  if (body !== undefined) options.payload = JSON.stringify(body);
  return app.inject(options);
}

beforeAll(async () => {
  const env = loadEnv();
  prisma = createPrisma(env);
  app = await buildServer({ env, prisma });
});

afterAll(async () => {
  await prisma.welcomeSubmissions.deleteMany({ where: { phone: { in: phones } } });
  await prisma.people.deleteMany({ where: { phone: { in: phones } } });
  await prisma.attendance.deleteMany({ where: { person: { phone: { in: phones } } } });
  await app.close();
  await prisma.$disconnect();
});

test("valid submission stores exactly the allowed fields and returns a bare first name", async () => {
  const phone = freshPhone();
  const res = await postWelcome(validBody(phone), "10.8.0.1");
  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ ok: true, firstName: "Welcome" });

  const submission = await prisma.welcomeSubmissions.findFirst({ where: { phone } });
  expect(submission?.consent).toBe(true);
  expect(submission?.status).toBe("new");
  expect(submission?.classReadiness).toBe("ready");
  await expect(prisma.welcomeClassInterest.findMany({
    where: { submissionId: submission?.id ?? randomUUID() },
  })).resolves.toHaveLength(1);
  const person = await prisma.people.findFirst({ where: { phone } });
  expect(person?.category).toBe("Visitor");
  expect(person?.source).toBe("welcome_form");
  expect(person?.needsM1).toBe(true);
});

test("invalid consent and bad shapes return the constant {ok:false,reason:'invalid'}", async () => {
  const res = await postWelcome({ ...validBody(freshPhone()), consent: false }, "10.8.0.2");
  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ ok: false, reason: "invalid" });
  const res2 = await postWelcome({ fullName: "A", phone: "x", location: "y", consent: true }, "10.8.0.3");
  expect(res2.json()).toEqual({ ok: false, reason: "invalid" });
});

test("honeypot gets a fake success and writes nothing", async () => {
  const phone = freshPhone();
  const res = await postWelcome({ ...validBody(phone), website: "http://spam.example" }, "10.8.0.4");
  expect(res.json()).toEqual({ ok: true, firstName: "" });
  await expect(prisma.welcomeSubmissions.findFirst({ where: { phone } })).resolves.toBeNull();
});

test("the same phone within 10 minutes gets slow_down", async () => {
  const phone = freshPhone();
  const first = await postWelcome(validBody(phone), "10.8.0.5");
  expect(first.json().ok).toBe(true);
  const second = await postWelcome(validBody(phone), "10.8.0.6"); // different IP, same phone
  expect(second.json()).toEqual({ ok: false, reason: "slow_down" });
});

test("returning visitor with a known phone records attendance and shows nothing", async () => {
  const phone = freshPhone();
  // Seed a fake person directly (the export/import flows are other tests).
  const person = await prisma.people.create({
    data: { firstName: "Welcome", lastName: "Returning Fixture", gender: "Male", phone, category: "Visitor", followUpStatus: "NotStarted" },
  });
  const returningOptions: InjectOptions = {
    method: "POST",
    url: "/api/public/welcome/returning",
    remoteAddress: "10.8.0.7",
    headers: { origin: "http://localhost:5173", "content-type": "application/json" },
  };
  returningOptions.payload = JSON.stringify({ phone });
  const res = await app.inject(returningOptions);
  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ ok: true });
  const attendance = await prisma.attendance.findFirst({ where: { personId: person.id } });
  expect(attendance).not.toBeNull();
  expect(attendance?.checkedInBy).toBeNull(); // self check-in, no staff member linked

  // Unknown number: same constant shape, no details.
  const missOptions: InjectOptions = {
    method: "POST",
    url: "/api/public/welcome/returning",
    remoteAddress: "10.8.0.8",
    headers: { origin: "http://localhost:5173", "content-type": "application/json" },
  };
  missOptions.payload = JSON.stringify({ phone: "+250788909999" });
  const miss = await app.inject(missOptions);
  expect(miss.json()).toEqual({ ok: false });
});
