// M1 core routes (docs/09 feature order #9, docs/06 + 06b): classes, sessions,
// enrolments, attendance ticks, close-day, certificates, waiting list.
// Gates follow the old RLS + the docs/09 matrix:
// - reads: m1:read (all roles)
// - class/session manage (create, edit, archive, delete): Admin (old
//   m1_classes_admin / m1_sessions_admin policies)
// - enrol: m1:enroll; ticks: m1:tick (closed day: Admin only, like the old
//   m1_attendance policy); close day: class leaders (Admin + Coordinator);
// - certificates: m1:certificates (Admin in the docs/09 matrix).
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Prisma } from "../../src/generated/prisma/client.js";
import { rm } from "node:fs/promises";
import path from "node:path";
import { audit } from "../audit.js";
import { currentMember, day } from "../lib/route-helpers.js";
import { humanize } from "../lib/enums.js";

type DB = import("../db.js").ApiPrisma;

const idParam = z.uuid();
const attendanceMarkSchema = z.enum(["Present", "Absent", "Excused"]);

function timeLabel(value: Date | string | null): string | null {
  if (value === null) return null;
  if (typeof value === "string") return value.slice(0, 5);
  return value.toISOString().slice(11, 16);
}

function serializePerson(row: {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  location: string | null;
  addressDetails: string | null;
  gender: string;
  ageGroup: string | null;
  contactPreference: string | null;
  category: string;
  m1Status: string | null;
  baptismStatus: string | null;
  needsM1: boolean;
  needsBaptism: boolean;
  needsPastor: boolean;
}) {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    phone: row.phone,
    email: row.email,
    location: row.location,
    addressDetails: row.addressDetails,
    gender: humanize("Gender", row.gender) ?? "",
    ageGroup: humanize("AgeGroup", row.ageGroup),
    contactPreference: humanize("ContactPreference", row.contactPreference),
    category: humanize("Category", row.category) ?? "",
    m1Status: humanize("M1Status", row.m1Status),
    baptismStatus: humanize("BaptismStatus", row.baptismStatus),
    needsM1: row.needsM1,
    needsBaptism: row.needsBaptism,
    needsPastor: row.needsPastor,
  };
}

const PERSON_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  phone: true,
  email: true,
  location: true,
  addressDetails: true,
  gender: true,
  ageGroup: true,
  contactPreference: true,
  category: true,
  m1Status: true,
  baptismStatus: true,
  needsM1: true,
  needsBaptism: true,
  needsPastor: true,
} as const satisfies Prisma.PeopleSelect;

/** Best-effort removal of the class's material files (volume, not web root). */
async function removeClassFiles(uploadDir: string, classId: string): Promise<void> {
  await rm(path.join(uploadDir, "m1-materials", classId), { recursive: true, force: true }).catch(() => {});
}

/** The class must exist; 404 otherwise. */
async function findClass(prisma: DB, id: string) {
  return prisma.m1Classes.findUnique({ where: { id } });
}

