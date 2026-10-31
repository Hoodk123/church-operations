import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { audit } from "../audit.js";
import { currentMember, day, isoDate } from "../lib/route-helpers.js";
import { asFollowUpStatus, humanize } from "../lib/enums.js";
import { followUpDashboardApiSchema, followUpsQuerySchema } from "../schemas/people.js";

export async function registerFollowUpRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/follow-ups",
    { config: { access: "auth", action: "followup:read" } },
    async (req, reply) => {
      const query = followUpsQuerySchema.safeParse(
        Object.fromEntries(new URL(req.url, "http://localhost").searchParams),
      );
      if (!query.success) {
        return reply.code(400).send({ error: "invalid follow-up query" });
      }

      const [year, month, date] = query.data.date.split("-").map(Number);
      const dayStart = new Date(year!, month! - 1, date!);
      if (
        Number.isNaN(dayStart.getTime()) ||
        dayStart.getFullYear() !== year ||
        dayStart.getMonth() !== month! - 1 ||
        dayStart.getDate() !== date
      ) {
        return reply.code(400).send({ error: "invalid follow-up query" });
      }

      const member = await currentMember(req.prisma, req.user!);
      if (!member) {
        return followUpDashboardApiSchema.parse({ people: [], todayLogs: [] });
      }

      const people = await req.prisma.people.findMany({
        where: {
          assignedTo: member.id,
          followUpStatus: { not: asFollowUpStatus("Completed") },
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          category: true,
          location: true,
          needsPastor: true,
          lastContactDate: true,
          followUpStatus: true,
          assignedAt: true,
          assignedByRef: { select: { fullName: true } },
        },
      });

      const [todayLogs, absentMarks] = await Promise.all([
        req.prisma.contactLog.findMany({
          where: { contactedBy: member.id, contactedAt: { gte: dayStart } },
          orderBy: [{ contactedAt: "desc" }],
          select: {
            id: true,
            contactedAt: true,
            finished: true,
            person: {
              select: { id: true, firstName: true, lastName: true, category: true, phone: true },
            },
          },
        }),
        people.length === 0
          ? Promise.resolve([])
          : req.prisma.m1Attendance.findMany({
              where: {
                personId: { in: people.map((person) => person.id) },
                status: "Absent",
              },
              select: {
                personId: true,
                session: { select: { dayNumber: true, closed: true } },
              },
            }),
      ]);

      const missedM1Days = new Map<string, number>();
      for (const mark of absentMarks) {
        if (!mark.session.closed) continue;
        const latest = missedM1Days.get(mark.personId);
        if (latest === undefined || mark.session.dayNumber > latest) {
          missedM1Days.set(mark.personId, mark.session.dayNumber);
        }
      }

      return followUpDashboardApiSchema.parse({
        people: people.map((person) => ({
          id: person.id,
          firstName: person.firstName,
          lastName: person.lastName,
          phone: person.phone,
          category: humanize("Category", person.category),
          location: person.location,
          needsPastor: person.needsPastor,
          lastContactDate: person.lastContactDate ? day(person.lastContactDate) : null,
          followUpStatus: humanize("FollowUpStatus", person.followUpStatus) ?? "",
          assignedAt: person.assignedAt ? isoDate(person.assignedAt) : null,
          assignedByName: person.assignedByRef?.fullName ?? null,
          missedM1Day: missedM1Days.get(person.id) ?? null,
        })),
        todayLogs: todayLogs.map((log) => ({
          id: log.id,
          contactedAt: isoDate(log.contactedAt),
          finished: log.finished,
          person: {
            id: log.person.id,
            firstName: log.person.firstName,
            lastName: log.person.lastName,
            category: humanize("Category", log.person.category),
            phone: log.person.phone,
          },
        })),
      });
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/contact-log/:id",
    { config: { access: "auth", action: "followup:log" } },
    async (req, reply) => {
      const id = z.uuid().safeParse(req.params.id);
      if (!id.success) {
        return reply.code(400).send({ error: "invalid contact log id" });
      }

      const row = await req.prisma.contactLog.findUnique({
        where: { id: id.data },
        select: { id: true, contactedBy: true, contactedAt: true },
      });
      if (!row) {
        return reply.code(404).send({ error: "not found" });
      }

      const member = await currentMember(req.prisma, req.user!);
      if (!member) {
        return reply.code(403).send({ error: "forbidden" });
      }
      if (req.roleName !== "Admin") {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const tomorrow = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
        if (
          row.contactedBy !== member.id ||
          row.contactedAt < todayStart ||
          row.contactedAt >= tomorrow
        ) {
          return reply.code(403).send({ error: "forbidden" });
        }
      }

      await req.prisma.contactLog.delete({ where: { id: row.id } });
      await audit(req.prisma, {
        userId: req.user!.id,
        action: "people.undo_contact_log",
        entity: "contact_log",
        entityId: row.id,
        message: "contact log removed",
      });
      return reply.code(204).send();
    },
  );
}
