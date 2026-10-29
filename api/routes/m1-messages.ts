// M1 message log, reply-link minting, and the public absence-reply page
// (replaces get_reply_context / submit_absence_reply).
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { audit } from "../audit.js";
import { currentMember, day, isoDate } from "../lib/route-helpers.js";
import { signFileToken } from "../lib/files.js";

const idParam = z.uuid();
const purposeSchema = z.enum(["reminder", "catch_up", "materials", "certificate", "baptism", "other"]);
const channelSchema = z.enum(["WhatsApp", "Email", "SMS", "Call"]);
const reasonSchema = z.enum(["Work", "Sick", "Transport", "Family", "Forgot", "Evening", "Other"]);

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const FINISHED = { error: "link finished" } as const;

export async function registerM1MessageRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>(
    "/api/m1/sessions/:id/messages",
    { config: { access: "auth", action: "m1:read" } },
    async (req, reply) => {
      const param = idParam.safeParse(req.params.id);
      if (!param.success) return reply.code(400).send({ error: "invalid session id" });
      const rows = await req.prisma.m1MessageLog.findMany({
        where: { sessionId: param.data },
        orderBy: [{ sentAt: "desc" }],
        select: { personId: true, sentAt: true, purpose: true, channel: true },
      });
      return {
        items: rows.map((row) => ({
          personId: row.personId,
          sentAt: isoDate(row.sentAt),
          purpose: row.purpose,
          channel: row.channel,
        })),
      };
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/m1/classes/:id/absence-replies",
    { config: { access: "auth", action: "m1:read" } },
    async (req, reply) => {
      const param = idParam.safeParse(req.params.id);
      if (!param.success) return reply.code(400).send({ error: "invalid class id" });
      const sessions = await req.prisma.m1Sessions.findMany({
        where: { classId: param.data },
        select: { id: true },
      });
      const rows = await req.prisma.m1AbsenceReplies.findMany({
        where: { sessionId: { in: sessions.map((s) => s.id) } },
        orderBy: [{ createdAt: "desc" }],
        include: { person: { select: { firstName: true, lastName: true } } },
      });
      // These replies are written BY the person ("Sick", family reasons) and
      // count as special-category reads under docs/09: audit every retrieval
      // with a message that carries no personal content.
      await audit(req.prisma, {
        userId: req.user!.id,
        action: "m1.absence_replies_read",
        entity: "m1_classes",
        entityId: param.data,
        message: "absence replies retrieved for a class",
      });
      return {
        items: rows.map((row) => ({
          personId: row.personId,
          sessionId: row.sessionId,
          reason: row.reason,
          note: row.note,
          createdAt: isoDate(row.createdAt),
          firstName: row.person.firstName,
          lastName: row.person.lastName,
        })),
      };
    },
  );

  app.post("/api/m1/messages", { config: { access: "auth", action: "m1:enroll" } }, async (req, reply) => {
    const parsed = z
      .object({
        personId: z.uuid(),
        classId: z.uuid().nullish(),
        sessionId: z.uuid().nullish(),
        purpose: purposeSchema,
        channel: channelSchema,
      })
      .safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid message body" });
    const member = await currentMember(req.prisma, req.user!);
    const created = await req.prisma.m1MessageLog.create({
      data: {
        personId: parsed.data.personId,
        classId: parsed.data.classId ?? null,
        sessionId: parsed.data.sessionId ?? null,
        purpose: parsed.data.purpose,
        channel: parsed.data.channel,
        sentBy: member?.id ?? null,
      },
    });
    await audit(req.prisma, {
      userId: req.user!.id,
      action: "m1.message_log",
      entity: "m1_message_log",
      entityId: created.id,
      message: "message logged",
    });
    return reply.code(201).send({ id: created.id });
  });

  app.post<{ Params: { id: string } }>(
    "/api/m1/sessions/:id/reply-links",
    { config: { access: "auth", action: "m1:enroll" } },
    async (req, reply) => {
      const param = idParam.safeParse(req.params.id);
      if (!param.success) return reply.code(400).send({ error: "invalid session id" });
      const parsed = z.object({ personId: z.uuid() }).safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "invalid reply-link body" });
      const session = await req.prisma.m1Sessions.findUnique({ where: { id: param.data } });
      if (!session) return reply.code(404).send({ error: "not found" });
      const existing = await req.prisma.m1ReplyLinks.findFirst({
        where: {
          sessionId: session.id,
          personId: parsed.data.personId,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      const member = await currentMember(req.prisma, req.user!);
      const raw = randomBytes(24).toString("base64url");
      const hashed = hashToken(raw);
      const expiresAt = new Date(Date.now() + 21 * 86_400_000);
      if (existing) {
        await req.prisma.m1ReplyLinks.update({
          where: { token: existing.token },
          data: { token: hashed, expiresAt, createdBy: member?.id ?? existing.createdBy },
        });
      } else {
        try {
          await req.prisma.m1ReplyLinks.create({
            data: {
              token: hashed,
              sessionId: session.id,
              personId: parsed.data.personId,
              createdBy: member?.id ?? null,
              expiresAt,
            },
          });
        } catch {
          await req.prisma.m1ReplyLinks.update({
            where: { sessionId_personId: { sessionId: session.id, personId: parsed.data.personId } },
            data: { token: hashed, expiresAt, usedAt: null, createdBy: member?.id ?? null },
          });
        }
      }
      const materials = await req.prisma.m1Materials.findFirst({
        where: { classId: session.classId },
        orderBy: [{ createdAt: "desc" }],
      });
      const materialsUrl = materials
        ? `/api/public/files/${signFileToken(req.env.FILE_SIGNING_SECRET, materials.id, 7 * 86_400)}`
        : "";
      return {
        token: raw,
        replyPath: `/reply/${raw}`,
        materialsPath: materialsUrl,
      };
    },
  );

  app.get<{ Params: { token: string } }>(
    "/api/public/reply/:token",
    { config: { access: "public", rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const token = z.string().min(8).max(80).safeParse(req.params.token);
      if (!token.success) return reply.code(200).send(FINISHED);
      const hashed = hashToken(token.data);
      const link = await req.prisma.m1ReplyLinks.findUnique({
        where: { token: hashed },
        include: {
          person: { select: { firstName: true } },
          session: { select: { dayNumber: true, sessionDate: true, summary: true, classId: true } },
        },
      });
      if (!link || link.expiresAt.getTime() <= Date.now()) {
        return reply.code(200).send(FINISHED);
      }
      const next = await req.prisma.m1Sessions.findFirst({
        where: { classId: link.session.classId, sessionDate: { gte: new Date() } },
        orderBy: [{ sessionDate: "asc" }],
        select: { sessionDate: true },
      });
      return {
        firstName: link.person.firstName,
        dayNumber: link.session.dayNumber,
        sessionDate: day(link.session.sessionDate),
        summary: link.session.summary,
        nextSessionDate: next ? day(next.sessionDate) : null,
        alreadyReplied: link.usedAt !== null,
      };
    },
  );

  app.post<{ Params: { token: string } }>(
    "/api/public/reply/:token",
    { config: { access: "public", rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const token = z.string().min(8).max(80).safeParse(req.params.token);
      const parsed = z
        .object({
          reason: reasonSchema,
          note: z.string().max(1000).optional().default(""),
          website: z.string().max(200).optional().default(""),
        })
        .safeParse(req.body);
      if (!token.success || !parsed.success) {
        return reply.code(200).send({ ok: false });
      }
      // Honeypot: pretend success, write nothing.
      if (parsed.data.website) return { ok: true };
      const hashed = hashToken(token.data);
      const link = await req.prisma.m1ReplyLinks.findUnique({ where: { token: hashed } });
      if (!link || link.expiresAt.getTime() <= Date.now() || link.usedAt) {
        return { ok: false };
      }
      await req.prisma.m1AbsenceReplies.create({
        data: {
          sessionId: link.sessionId,
          personId: link.personId,
          reason: parsed.data.reason,
          note: parsed.data.note.trim() || null,
          source: "Link",
        },
      });
      await req.prisma.m1ReplyLinks.update({
        where: { token: hashed },
        data: { usedAt: new Date() },
      });
      return { ok: true };
    },
  );
}
