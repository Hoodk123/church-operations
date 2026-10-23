// Check-in routes (docs/09 feature order #3). Mirrors today's screens:
// - search: first/last name OR phone substring (`ilike %q%`), 20 rows
// - today: attendance rows for `current_date` (DB authority), newest first
// - check-in: insert {person_id, checked_in_by}; DB defaults fill service
//   date/name/time; the unique (person, date, service) constraint already
//   checked in -> 409, matching the 23505 handling in the old screens
// - undo: Admin any row; Info Desk only rows they created today
// - new visitor: Rwanda phone validation, last-9-digit duplicate prompt,
//   category by `giveToChrist`, then auto check-in
// - expected-today: the exact ported SQL of public.expected_today()
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { audit } from "../audit.js";
import { currentMember, isoDate } from "../lib/route-helpers.js";
import { normalizeRwandaPhone, phoneDigits } from "../lib/phone.js";
import { asAgeGroup, asCategory, asGender, humanize } from "../lib/enums.js";

const searchQuerySchema = z.object({ q: z.string().min(2).max(80) });

const checkinSchema = z.object({ personId: z.string().uuid() });

const newVisitorSchema = z.object({
  firstName: z.string().min(1).max(80).transform((v) => v.trim()),
  lastName: z.string().min(1).max(80).transform((v) => v.trim()),
  phone: z.string().max(30),
  gender: z.enum(["Male", "Female"]),
  ageGroup: z.enum(["Child", "Youth", "Adult", "Elderly"]).nullish(),
  location: z.string().max(200).nullish().transform((v) => (v?.trim() ? v.trim() : null)),
  howFoundChurch: z.string().max(200).nullish().transform((v) => (v?.trim() ? v.trim() : null)),
  giveToChrist: z.boolean().default(false),
});

type DB = import("../db.js").ApiPrisma;

/** `current_date` from the database itself (the row default uses the same clock). */
async function dbToday(prisma: DB): Promise<Date> {
  const rows = await prisma.$queryRaw<Array<{ t: Date }>>`SELECT current_date::timestamptz AS t`;
  const first = rows[0];
  if (!first) throw new Error("internal: cannot read current_date");
  return new Date(first.t);
}

async function attendanceFor(prisma: DB, personIds: string[], serviceDate: Date) {
  if (personIds.length === 0) return new Map<string, Date>();
  const rows = await prisma.attendance.findMany({
    where: { serviceDate, personId: { in: personIds } },
    select: { personId: true, checkedInAt: true },
  });
  return new Map(rows.map((row) => [row.personId, row.checkedInAt]));
}