export async function registerM1Routes(app: FastifyInstance): Promise<void> {
  // ---- Classes list ----------------------------------------------------------
  app.get("/api/m1/classes", { config: { access: "auth", action: "m1:read" } }, async (req) => {
    const rows = await req.prisma.m1Classes.findMany({
      orderBy: [{ status: "desc" }, { createdAt: "desc" }],
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        title: row.title,
        venue: row.venue,
        requiredDays: row.requiredDays,
        status: row.status,
        archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
        createdBy: row.createdBy,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  });

  // ---- Create class (+ its weekly sessions) ----------------------------------
  app.post("/api/m1/classes", { config: { access: "auth", action: "m1:delete" } }, async (req, reply) => {
    const parsed = z
      .object({
        title: z.string().min(1).max(120).transform((v) => v.trim()),
        venue: z.string().max(120).nullish().transform((v) => (v?.trim() ? v.trim() : null)),
        requiredDays: z.number().int().min(1).max(10),
        startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullish(),
        firstDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid class body" });
    }
    const input = parsed.data;
    const member = await currentMember(req.prisma, req.user!);
    const created = await req.prisma.m1Classes.create({
      data: {
        title: input.title || "M1 class",
        venue: input.venue,
        requiredDays: input.requiredDays,
        status: "Open",
        createdBy: member?.id ?? null,
      },
    });
    const first = new Date(`${input.firstDate}T00:00:00.000Z`);
    await req.prisma.m1Sessions.createMany({
      data: Array.from({ length: input.requiredDays }, (_, i) => ({
        classId: created.id,
        dayNumber: i + 1,
        sessionDate: new Date(first.getTime() + i * 7 * 24 * 60 * 60 * 1000),
        startTime: input.startTime
          ? new Date(`1970-01-01T${input.startTime}:00.000Z`)
          : null,
      })),
    });
    await audit(req.prisma, {
      userId: req.user!.id,
      action: "m1.class_create",
      entity: "m1_classes",
      entityId: created.id,
      message: "class created",
    });
    return reply.code(201).send({ id: created.id });
  });

  // ---- Edit class (+ session dates/times) -------------------------------------
  app.patch<{ Params: { id: string } }>(
    "/api/m1/classes/:id",
    { config: { access: "auth", action: "m1:delete" } },
    async (req, reply) => {
      const param = idParam.safeParse(req.params.id);
      if (!param.success) {
        return reply.code(400).send({ error: "invalid class id" });
      }
      const parsed = z
        .object({
          title: z.string().min(1).max(120).transform((v) => v.trim()).optional(),
          venue: z.string().max(120).nullish().optional(),
          status: z.enum(["Open", "Closed"]).optional(),
          archived: z.boolean().optional(),
          sessions: z
            .array(
              z.object({
                id: z.uuid(),
                sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
                startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullish(),
              }),
            )
            .max(10)
            .optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid class body" });
      }
      const input = parsed.data;
      const klass = await findClass(req.prisma, param.data);
      if (!klass) {
        return reply.code(404).send({ error: "not found" });
      }
      const data: Prisma.M1ClassesUpdateInput = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.venue !== undefined) data.venue = input.venue?.trim() ? input.venue.trim() : null;
      if (input.status !== undefined) data.status = input.status;
      if (input.archived !== undefined) data.archivedAt = input.archived ? new Date() : null;
      const updated = await req.prisma.m1Classes.update({ where: { id: klass.id }, data });
      if (input.sessions) {
        await req.prisma.$transaction(
          input.sessions.map((s) =>
            req.prisma.m1Sessions.update({
              where: { id: s.id },
              data: {
                sessionDate: new Date(`${s.sessionDate}T00:00:00.000Z`),
                startTime: s.startTime ? new Date(`1970-01-01T${s.startTime}:00.000Z`) : null,
              },
            }),
          ),
        );
      }
      await audit(req.prisma, {
        userId: req.user!.id,
        action: "m1.class_update",
        entity: "m1_classes",
        entityId: klass.id,
        message: "class updated",
      });
      return {
        id: updated.id,
        title: updated.title,
        venue: updated.venue,
        requiredDays: updated.requiredDays,
        status: updated.status,
        archivedAt: updated.archivedAt ? updated.archivedAt.toISOString() : null,
      };
    },
  );

  // ---- Delete class (port of public.delete_m1_class; people never deleted) ----
  app.delete<{ Params: { id: string } }>(
    "/api/m1/classes/:id",
    { config: { access: "auth", action: "m1:delete" } },
    async (req, reply) => {
      const param = idParam.safeParse(req.params.id);
      if (!param.success) {
        return reply.code(400).send({ error: "invalid class id" });
      }
      const klass = await findClass(req.prisma, param.data);
      if (!klass) {
        return reply.code(404).send({ error: "not found" });
      }
      const sessionIds = (
        await req.prisma.m1Sessions.findMany({ where: { classId: klass.id }, select: { id: true } })
      ).map((s) => s.id);
      const personIds = (
        await req.prisma.m1Enrollments.findMany({
          where: { classId: klass.id },
          select: { personId: true },
          distinct: ["personId"],
        })
      ).map((r) => r.personId);

      await req.prisma.$transaction([
        req.prisma.m1AbsenceReplies.deleteMany({ where: { sessionId: { in: sessionIds } } }),
        req.prisma.m1ReplyLinks.deleteMany({ where: { sessionId: { in: sessionIds } } }),
        req.prisma.m1Attendance.deleteMany({ where: { sessionId: { in: sessionIds } } }),
        req.prisma.m1MessageLog.deleteMany({ where: { classId: klass.id } }),
        req.prisma.m1Materials.deleteMany({ where: { classId: klass.id } }),
        req.prisma.m1Enrollments.deleteMany({ where: { classId: klass.id } }),
        req.prisma.m1Sessions.deleteMany({ where: { classId: klass.id } }),
        req.prisma.m1Classes.delete({ where: { id: klass.id } }),
        // People who were enrolled but never finished return to "Needs M1"
        // (NULL m1_status counts as unfinished).
        req.prisma.people.updateMany({
          where: { id: { in: personIds }, OR: [{ m1Status: null }, { m1Status: { not: "Completed" } }] },
          data: { needsM1: true },
        }),
      ]);
      await removeClassFiles(req.env.UPLOAD_DIR, klass.id);
      await audit(req.prisma, {
        userId: req.user!.id,
        action: "m1.class_delete",
        entity: "m1_classes",
        entityId: klass.id,
        message: "class deleted",
      });
      return reply.code(204).send();
    },
  );

  // ---- Sessions of a class ----------------------------------------------------
  app.get<{ Params: { id: string } }>(
    "/api/m1/classes/:id/sessions",
    { config: { access: "auth", action: "m1:read" } },
    async (req, reply) => {
      const param = idParam.safeParse(req.params.id);
      if (!param.success) {
        return reply.code(400).send({ error: "invalid class id" });
      }
      const rows = await req.prisma.m1Sessions.findMany({
        where: { classId: param.data },
        orderBy: [{ dayNumber: "asc" }],
      });
      return {
        items: rows.map((row) => ({
          id: row.id,
          classId: row.classId,
          dayNumber: row.dayNumber,
          sessionDate: day(row.sessionDate),
          startTime: timeLabel(row.startTime),
          topic: row.topic,
          summary: row.summary,
          closed: row.closed,
        })),
      };
    },
  );

  // ---- Enrolments of a class --------------------------------------------------
  app.get<{ Params: { id: string } }>(
    "/api/m1/classes/:id/enrollments",
    { config: { access: "auth", action: "m1:read" } },
    async (req, reply) => {
      const param = idParam.safeParse(req.params.id);
      if (!param.success) {
        return reply.code(400).send({ error: "invalid class id" });
      }
      const rows = await req.prisma.m1Enrollments.findMany({
        where: { classId: param.data },
        orderBy: [{ enrolledAt: "asc" }],
        include: { person: { select: PERSON_SELECT } },
      });
      return {
        items: rows.map((row) => ({
          id: row.id,
          classId: row.classId,
          personId: row.personId,
          enrolledAt: row.enrolledAt.toISOString(),
          walkIn: row.walkIn,
          status: row.status,
          certificateNo: row.certificateNo,
          certificateIssuedAt: row.certificateIssuedAt ? row.certificateIssuedAt.toISOString() : null,
          certificateOverrideNote: row.certificateOverrideNote,
          person: serializePerson(row.person),
        })),
      };
    },
  );

  // ---- Enrol one person (AddSheet / NeedsM1Tab / walk-in) ----------------------
  app.post<{ Params: { id: string } }>(
    "/api/m1/classes/:id/enrollments",
    { config: { access: "auth", action: "m1:enroll" } },
    async (req, reply) => {
      const param = idParam.safeParse(req.params.id);
      if (!param.success) {
        return reply.code(400).send({ error: "invalid class id" });
      }
      const parsed = z
        .object({ personId: z.uuid(), walkIn: z.boolean().default(false) })
        .safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid enroll body" });
      }
      const klass = await findClass(req.prisma, param.data);
      if (!klass) {
        return reply.code(404).send({ error: "class not found" });
      }
      const person = await req.prisma.people.findUnique({
        where: { id: parsed.data.personId },
        select: { id: true },
      });
      if (!person) {
        return reply.code(404).send({ error: "person not found" });
      }
      const member = await currentMember(req.prisma, req.user!);
      const duplicate = await req.prisma.m1Enrollments.findFirst({
        where: { classId: klass.id, personId: person.id },
        select: { id: true },
      });
      if (duplicate) {
        return reply.code(409).send({ error: "already enrolled in this class" });
      }
      const [enrollment] = await req.prisma.$transaction([
        req.prisma.m1Enrollments.create({
          data: {
            classId: klass.id,
            personId: person.id,
            walkIn: parsed.data.walkIn,
            enrolledBy: member?.id ?? null,
          },
        }),
        // Enrolling clears the "needs M1" flag (same write the screens made).
        req.prisma.people.update({ where: { id: person.id }, data: { needsM1: false } }),
      ]);
      await audit(req.prisma, {
        userId: req.user!.id,
        action: "m1.enroll",
        entity: "m1_enrollments",
        entityId: enrollment.id,
        message: "person enrolled",
      });
      return reply.code(201).send({ id: enrollment.id });
    },
  );

  // ---- Attendance rows of a class (grouped per session on the client) ----------
  app.get<{ Params: { id: string } }>(
    "/api/m1/classes/:id/attendance",
    { config: { access: "auth", action: "m1:read" } },
    async (req, reply) => {
      const param = idParam.safeParse(req.params.id);
      if (!param.success) {
        return reply.code(400).send({ error: "invalid class id" });
      }
      const sessions = await req.prisma.m1Sessions.findMany({
        where: { classId: param.data },
        select: { id: true },
      });
      const rows = await req.prisma.m1Attendance.findMany({
        where: { sessionId: { in: sessions.map((s) => s.id) } },
        select: { id: true, sessionId: true, personId: true, status: true },
      });
      return { items: rows.map((row) => ({ ...row, status: row.status })) };
    },
  );

  // ---- Tick / clear one attendance mark ----------------------------------------
  app.patch<{ Params: { id: string } }>(
    "/api/m1/sessions/:id/attendance",
    { config: { access: "auth", action: "m1:tick" } },
    async (req, reply) => {
      const param = idParam.safeParse(req.params.id);
      if (!param.success) {
        return reply.code(400).send({ error: "invalid session id" });
      }
      const parsed = z
        .object({
          personId: z.uuid(),
          status: attendanceMarkSchema.nullish(), // null/undefined clears the mark
        })
        .safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid attendance body" });
      }
      const session = await req.prisma.m1Sessions.findUnique({
        where: { id: param.data },
        select: { id: true, closed: true },
      });
      if (!session) {
        return reply.code(404).send({ error: "session not found" });
      }
      const isAdmin = (req.roleName ?? "") === "Admin";
      // Old m1_attendance policy: staff may tick while the day is open;
      // Admin may always (make-ups).
      if (session.closed && !isAdmin) {
        return reply.code(403).send({ error: "day is closed" });
      }
      const member = await currentMember(req.prisma, req.user!);
      const status = parsed.data.status;
      if (status === null || status === undefined) {
        await req.prisma.m1Attendance.deleteMany({
          where: { sessionId: session.id, personId: parsed.data.personId },
        });
        return { cleared: true };
      }
      const saved = await req.prisma.m1Attendance.upsert({
        where: { sessionId_personId: { sessionId: session.id, personId: parsed.data.personId } },
        create: {
          sessionId: session.id,
          personId: parsed.data.personId,
          status,
          markedBy: member?.id ?? null,
        },
        update: { status },
        select: { id: true, status: true },
      });
      return { id: saved.id, status: saved.status };
    },
  );

  // ---- Close a day (port of public.close_m1_session) ---------------------------
  app.post<{ Params: { id: string } }>(
    "/api/m1/sessions/:id/close",
    { config: { access: "auth", action: "m1:tick" } },
    async (req, reply) => {
      const param = idParam.safeParse(req.params.id);
      if (!param.success) {
        return reply.code(400).send({ error: "invalid session id" });
      }
      // Old RPC gate: class leaders only (Admin, Pastor, Follow-up Coordinator);
      // the docs/09 matrix keeps Pastor read-only, so Admin + Coordinator.
      const role = req.roleName ?? "";
      if (role !== "Admin" && role !== "Follow-up Coordinator") {
        return reply.code(403).send({ error: "forbidden" });
      }
      const session = await req.prisma.m1Sessions.findUnique({
        where: { id: param.data },
        select: { id: true, classId: true, closed: true },
      });
      if (!session) {
        return reply.code(404).send({ error: "session not found" });
      }
      const klass = await findClass(req.prisma, session.classId);
      if (!klass) {
        return reply.code(404).send({ error: "class not found" });
      }
      const member = await currentMember(req.prisma, req.user!);
      const markedBy = member?.id ?? null;
      const enrolled = await req.prisma.m1Enrollments.findMany({
        where: { classId: klass.id, status: "Enrolled" },
        select: { personId: true },
      });
      await req.prisma.m1Sessions.update({ where: { id: session.id }, data: { closed: true } });
      // Everyone enrolled without a mark becomes Absent.
      const existing = await req.prisma.m1Attendance.findMany({
        where: { sessionId: session.id },
        select: { personId: true },
      });
      const marked = new Set(existing.map((row) => row.personId));
      const missing = enrolled.map((e) => e.personId).filter((id) => !marked.has(id));
      if (missing.length > 0) {
        await req.prisma.m1Attendance.createMany({
          data: missing.map((personId) => ({
            sessionId: session.id,
            personId,
            status: "Absent" as const,
            markedBy,
          })),
        });
      }
      // Enrolled people whose Present count clears required_days -> Completed.
      const presentCounts = await req.prisma.m1Attendance.groupBy({
        where: { session: { classId: klass.id }, status: "Present" },
        by: ["personId"],
        _count: { _all: true },
      });
      const eligible = presentCounts
        .filter((row) => row._count._all >= klass.requiredDays)
        .map((row) => row.personId);
      if (eligible.length > 0) {
        await req.prisma.m1Enrollments.updateMany({
          where: { classId: klass.id, status: "Enrolled", personId: { in: eligible } },
          data: { status: "Completed" },
        });
        await req.prisma.people.updateMany({
          where: { id: { in: eligible } },
          data: { m1Status: "Completed", needsM1: false },
        });
      }
      await audit(req.prisma, {
        userId: req.user!.id,
        action: "m1.session_close",
        entity: "m1_sessions",
        entityId: session.id,
        message: "session closed",
      });
      return { closed: true, markedAbsent: missing.length };
    },
  );

  // ---- Issue certificates (port of public.issue_m1_certificates) ---------------
  app.post("/api/m1/certificates", { config: { access: "auth", action: "m1:certificates" } }, async (req, reply) => {
    const parsed = z
      .object({ enrollmentIds: z.array(z.uuid()).min(1).max(100) })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid certificates body" });
    }
    const ids = parsed.data.enrollmentIds;
    const rows = await req.prisma.m1Enrollments.findMany({
      where: { id: { in: ids }, certificateIssuedAt: null },
      include: { class: { select: { requiredDays: true } } },
    });
    const presentCounts = await req.prisma.m1Attendance.groupBy({
      where: { status: "Present", session: { classId: { in: rows.map((r) => r.classId) } } },
      by: ["personId", "sessionId"],
      _count: { _all: true },
    });
    // Count Present days per person only within their own class sessions.
    const classSessions = await req.prisma.m1Sessions.findMany({
      where: { classId: { in: rows.map((r) => r.classId) } },
      select: { id: true, classId: true },
    });
    const sessionToClass = new Map(classSessions.map((s) => [s.id, s.classId]));
    const presentByPersonClass = new Map<string, number>();
    for (const row of presentCounts) {
      const classId = sessionToClass.get(row.sessionId);
      if (!classId) continue;
      const key = `${classId}:${row.personId}`;
      presentByPersonClass.set(key, (presentByPersonClass.get(key) ?? 0) + row._count._all);
    }
    const year = new Date().toISOString().slice(0, 4);
    const issuedIds: string[] = [];
    const issuedPeople: string[] = [];
    for (const row of rows) {
      const present = presentByPersonClass.get(`${row.classId}:${row.personId}`) ?? 0;
      const eligible = present >= row.class.requiredDays || row.certificateOverrideNote !== null;
      if (!eligible) continue;
      const seq = await req.prisma.$queryRaw<Array<{ n: bigint }>>`
        select nextval('public.m1_certificate_seq')::text as n`;
      const number = seq[0]?.n.toString() ?? "0";
      await req.prisma.m1Enrollments.update({
        where: { id: row.id },
        data: {
          certificateNo: `M1-${year}-${number.padStart(4, "0")}`,
          certificateIssuedAt: new Date(),
          status: "Completed",
        },
      });
      issuedIds.push(row.id);
      issuedPeople.push(row.personId);
    }
    if (issuedPeople.length > 0) {
      await req.prisma.people.updateMany({
        where: { id: { in: issuedPeople } },
        data: { m1Status: "Completed", needsM1: false },
      });
    }
    await audit(req.prisma, {
      userId: req.user!.id,
      action: "m1.certificates_issue",
      entity: "m1_enrollments",
      entityId: null,
      message: "certificates issued",
    });
    return { issued: issuedIds.length };
  });

  // ---- Waiting list (port of public.m1_waiting_list) ----------------------------
  app.get("/api/m1/waiting-list", { config: { access: "auth", action: "m1:read" } }, async (req) => {
    const enrolledInOpen = await req.prisma.m1Enrollments.findMany({
      where: { status: "Enrolled", class: { status: "Open", archivedAt: null } },
      select: { personId: true },
    });
    const rows = await req.prisma.people.findMany({
      where: {
        needsM1: true,
        // "is distinct from 'Completed'": NULL m1_status still counts.
        OR: [{ m1Status: null }, { m1Status: { not: "Completed" } }],
        id: { notIn: enrolledInOpen.map((row) => row.personId) },
      },
      select: PERSON_SELECT,
      orderBy: [{ firstName: "asc" }],
    });
    return { items: rows.map(serializePerson) };
  });
}
