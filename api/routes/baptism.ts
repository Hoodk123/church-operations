// Baptism routes (docs/09 feature order #9). Behaviour matches the Baptism
// screen: candidates list, services, register, mark done, archive, Admin delete.
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { audit } from "../audit.js";
import { currentMember, day, isoDate } from "../lib/route-helpers.js";
import { humanize } from "../lib/enums.js";

const idParam = z.uuid();
const eventStatusSchema = z.enum(["Scheduled", "Done", "Cancelled"]);

function timeLabel(value: Date | string | null): string | null {
  if (value === null) return null;
  if (typeof value === "string") return value.slice(0, 5);
  return value.toISOString().slice(11, 16);
}

export async function registerBaptismRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/baptism/candidates", { config: { access: "auth", action: "baptism:read" } }, async (req) => {
    const registeredOnScheduled = await req.prisma.baptismRegistrations.findMany({
      where: { status: "Registered", event: { status: "Scheduled" } },
      select: { personId: true },
    });
    const skip = registeredOnScheduled.map((r) => r.personId);
    const rows = await req.prisma.people.findMany({
      where: {
        needsBaptism: true,
        OR: [{ baptismStatus: null }, { baptismStatus: { not: "Baptized" } }],
        id: skip.length > 0 ? { notIn: skip } : undefined,
      },
      orderBy: [{ firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        location: true,
        addressDetails: true,
        contactPreference: true,
        baptismStatus: true,
        needsBaptism: true,
      },
    });
    const certs = await req.prisma.m1Enrollments.findMany({
      where: { personId: { in: rows.map((r) => r.id) }, certificateIssuedAt: { not: null } },
      select: { personId: true, certificateIssuedAt: true },
    });
    const completed: Record<string, string> = {};
    for (const row of certs) {
      if (!row.certificateIssuedAt) continue;
      const iso = row.certificateIssuedAt.toISOString();
      const prev = completed[row.personId];
      if (!prev || prev < iso) completed[row.personId] = iso;
    }
    return {
      items: rows.map((row) => ({
        id: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
        phone: row.phone,
        email: row.email,
        location: row.location,
        addressDetails: row.addressDetails,
        contactPreference: humanize("ContactPreference", row.contactPreference),
        baptismStatus: humanize("BaptismStatus", row.baptismStatus),
        needsBaptism: row.needsBaptism,
        m1CompletedAt: completed[row.id] ?? null,
      })),
    };
  });

  app.get("/api/baptism/events", { config: { access: "auth", action: "baptism:read" } }, async (req) => {
    const rows = await req.prisma.baptismEvents.findMany({
      orderBy: [{ eventDate: "asc" }],
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        eventDate: day(row.eventDate),
        eventTime: timeLabel(row.eventTime),
        venue: row.venue,
        officiant: row.officiant,
        status: row.status,
        notes: row.notes,
        archivedAt: row.archivedAt ? isoDate(row.archivedAt) : null,
        createdBy: row.createdBy,
      })),
    };
  });

  app.get("/api/baptism/registrations", { config: { access: "auth", action: "baptism:read" } }, async (req) => {
    const rows = await req.prisma.baptismRegistrations.findMany({
      include: {
        person: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
            contactPreference: true,
            addressDetails: true,
            location: true,
          },
        },
      },
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        eventId: row.eventId,
        personId: row.personId,
        status: row.status,
        baptizedAt: row.baptizedAt ? isoDate(row.baptizedAt) : null,
        person: {
          id: row.person.id,
          firstName: row.person.firstName,
          lastName: row.person.lastName,
          phone: row.person.phone,
          email: row.person.email,
          contactPreference: humanize("ContactPreference", row.person.contactPreference),
          addressDetails: row.person.addressDetails,
          location: row.person.location,
        },
      })),
    };
  });

  app.post("/api/baptism/events", { config: { access: "auth", action: "baptism:write" } }, async (req, reply) => {
    const parsed = z
      .object({
        eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        eventTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullish(),
        venue: z.string().max(200).nullish().transform((v) => (v?.trim() ? v.trim() : null)),
        notes: z.string().max(2000).nullish().transform((v) => (v?.trim() ? v.trim() : null)),
        status: eventStatusSchema.default("Scheduled"),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid event body" });
    }
    const member = await currentMember(req.prisma, req.user!);
    const created = await req.prisma.baptismEvents.create({
      data: {
        eventDate: new Date(`${parsed.data.eventDate}T00:00:00.000Z`),
        eventTime: parsed.data.eventTime ? new Date(`1970-01-01T${parsed.data.eventTime}:00.000Z`) : null,
        venue: parsed.data.venue,
        notes: parsed.data.notes,
        status: parsed.data.status,
        createdBy: member?.id ?? null,
      },
    });
    await audit(req.prisma, {
      userId: req.user!.id,
      action: "baptism.event_create",
      entity: "baptism_events",
      entityId: created.id,
      message: "baptism service created",
    });
    return reply.code(201).send({ id: created.id });
  });

  app.patch<{ Params: { id: string } }>(
    "/api/baptism/events/:id",
    { config: { access: "auth", action: "baptism:write" } },
    async (req, reply) => {
      const param = idParam.safeParse(req.params.id);
      if (!param.success) return reply.code(400).send({ error: "invalid event id" });
      const parsed = z
        .object({
          eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          eventTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullish(),
          venue: z.string().max(200).nullish(),
          notes: z.string().max(2000).nullish(),
          status: eventStatusSchema.optional(),
          archivedAt: z.string().datetime().nullable().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "invalid event body" });
      const existing = await req.prisma.baptismEvents.findUnique({ where: { id: param.data } });
      if (!existing) return reply.code(404).send({ error: "not found" });
      const data: {
        eventDate?: Date;
        eventTime?: Date | null;
        venue?: string | null;
        notes?: string | null;
        status?: "Scheduled" | "Done" | "Cancelled";
        archivedAt?: Date | null;
      } = {};
      if (parsed.data.eventDate) data.eventDate = new Date(`${parsed.data.eventDate}T00:00:00.000Z`);
      if (parsed.data.eventTime !== undefined) {
        data.eventTime = parsed.data.eventTime ? new Date(`1970-01-01T${parsed.data.eventTime}:00.000Z`) : null;
      }
      if (parsed.data.venue !== undefined) data.venue = parsed.data.venue?.trim() ? parsed.data.venue.trim() : null;
      if (parsed.data.notes !== undefined) data.notes = parsed.data.notes?.trim() ? parsed.data.notes.trim() : null;
      if (parsed.data.status) data.status = parsed.data.status;
      if (parsed.data.archivedAt !== undefined) {
        data.archivedAt = parsed.data.archivedAt ? new Date(parsed.data.archivedAt) : null;
      }
      await req.prisma.baptismEvents.update({ where: { id: existing.id }, data });
      await audit(req.prisma, {
        userId: req.user!.id,
        action: "baptism.event_update",
        entity: "baptism_events",
        entityId: existing.id,
        message: "baptism service updated",
      });
      return { ok: true };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/baptism/events/:id/mark-done",
    { config: { access: "auth", action: "baptism:write" } },
    async (req, reply) => {
      const param = idParam.safeParse(req.params.id);
      if (!param.success) return reply.code(400).send({ error: "invalid event id" });
      const event = await req.prisma.baptismEvents.findUnique({ where: { id: param.data } });
      if (!event) return reply.code(404).send({ error: "not found" });
      await req.prisma.baptismEvents.update({ where: { id: event.id }, data: { status: "Done" } });
      await req.prisma.baptismRegistrations.updateMany({
        where: { eventId: event.id, status: "Registered" },
        data: { status: "Baptized" },
      });
      await audit(req.prisma, {
        userId: req.user!.id,
        action: "baptism.mark_done",
        entity: "baptism_events",
        entityId: event.id,
        message: "baptism service marked done",
      });
      return { ok: true };
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/baptism/events/:id",
    { config: { access: "auth", action: "baptism:delete" } },
    async (req, reply) => {
      const param = idParam.safeParse(req.params.id);
      if (!param.success) return reply.code(400).send({ error: "invalid event id" });
      const event = await req.prisma.baptismEvents.findUnique({ where: { id: param.data } });
      if (!event) return reply.code(404).send({ error: "not found" });
      const unfinished = await req.prisma.baptismRegistrations.findMany({
        where: { eventId: event.id, status: { not: "Baptized" } },
        select: { personId: true },
      });
      const people = unfinished.map((r) => r.personId);
      await req.prisma.$transaction([
        req.prisma.baptismRegistrations.deleteMany({ where: { eventId: event.id } }),
        req.prisma.baptismEvents.delete({ where: { id: event.id } }),
        req.prisma.people.updateMany({
          where: {
            id: { in: people },
            OR: [{ baptismStatus: null }, { baptismStatus: { not: "Baptized" } }],
          },
          data: { needsBaptism: true, baptismStatus: "NotYet" },
        }),
      ]);
      await audit(req.prisma, {
        userId: req.user!.id,
        action: "baptism.event_delete",
        entity: "baptism_events",
        entityId: event.id,
        message: "baptism service deleted",
      });
      return reply.code(204).send();
    },
  );

  app.post("/api/baptism/registrations", { config: { access: "auth", action: "baptism:write" } }, async (req, reply) => {
    const parsed = z
      .object({ eventId: z.uuid(), personId: z.uuid() })
      .safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid registration body" });
    const event = await req.prisma.baptismEvents.findUnique({ where: { id: parsed.data.eventId } });
    const person = await req.prisma.people.findUnique({ where: { id: parsed.data.personId }, select: { id: true } });
    if (!event || !person) return reply.code(404).send({ error: "not found" });
    const member = await currentMember(req.prisma, req.user!);
    try {
      const created = await req.prisma.baptismRegistrations.create({
        data: {
          eventId: event.id,
          personId: person.id,
          status: "Registered",
          createdBy: member?.id ?? null,
        },
      });
      await audit(req.prisma, {
        userId: req.user!.id,
        action: "baptism.register",
        entity: "baptism_registrations",
        entityId: created.id,
        message: "person registered for baptism",
      });
      return reply.code(201).send({ id: created.id });
    } catch {
      return reply.code(409).send({ error: "already registered" });
    }
  });

  app.delete<{ Params: { id: string } }>(
    "/api/baptism/registrations/:id",
    { config: { access: "auth", action: "baptism:write" } },
    async (req, reply) => {
      const param = idParam.safeParse(req.params.id);
      if (!param.success) return reply.code(400).send({ error: "invalid registration id" });
      const row = await req.prisma.baptismRegistrations.findUnique({ where: { id: param.data } });
      if (!row) return reply.code(404).send({ error: "not found" });
      await req.prisma.baptismRegistrations.delete({ where: { id: row.id } });
      await audit(req.prisma, {
        userId: req.user!.id,
        action: "baptism.unregister",
        entity: "baptism_registrations",
        entityId: row.id,
        message: "baptism registration removed",
      });
      return reply.code(204).send();
    },
  );
}
