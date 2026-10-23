// People routes (docs/09 feature order #2). Behavior mirrors today's screens:
// - list: newest-updated first, with assignee/registered-by names flattened in
// - detail drawer: person + last 50 contact log entries + latest M1 enrolment;
//   `notes` included only where the role matrix allows, and audited
// - create: server-side phone validation and registeredBy = the caller
// - edit / assign / mark-new-convert / delete per the role matrix
// The follow-up status transitions on contact-log inserts are database
// triggers (kept from Supabase); the API only inserts the log row.
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Prisma } from "../../src/generated/prisma/client.js";
import type { ApiPrisma } from "../db.js";
import { audit } from "../audit.js";
import { currentMember, isoDate, day, pageQuerySchema } from "../lib/route-helpers.js";
import { normalizeRwandaPhone } from "../lib/phone.js";
import { asAgeGroup, asBaptismStatus, asCategory, asContactMethod, asContactOutcome, asContactPreference, asFollowUpStatus, asGender, asM1Status, humanize } from "../lib/enums.js";
import {
  bulkAssignSchema,
  contactLogCreateSchema,
  personAssignSchema,
  personCreateSchema,
  personUpdateSchema,
  type PersonApi,
  type ContactLogApi,
  type PersonDetailApi,
} from "../schemas/people.js";

type PersonWithNames = Prisma.PeopleGetPayload<{ include: typeof PERSON_INCLUDE }>;
type ContactLogWithNames = Prisma.ContactLogGetPayload<{ include: typeof CONTACT_LOG_INCLUDE }>;

export const PERSON_INCLUDE = {
  assignee: { select: { fullName: true } },
  registeredByRef: { select: { fullName: true } },
} as const;

const CONTACT_LOG_INCLUDE = {
  contactedByRef: { select: { fullName: true } },
} as const;

export function serializePerson(row: PersonWithNames, includeNotes: boolean): PersonApi & { notes?: string | null } {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    gender: humanize("Gender", row.gender) ?? "Male",
    ageGroup: humanize("AgeGroup", row.ageGroup),
    phone: row.phone,
    location: row.location,
    category: humanize("Category", row.category) ?? "",

    m1Status: humanize("M1Status", row.m1Status),
    hbfGroup: row.hbfGroup,
    howFoundChurch: row.howFoundChurch,
    dateRegistered: day(row.dateRegistered),
    assignedTo: row.assignedTo,
    assignedToName: row.assignee?.fullName ?? null,
    assignedBy: row.assignedBy,
    assignedAt: row.assignedAt ? isoDate(row.assignedAt) : null,
    followUpStatus: humanize("FollowUpStatus", row.followUpStatus) ?? "",

    needsPastor: row.needsPastor,
    lastContactDate: row.lastContactDate ? day(row.lastContactDate) : null,
    baptismStatus: humanize("BaptismStatus", row.baptismStatus),
    contactPreference: humanize("ContactPreference", row.contactPreference),
    email: row.email,
    addressDetails: row.addressDetails,
    needsM1: row.needsM1,
    needsBaptism: row.needsBaptism,
    createdAt: isoDate(row.createdAt),
    updatedAt: isoDate(row.updatedAt),
    registeredBy: row.registeredBy,
    registeredByName: row.registeredByRef?.fullName ?? null,
    notes: includeNotes ? row.notes : undefined,
  };
}

function serializeContactLog(row: ContactLogWithNames): ContactLogApi {
  return {
    id: row.id,
    personId: row.personId,
    method: humanize("ContactMethod", row.method) ?? row.method,
    outcome: humanize("ContactOutcome", row.outcome) ?? row.outcome,
    note: row.note,
    finished: row.finished,
    contactedAt: isoDate(row.contactedAt),
    contactedByName: row.contactedByRef?.fullName ?? null,
  };
}

const personIdParam = z.uuid();

/** Whether the signed-in user may read this person's notes. */
function mayReadNotes(role: string, row: { assignedTo: string | null }, memberId: string | null): boolean {
  if (role === "Admin" || role === "Pastor") return true;
  if (role === "Follow-up Coordinator") return row.assignedTo !== null && row.assignedTo === memberId;
  return false; // Info Desk: no notes
}

