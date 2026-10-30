// Rights tool: export ONE person's data as a JSON download (docs/09 Phase 3
// "Rights tools from Phase 0: export one person's data"). Admin-only action
// (Phase 8: "Import, export, erase a person" — Admin only). The response is
// an attachment; the filename never contains the person's name. Every call is
// audited (who exported what; never personal values in the audit message).
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audit } from "../audit.js";
import { isoDate } from "../lib/route-helpers.js";
import { humanize } from "../lib/enums.js";

const idParamSchema = z.string().uuid();

export function registerPeopleExportRoutes(app: FastifyInstance): void {
  app.get<{ Params: { id: string } }>(
    "/api/people/:id/export",
    { config: { access: "auth", action: "export-person" } },
    async (req, reply) => {
      const id = idParamSchema.safeParse(req.params.id);
      if (!id.success) {
        return reply.code(400).send({ error: "invalid person id" });
      }

      const person = await req.prisma.people.findUnique({
        where: { id: id.data },
        select: {
          id: true, firstName: true, lastName: true, gender: true, ageGroup: true,
          phone: true, location: true, category: true, m1Status: true, hbfGroup: true,
          howFoundChurch: true, dateRegistered: true, assignedTo: true,
          followUpStatus: true, lastContactDate: true, baptismStatus: true, notes: true,
          registeredBy: true, createdAt: true, updatedAt: true, contactPreference: true,
          needsPastor: true, assignedAt: true, assignedBy: true, email: true,
          addressDetails: true, needsM1: true, needsBaptism: true,
          churchGroup: true, source: true, firstVisitDate: true,
          assignee: { select: { fullName: true } },
          contactLogs: {
            select: { contactedAt: true, method: true, outcome: true, note: true, finished: true },
            orderBy: { contactedAt: "desc" },
          },
          attendanceRows: {
            select: { serviceDate: true, serviceName: true, checkedInAt: true, checkedInBy: true },
            orderBy: { serviceDate: "desc" },
          },
          enrolments: {
            select: {
              enrolledAt: true, status: true, certificateNo: true, certificateIssuedAt: true,
              walkIn: true, class: { select: { title: true, requiredDays: true } },
            },
            orderBy: { enrolledAt: "desc" },
          },
          m1AttendanceRows: {
            select: { session: { select: { sessionDate: true } }, status: true, markedAt: true },
          },
          absenceReplies: { select: { createdAt: true, reason: true, note: true, source: true } },
          replyLinks: { select: { token: true, createdAt: true, expiresAt: true, usedAt: true } },
          baptismRegistrations: {
            select: { status: true, baptizedAt: true, certificateNo: true, certificateIssuedAt: true },
          },
          welcomeSubmissions: { select: { submittedAt: true, qrSource: true } },
        },
      });
      if (!person) {
        return reply.code(404).send({ error: "not found" });
      }

      const payload = {
        exportedAt: new Date().toISOString(),
        person: {
          ...person,
          gender: humanize("Gender", person.gender),
          ageGroup: humanize("AgeGroup", person.ageGroup),
          category: humanize("Category", person.category),
          m1Status: humanize("M1Status", person.m1Status),
          baptismStatus: humanize("BaptismStatus", person.baptismStatus),
          followUpStatus: humanize("FollowUpStatus", person.followUpStatus),
          contactPreference: humanize("ContactPreference", person.contactPreference),
          contactLogs: person.contactLogs.map((log) => ({
            contactedAt: log.contactedAt.toISOString(),
            method: humanize("ContactMethod", log.method),
            outcome: humanize("ContactOutcome", log.outcome),
            note: log.note,
            finished: log.finished,
          })),
          attendance: person.attendanceRows.map((att) => ({
            serviceDate: isoDate(att.serviceDate),
            serviceName: att.serviceName,
            checkedInAt: att.checkedInAt.toISOString(),
            checkedInByIsStaff: att.checkedInBy !== null,
          })),
          m1Enrollments: person.enrolments.map((enr) => ({
            enrolledAt: isoDate(enr.enrolledAt),
            classTitle: enr.class?.title ?? null,
            status: humanize("M1Status", enr.status),
            walkIn: enr.walkIn,
            certificateNo: enr.certificateNo,
            certificateIssuedAt: enr.certificateIssuedAt ? isoDate(enr.certificateIssuedAt) : null,
          })),
          m1Attendance: person.m1AttendanceRows.map((m) => ({
            sessionDate: isoDate(m.session.sessionDate),
            status: m.status,
          })),
          absenceReplies: person.absenceReplies.map((a) => ({
            recordedAt: a.createdAt.toISOString(),
            reason: a.reason,
            source: a.source,
            note: a.note,
          })),
          m1ReplyLinks: person.replyLinks.map((l) => ({
            createdAt: l.createdAt.toISOString(),
            expiresAt: l.expiresAt.toISOString(),
            used: l.usedAt !== null,
            shortToken: `${l.token.slice(0, 8)}…`, // tokens stay secret
          })),
          baptismRegistrations: person.baptismRegistrations.map((b) => ({
            status: b.status,
            baptizedAt: b.baptizedAt ? isoDate(b.baptizedAt) : null,
            certificateNo: b.certificateNo,
            certificateIssuedAt: b.certificateIssuedAt ? isoDate(b.certificateIssuedAt) : null,
          })),
          welcomeSubmissions: person.welcomeSubmissions.map((w) => ({
            submittedAt: w.submittedAt.toISOString(),
            qrSource: w.qrSource,
          })),
        },
      };

      await audit(req.prisma, {
        userId: req.user!.id,
        action: "people.exported",
        entity: "people",
        entityId: person.id,
        message: "person data exported (one person, full record)",
      });

      // Attachment; the filename holds no personal data.
      reply.header("Content-Type", "application/json; charset=utf-8");
      reply.header("Content-Disposition", 'attachment; filename="person-data.json"');
      return payload;
    },
  );
}