export async function registerCheckInRoutes(app: FastifyInstance): Promise<void> {
  // ---- Search people -------------------------------------------------------
  app.get("/api/checkin/search", { config: { access: "auth", action: "checkin:read" } }, async (req, reply) => {
    const query = searchQuerySchema.safeParse(Object.fromEntries(new URL(req.url, "http://localhost").searchParams));
    if (!query.success) {
      return { items: [] };
    }
    const q = query.data.q.replace(/[%()]/g, " ");
    const pattern = `%${q}%`;
    const rows = await req.prisma.people.findMany({
      where: {
        OR: [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
          { phone: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true, firstName: true, lastName: true, phone: true, category: true, location: true },
      orderBy: [{ firstName: "asc" }],
      take: 20,
    });
    const today = await dbToday(req.prisma);
    const checked = await attendanceFor(req.prisma, rows.map((r) => r.id), today);
    return {
      items: rows.map((row) => ({
        id: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
        phone: row.phone,
        category: humanize("Category", row.category) ?? "",
        location: row.location,
        checkedInAt: checked.get(row.id) ? isoDate(checked.get(row.id)!) : null,
      })),
    };
  });

  // ---- Today's attendance list ---------------------------------------------
  app.get("/api/checkin/today", { config: { access: "auth", action: "checkin:read" } }, async (req) => {
    const today = await dbToday(req.prisma);
    const rows = await req.prisma.attendance.findMany({
      where: { serviceDate: today },
      orderBy: [{ checkedInAt: "desc" }],
      take: 100,
      include: { person: { select: { id: true, firstName: true, lastName: true, category: true } } },
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        checkedInAt: isoDate(row.checkedInAt),
        checkedInBy: row.checkedInBy,
        person: {
          id: row.person.id,
          firstName: row.person.firstName,
          lastName: row.person.lastName,
          category: humanize("Category", row.person.category) ?? "",
        },
      })),
    };
  });

  // ---- Check in --------------------------------------------------------------
  app.post("/api/checkin", { config: { access: "auth", action: "checkin:create" } }, async (req, reply) => {
    const parsed = checkinSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid check-in body" });
    }
    const member = await currentMember(req.prisma, req.user!);
    if (!member) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const person = await req.prisma.people.findUnique({
      where: { id: parsed.data.personId },
      select: { id: true, firstName: true, lastName: true, category: true },
    });
    if (!person) {
      return reply.code(404).send({ error: "not found" });
    }
    try {
      const created = await req.prisma.attendance.create({
        data: { personId: person.id, checkedInBy: member.id },
        include: { person: { select: { id: true, firstName: true, lastName: true, category: true } } },
      });
      await audit(req.prisma, {
        userId: req.user!.id,
        action: "checkin.create",
        entity: "attendance",
        entityId: created.id,
        message: "person checked in",
      });
      return reply.code(201).send({
        id: created.id,
        checkedInAt: isoDate(created.checkedInAt),
        person: {
          id: created.person.id,
          firstName: created.person.firstName,
          lastName: created.person.lastName,
          category: humanize("Category", created.person.category) ?? "",
        },
      });
    } catch {
      // unique(person_id, service_date, service_name) violated
      return reply.code(409).send({ error: "already checked in" });
    }
  });

  // ---- Undo ---------------------------------------------------------------------
  app.delete("/api/checkin/:id", { config: { access: "auth", action: "checkin:undo" } }, async (req, reply) => {
    const id = z.string().uuid().safeParse((req.params as Record<string, string>).id);
    if (!id.success) {
      return reply.code(400).send({ error: "invalid attendance id" });
    }
    const row = await req.prisma.attendance.findUnique({ where: { id: id.data }, select: { id: true, checkedInBy: true, serviceDate: true } });
    if (!row) {
      return reply.code(404).send({ error: "not found" });
    }
    // Row scope: Admin deletes anything; Info Desk only their own rows of today.
    if (req.roleName === "Info Desk") {
      const member = await currentMember(req.prisma, req.user!);
      const today = await dbToday(req.prisma);
      const ownToday =
        member !== null && row.checkedInBy === member.id && row.serviceDate.getTime() === today.getTime();
      if (!ownToday) {
        return reply.code(403).send({ error: "forbidden" });
      }
    }
    await req.prisma.attendance.delete({ where: { id: row.id } });
    await audit(req.prisma, {
      userId: req.user!.id,
      action: "checkin.undo",
      entity: "attendance",
      entityId: row.id,
      message: "check-in undone",
    });
    return reply.code(204).send();
  });

  // ---- New visitor -----------------------------------------------------------
  app.post("/api/checkin/new-visitor", { config: { access: "auth", action: "checkin:create" } }, async (req, reply) => {
    const parsed = newVisitorSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid visitor body" });
    }
    const input = parsed.data;
    const phone = normalizeRwandaPhone(input.phone);
    if (!phone) {
      return reply.code(400).send({ error: "invalid phone number" });
    }
    const member = await currentMember(req.prisma, req.user!);
    if (!member) {
      return reply.code(403).send({ error: "forbidden" });
    }
    // Duplicate prompt (same rule as the old screen: last 9 digits match).
    const digits = phoneDigits(phone);
    const tail = digits.slice(-9);
    const candidatesRows = await req.prisma.people.findMany({
      where: { phone: { contains: tail } },
      select: { id: true, firstName: true, lastName: true, phone: true },
      take: 5,
    });
    const candidates = candidatesRows
      .filter((c) => phoneDigits(c.phone).endsWith(tail))
      .map((c) => ({ id: c.id, firstName: c.firstName, lastName: c.lastName, phone: c.phone }));
    if (candidates.length > 0) {
      return reply.code(409).send({ error: "similar visitor exists", candidates });
    }
    const genderValue = asGender(input.gender) as import("../../src/generated/prisma/client.js").Gender;
    const visitorData = {
      firstName: input.firstName,
      lastName: input.lastName,
      phone,
      gender: genderValue,
      location: input.location,
      howFoundChurch: input.howFoundChurch,
      category: asCategory(input.giveToChrist ? "New Convert" : "Visitor") as import("../../src/generated/prisma/client.js").Category,
      needsPastor: input.giveToChrist,
      registeredBy: member.id,
    };
    if (input.ageGroup) {
      (visitorData as Record<string, unknown>).ageGroup = asAgeGroup(input.ageGroup);
    }
    const created = await req.prisma.people.create({
      data: visitorData as Parameters<typeof req.prisma.people.create>[0]["data"],
      select: { id: true, firstName: true, lastName: true, category: true },
    });
    const today = await dbToday(req.prisma);
    try {
      const attendance = await req.prisma.attendance.create({
        data: { personId: created.id, checkedInBy: member.id },
        select: { id: true, checkedInAt: true },
      });
      await audit(req.prisma, {
        userId: req.user!.id,
        action: "checkin.new_visitor",
        entity: "people",
        entityId: created.id,
        message: input.giveToChrist ? "new convert registered and checked in" : "new visitor registered and checked in",
      });
      return reply.code(201).send({
        person: { id: created.id, firstName: created.firstName, lastName: created.lastName, category: humanize("Category", created.category) ?? "" },
        attendanceId: attendance.id,
        checkedInAt: isoDate(attendance.checkedInAt),
        isDuplicate: false,
      });
    } catch {
      return reply.code(409).send({ error: "already checked in" });
    }
  });

  // ---- Expected today (ported from public.expected_today()) -------------------
  app.get("/api/checkin/expected-today", { config: { access: "auth", action: "checkin:read" } }, async (req) => {
    const today = await dbToday(req.prisma);
    const latest = await req.prisma.attendance.aggregate({
      where: { serviceDate: { lt: today } },
      _max: { serviceDate: true },
    });
    const lastDate = latest._max.serviceDate;
    if (!lastDate) {
      return { items: [] };
    }
    const attendedRows = await req.prisma.attendance.findMany({
      where: { serviceDate: lastDate },
      select: { personId: true },
      distinct: ["personId"],
    });
    const attended = attendedRows.map((row) => row.personId);
    if (attended.length === 0) return { items: [] };
    const todayRows = await req.prisma.attendance.findMany({
      where: { serviceDate: today, personId: { in: attended } },
      select: { personId: true },
    });
    const alreadyHere = new Set(todayRows.map((row) => row.personId));
    const expected = attended.filter((id) => !alreadyHere.has(id));
    const rows = await req.prisma.people.findMany({
      where: { id: { in: expected } },
      select: { id: true, firstName: true, lastName: true, category: true, location: true },
      orderBy: [{ firstName: "asc" }],
      take: 100,
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
        category: humanize("Category", row.category) ?? "",
        location: row.location,
      })),
    };
  });
}