/** Whether the signed-in user may WRITE this person's notes. */
function mayWriteNotes(role: string, row: { assignedTo: string | null }, memberId: string | null): boolean {
  if (role === "Admin") return true;
  if (role === "Follow-up Coordinator") return row.assignedTo !== null && row.assignedTo === memberId;
  return false;
}

async function listContactLogs(prisma: ApiPrisma, personId: string): Promise<ContactLogWithNames[]> {
  return prisma.contactLog.findMany({
    where: { personId },
    orderBy: [{ contactedAt: "desc" }],
    take: 50,
    include: CONTACT_LOG_INCLUDE,
  });
}

export async function registerPeopleRoutes(app: FastifyInstance): Promise<void> {
  // ---- List ---------------------------------------------------------------
  app.get<{ Reply: { items: Array<PersonApi & { notes?: string | null }>; total: number } | { error: string } }>(
    "/api/people",
    { config: { access: "auth", action: "people:read" } },
    async (req, reply) => {
      const query = pageQuerySchema.safeParse(Object.fromEntries(new URL(req.url, "http://localhost").searchParams));
      if (!query.success) {
        return reply.code(400).send({ error: "invalid pagination query" });
      }
      const { limit, offset } = query.data;
      const [rows, total] = await Promise.all([
        req.prisma.people.findMany({
          orderBy: [{ updatedAt: "desc" }],
          take: limit,
          skip: offset,
          include: PERSON_INCLUDE,
        }),
        req.prisma.people.count(),
      ]);
      // Info Desk never sees notes anywhere.
      const includeNotes = (req.user!.role as string) !== "Info Desk";
      const items = rows.map((row) => serializePerson(row, includeNotes));
      return { items, total };
    },
  );

  // ---- Recent activity (AppShell drawer) ------------------------------------
  app.get(
    "/api/people-recent",
    { config: { access: "auth", action: "people:read" } },
    async (req) => {
      const rows = await req.prisma.people.findMany({
        orderBy: [{ updatedAt: "desc" }],
        take: 15,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          category: true,
          createdAt: true,
          updatedAt: true,
          registeredByRef: { select: { fullName: true } },
        },
      });
      return {
        items: rows.map((row) => ({
          id: row.id,
          firstName: row.firstName,
          lastName: row.lastName,
    category: humanize("Category", row.category) ?? "",
          createdAt: isoDate(row.createdAt),
          updatedAt: isoDate(row.updatedAt),
          registeredByName: row.registeredByRef?.fullName ?? null,
        })),
      };
    },
  );

  // ---- Team members (assignee dropdown, registeredBy) ------------------------
  app.get(
    "/api/team-members",
    { config: { access: "auth", action: "people:read" } },
    async (req) => {
      const rows = await req.prisma.teamMembers.findMany({
        orderBy: [{ fullName: "asc" }],
        select: { id: true, fullName: true, role: true },
      });
      return { items: rows.map((row) => ({ ...row, role: humanize("UserRole", row.role) ?? row.role })) };
    },
  );

  // ---- Detail (drawer) -------------------------------------------------------
  app.get<{ Params: { id: string }; Reply: PersonDetailApi | { error: string } }>(
    "/api/people/:id",
    { config: { access: "auth", action: "people:read" } },
    async (req, reply) => {
      const param = personIdParam.safeParse(req.params.id);
      if (!param.success) {
        return reply.code(400).send({ error: "invalid person id" });
      }
      const row = await req.prisma.people.findUnique({
        where: { id: param.data },
        include: PERSON_INCLUDE,
      });
      if (!row) {
        return reply.code(404).send({ error: "not found" });
      }
      const member = await currentMember(req.prisma, req.user!);
      const includeNotes = mayReadNotes(req.roleName ?? "", row, member?.id ?? null);
      if (includeNotes && row.notes) {
        // Sensitive read: audit every time notes are actually delivered.
        await audit(req.prisma, {
          userId: req.user!.id,
          action: "people.read_notes",
          entity: "people",
          entityId: row.id,
          message: "person notes viewed",
        });
      }
      const logs = await listContactLogs(req.prisma, row.id);
      const latestEnrollment = await req.prisma.m1Enrollments.findFirst({
        where: { personId: row.id },
        orderBy: [{ enrolledAt: "desc" }],
        take: 1,
        include: { class: { select: { title: true } } },
      });
      const detail: PersonDetailApi = {
        person: serializePerson(row, includeNotes),
        contactLogs: logs.map(serializeContactLog),
        latestEnrollment: latestEnrollment
          ? {
              status: latestEnrollment.status,
              classTitle: latestEnrollment.class?.title ?? null,
              enrolledAt: isoDate(latestEnrollment.enrolledAt),
            }
          : null,
      };
      return detail;
    },
  );

  // ---- Create ----------------------------------------------------------------
  app.post(
    "/api/people",
    { config: { access: "auth", action: "people:create" } },
    async (req, reply) => {
      const parsed = personCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid person body" });
      }
      const input = parsed.data;
      const phone = normalizeRwandaPhone(input.phone);
      if (!phone) {
        return reply.code(400).send({ error: "invalid phone number" });
      }
      const member = await currentMember(req.prisma, req.user!);
      const duplicate = await req.prisma.people.findFirst({
        where: { phone },
        select: { id: true },
      });
      if (duplicate) {
        return reply.code(409).send({ error: "phone already registered" });
      }
      const created = await req.prisma.people.create({
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          gender: asGender(input.gender),
          ageGroup: input.ageGroup ? asAgeGroup(input.ageGroup) : null,
          phone,
          location: input.location ?? null,
          hbfGroup: input.hbfGroup ?? null,
          category: asCategory(input.category),
          m1Status: input.m1Status ? asM1Status(input.m1Status) : null,
          baptismStatus: input.baptismStatus ? asBaptismStatus(input.baptismStatus) : null,
          followUpStatus: asFollowUpStatus(input.followUpStatus),
          contactPreference: input.contactPreference ? asContactPreference(input.contactPreference) : null,
          email: input.email ?? null,
          addressDetails: input.addressDetails ?? null,
          howFoundChurch: input.howFoundChurch ?? null,
          assignedTo: input.assignedTo ?? null,
          needsPastor: input.needsPastor,
          needsM1: input.needsM1,
          needsBaptism: input.needsBaptism,
          notes: input.notes ?? null,
          registeredBy: member?.id ?? null,
        },
        include: PERSON_INCLUDE,
      });
      await audit(req.prisma, {
        userId: req.user!.id,
        action: "people.create",
        entity: "people",
        entityId: created.id,
        message: "person created",
      });
      return reply.code(201).send(serializePerson(created, false));
    },
  );

  // ---- Edit ------------------------------------------------------------------
  app.patch<{ Params: { id: string } }>(
    "/api/people/:id",
    { config: { access: "auth", action: "people:edit" } },
    async (req, reply) => {
      const param = personIdParam.safeParse(req.params.id);
      if (!param.success) {
        return reply.code(400).send({ error: "invalid person id" });
      }
      const parsed = personUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid person body" });
      }
      const input = parsed.data;
      const row = await req.prisma.people.findUnique({ where: { id: param.data } });
      if (!row) {
        return reply.code(404).send({ error: "not found" });
      }
      const member = await currentMember(req.prisma, req.user!);
      if (input.notes !== undefined && !mayWriteNotes(req.roleName ?? "", row, member?.id ?? null)) {
        return reply.code(403).send({ error: "forbidden" });
      }

      const data: Prisma.PeopleUpdateInput = {};
      if (input.firstName !== undefined) data.firstName = input.firstName;
      if (input.lastName !== undefined) data.lastName = input.lastName;
      if (input.gender !== undefined) data.gender = asGender(input.gender);
      if (input.ageGroup !== undefined) data.ageGroup = input.ageGroup ? asAgeGroup(input.ageGroup) : null;
      if (input.location !== undefined) data.location = input.location ?? null;
      if (input.hbfGroup !== undefined) data.hbfGroup = input.hbfGroup ?? null;
      if (input.category !== undefined) data.category = asCategory(input.category);
      if (input.m1Status !== undefined) data.m1Status = input.m1Status ? asM1Status(input.m1Status) : null;
      if (input.baptismStatus !== undefined) data.baptismStatus = input.baptismStatus ? asBaptismStatus(input.baptismStatus) : null;
      if (input.followUpStatus !== undefined) data.followUpStatus = asFollowUpStatus(input.followUpStatus);
      if (input.contactPreference !== undefined) data.contactPreference = input.contactPreference ? asContactPreference(input.contactPreference) : null;
      if (input.email !== undefined) data.email = input.email ?? null;
      if (input.addressDetails !== undefined) data.addressDetails = input.addressDetails ?? null;
      if (input.howFoundChurch !== undefined) data.howFoundChurch = input.howFoundChurch ?? null;
      if (input.needsPastor !== undefined) data.needsPastor = input.needsPastor;
      if (input.needsM1 !== undefined) data.needsM1 = input.needsM1;
      if (input.needsBaptism !== undefined) data.needsBaptism = input.needsBaptism;
      if (input.notes !== undefined) data.notes = input.notes ?? null;
      if (input.phone !== undefined) {
        const phone = normalizeRwandaPhone(input.phone);
        if (!phone) {
          return reply.code(400).send({ error: "invalid phone number" });
        }
        if (phone !== row.phone) {
          const duplicate = await req.prisma.people.findFirst({ where: { phone }, select: { id: true } });
          if (duplicate && duplicate.id !== row.id) {
            return reply.code(409).send({ error: "phone already registered" });
          }
        }
        data.phone = phone;
      }

      const updated = await req.prisma.people.update({
        where: { id: row.id },
        data,
        include: PERSON_INCLUDE,
      });
      await audit(req.prisma, {
        userId: req.user!.id,
        action: "people.edit",
        entity: "people",
        entityId: row.id,
        message: "person edited",
      });
      const includeNotes = mayReadNotes(req.roleName ?? "", updated, member?.id ?? null);
      return serializePerson(updated, includeNotes);
    },
  );

  // ---- Assign (its own action, matrix: Admin + Follow-up Coordinator) --------
  app.patch<{ Params: { id: string } }>(
    "/api/people/:id/assign",
    { config: { access: "auth", action: "people:assign" } },
    async (req, reply) => {
      const param = personIdParam.safeParse(req.params.id);
      if (!param.success) {
        return reply.code(400).send({ error: "invalid person id" });
      }
      const parsed = personAssignSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid assign body" });
      }
      const assignedTo = parsed.data.assignedTo;
      const row = await req.prisma.people.findUnique({ where: { id: param.data }, select: { id: true, assignedTo: true } });
      if (!row) {
        return reply.code(404).send({ error: "not found" });
      }
      if (assignedTo) {
        const target = await req.prisma.teamMembers.findUnique({ where: { id: assignedTo }, select: { id: true } });
        if (!target) {
          return reply.code(400).send({ error: "unknown assignee" });
        }
      }
      const member = await currentMember(req.prisma, req.user!);
      const updated = await req.prisma.people.update({
        where: { id: row.id },
        data: {
          assignedTo: assignedTo ?? null,
          assignedAt: assignedTo ? new Date() : null,
          assignedBy: assignedTo ? (member?.id ?? null) : null,
        },
        include: PERSON_INCLUDE,
      });
      await audit(req.prisma, {
        userId: req.user!.id,
        action: "people.assign",
        entity: "people",
        entityId: row.id,
        message: assignedTo ? "person assigned" : "person unassigned",
      });
      const includeNotes = mayReadNotes(req.roleName ?? "", updated, member?.id ?? null);
      return serializePerson(updated, includeNotes);
    },
  );

  // ---- Bulk assign (Attention page) -------------------------------------------
  app.patch(
    "/api/people/bulk-assign",
    { config: { access: "auth", action: "people:assign" } },
    async (req, reply) => {
      const parsed = bulkAssignSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid bulk assign body" });
      }
      const { ids, assignedTo } = parsed.data;
      if (assignedTo) {
        const target = await req.prisma.teamMembers.findUnique({ where: { id: assignedTo }, select: { id: true } });
        if (!target) {
          return reply.code(400).send({ error: "unknown assignee" });
        }
      }
      const member = await currentMember(req.prisma, req.user!);
      // The stamp_assignment trigger stamps assigned_at per changed row.
      const result = await req.prisma.people.updateMany({
        where: { id: { in: ids } },
        data: {
          assignedTo: assignedTo ?? null,
          assignedBy: assignedTo ? (member?.id ?? null) : null,
        },
      });
      await audit(req.prisma, {
        userId: req.user!.id,
        action: "people.bulk_assign",
        entity: "people",
        entityId: null,
        message: assignedTo ? "people bulk assigned" : "people bulk unassigned",
      });
      return { updated: result.count };
    },
  );

  // ---- Mark as New Convert (button in the drawer) ------------------------------
  app.post<{ Params: { id: string } }>(
    "/api/people/:id/mark-new-convert",
    { config: { access: "auth", action: "people:edit" } },
    async (req, reply) => {
      const param = personIdParam.safeParse(req.params.id);
      if (!param.success) {
        return reply.code(400).send({ error: "invalid person id" });
      }
      const row = await req.prisma.people.findUnique({ where: { id: param.data }, select: { id: true } });
      if (!row) {
        return reply.code(404).send({ error: "not found" });
      }
      const member = await currentMember(req.prisma, req.user!);
      // Same fields the old button wrote, one write: category + needs_pastor.
      const updated = await req.prisma.people.update({
        where: { id: row.id },
        data: { category: asCategory("New Convert"), needsPastor: true },
        include: PERSON_INCLUDE,
      });
      await audit(req.prisma, {
        userId: req.user!.id,
        action: "people.mark_new_convert",
        entity: "people",
        entityId: row.id,
        message: "marked as new convert",
      });
      const includeNotes = mayReadNotes(req.roleName ?? "", updated, member?.id ?? null);
      return serializePerson(updated, includeNotes);
    },
  );

  // ---- Contact log (drawer + follow-ups) ----------------------------------------
  app.post<{ Params: { id: string }; Reply: { created: ContactLogApi; contactLogs: ContactLogApi[] } | { error: string } }>(
    "/api/people/:id/contact-log",
    { config: { access: "auth", action: "followup:log" } },
    async (req, reply) => {
      const param = personIdParam.safeParse(req.params.id);
      if (!param.success) {
        return reply.code(400).send({ error: "invalid person id" });
      }
      const parsed = contactLogCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid contact log body" });
      }
      const input = parsed.data;
      const person = await req.prisma.people.findUnique({
        where: { id: param.data },
        select: { id: true, assignedTo: true },
      });
      if (!person) {
        return reply.code(404).send({ error: "not found" });
      }
      const member = await currentMember(req.prisma, req.user!);
      if (!member) {
        return reply.code(403).send({ error: "forbidden" });
      }
      // Row scope: a coordinator logs contacts for their own people only.
      if ((req.user!.role as string) === "Follow-up Coordinator" && person.assignedTo !== member.id) {
        return reply.code(403).send({ error: "forbidden" });
      }
      const created = await req.prisma.contactLog.create({
        data: {
          personId: person.id,
          contactedBy: member.id,
          method: asContactMethod(input.method),
          outcome: asContactOutcome(input.outcome),
          note: input.note ?? null,
          finished: input.finished,
        },
        include: CONTACT_LOG_INCLUDE,
      });
      await audit(req.prisma, {
        userId: req.user!.id,
        action: "people.log_contact",
        entity: "contact_log",
        entityId: created.id,
        message: "contact logged",
      });
      const logs = await listContactLogs(req.prisma, person.id);
      return { created: serializeContactLog(created), contactLogs: logs.map(serializeContactLog) };
    },
  );

  // ---- Delete (erase-person: Admin only, rights tool from Phase 0) -------------
  app.delete<{ Params: { id: string } }>(
    "/api/people/:id",
    { config: { access: "auth", action: "erase-person" } },
    async (req, reply) => {
      const param = personIdParam.safeParse(req.params.id);
      if (!param.success) {
        return reply.code(400).send({ error: "invalid person id" });
      }
      const row = await req.prisma.people.findUnique({ where: { id: param.data }, select: { id: true } });
      if (!row) {
        return reply.code(404).send({ error: "not found" });
      }
      await req.prisma.people.delete({ where: { id: row.id } });
      await audit(req.prisma, {
        userId: req.user!.id,
        action: "people.erase",
        entity: "people",
        entityId: row.id,
        message: "person erased",
      });
      return reply.code(204).send();
    },
  );
}
