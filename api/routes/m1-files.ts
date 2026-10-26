// M1 materials: disk storage + short-lived signed download links.
import { z } from "zod";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { audit } from "../audit.js";
import { currentMember, isoDate } from "../lib/route-helpers.js";
import {
  allowUpload,
  extensionOf,
  MAX_UPLOAD_BYTES,
  removeStoredFile,
  saveMaterialFile,
  signFileToken,
  verifyFileToken,
} from "../lib/files.js";

const idParam = z.uuid();
const SIGNED_TTL = 7 * 24 * 60 * 60;

export async function registerM1FileRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>(
    "/api/m1/classes/:id/materials",
    { config: { access: "auth", action: "m1:read" } },
    async (req, reply) => {
      const param = idParam.safeParse(req.params.id);
      if (!param.success) return reply.code(400).send({ error: "invalid class id" });
      const rows = await req.prisma.m1Materials.findMany({
        where: { classId: param.data },
        orderBy: [{ createdAt: "desc" }],
        include: { uploadedByRef: { select: { fullName: true } } },
      });
      return {
        items: rows.map((row) => ({
          id: row.id,
          classId: row.classId,
          sessionId: row.sessionId,
          title: row.title,
          mimeType: row.mimeType,
          sizeBytes: row.sizeBytes === null ? null : Number(row.sizeBytes),
          createdAt: isoDate(row.createdAt),
          uploader: row.uploadedByRef?.fullName ?? null,
        })),
      };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/m1/classes/:id/materials",
    { config: { access: "auth", action: "m1:enroll" } },
    async (req, reply) => {
      const param = idParam.safeParse(req.params.id);
      if (!param.success) return reply.code(400).send({ error: "invalid class id" });
      const klass = await req.prisma.m1Classes.findUnique({ where: { id: param.data } });
      if (!klass) return reply.code(404).send({ error: "not found" });
      const file = await req.file();
      if (!file) return reply.code(400).send({ error: "invalid request" });
      const buffer = await file.toBuffer();
      if (buffer.length > MAX_UPLOAD_BYTES) return reply.code(413).send({ error: "body too large" });
      const allowed = allowUpload(file.filename, file.mimetype, buffer);
      if (!allowed.ok) return reply.code(400).send({ error: "file type not allowed" });
      const saved = await saveMaterialFile(req.env.UPLOAD_DIR, klass.id, extensionOf(file.filename), buffer);
      const member = await currentMember(req.prisma, req.user!);
      const created = await req.prisma.m1Materials.create({
        data: {
          classId: klass.id,
          title: path.basename(file.filename).slice(0, 200) || "file",
          storagePath: saved.relative,
          mimeType: allowed.mime,
          sizeBytes: BigInt(buffer.length),
          uploadedBy: member?.id ?? null,
        },
      });
      await audit(req.prisma, {
        userId: req.user!.id,
        action: "m1.material_upload",
        entity: "m1_materials",
        entityId: created.id,
        message: "material uploaded",
      });
      return reply.code(201).send({ id: created.id });
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/m1/materials/:id/signed",
    { config: { access: "auth", action: "m1:read" } },
    async (req, reply) => {
      const param = idParam.safeParse(req.params.id);
      if (!param.success) return reply.code(400).send({ error: "invalid material id" });
      const row = await req.prisma.m1Materials.findUnique({ where: { id: param.data } });
      if (!row) return reply.code(404).send({ error: "not found" });
      const token = signFileToken(req.env.FILE_SIGNING_SECRET, row.id, SIGNED_TTL);
      return { url: `/api/public/files/${token}`, expiresIn: SIGNED_TTL };
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/m1/materials/:id",
    { config: { access: "auth", action: "m1:materials-manage" } },
    async (req, reply) => {
      const param = idParam.safeParse(req.params.id);
      if (!param.success) return reply.code(400).send({ error: "invalid material id" });
      const row = await req.prisma.m1Materials.findUnique({ where: { id: param.data } });
      if (!row) return reply.code(404).send({ error: "not found" });
      await removeStoredFile(req.env.UPLOAD_DIR, row.storagePath);
      await req.prisma.m1Materials.delete({ where: { id: row.id } });
      await audit(req.prisma, {
        userId: req.user!.id,
        action: "m1.material_delete",
        entity: "m1_materials",
        entityId: row.id,
        message: "material deleted",
      });
      return reply.code(204).send();
    },
  );

  app.get<{ Params: { token: string } }>(
    "/api/public/files/:token",
    { config: { access: "public", rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const id = verifyFileToken(req.env.FILE_SIGNING_SECRET, req.params.token);
      if (!id) return reply.code(404).send({ error: "not found" });
      const row = await req.prisma.m1Materials.findUnique({ where: { id } });
      if (!row) return reply.code(404).send({ error: "not found" });
      const abs = path.resolve(req.env.UPLOAD_DIR, row.storagePath);
      const root = path.resolve(req.env.UPLOAD_DIR);
      if (!abs.startsWith(root + path.sep)) return reply.code(404).send({ error: "not found" });
      try {
        await stat(abs);
      } catch {
        return reply.code(404).send({ error: "not found" });
      }
      reply.header("Content-Type", row.mimeType ?? "application/octet-stream");
      reply.header("Content-Disposition", `attachment; filename="${row.title.replace(/[^\w.-]+/g, "_")}"`);
      reply.header("Cache-Control", "no-store");
      return reply.send(createReadStream(abs));
    },
  );
}
