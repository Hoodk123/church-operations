// Message templates (docs/09 feature order #7, docs/05 part B).
// The follow-up MessagePanel picks a template and fills {name}/{volunteer};
// the Admin TemplatesDialog manages the rows (create, edit, delete, reorder).
// Reads: every role (templates:read). Writes: Admin only (templates:write) —
// the same gate the old RLS put on message_templates updates.
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Prisma } from "../../src/generated/prisma/client.js";
import { audit } from "../audit.js";
import { currentMember } from "../lib/route-helpers.js";
import { asCategory, humanize } from "../lib/enums.js";
import { categorySchema } from "../schemas/people.js";

const templateCreateSchema = z.object({
  name: z.string().min(1).max(120).transform((v) => v.trim()),
  body: z.string().min(1).max(3000).transform((v) => v.trim()),
  suggestedCategory: categorySchema.nullish(),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  active: z.boolean().default(true),
});

const templateUpdateSchema = z.object({
  name: z.string().min(1).max(120).transform((v) => v.trim()).optional(),
  body: z.string().min(1).max(3000).transform((v) => v.trim()).optional(),
  suggestedCategory: categorySchema.nullish().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  active: z.boolean().optional(),
});

const templateReorderSchema = z.object({
  items: z
    .array(z.object({ id: z.uuid(), sortOrder: z.number().int().min(0).max(9999) }))
    .min(1)
    .max(100),
});

function serializeTemplate(row: {
  id: string;
  name: string;
  body: string;
  suggestedCategory: string | null;
  sortOrder: number;
  active: boolean;
}) {
  return {
    id: row.id,
    name: row.name,
    body: row.body,
    suggestedCategory: humanize("Category", row.suggestedCategory),
    sortOrder: row.sortOrder,
    active: row.active,
  };
}

export async function registerTemplateRoutes(app: FastifyInstance): Promise<void> {
  // ---- List (MessagePanel picker + TemplatesDialog) --------------------------
  app.get("/api/templates", { config: { access: "auth", action: "templates:read" } }, async (req) => {
    const rows = await req.prisma.messageTemplates.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return { items: rows.map(serializeTemplate) };
  });

  // ---- Create ----------------------------------------------------------------
  app.post("/api/templates", { config: { access: "auth", action: "templates:write" } }, async (req, reply) => {
    const parsed = templateCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid template body" });
    }
    const input = parsed.data;
    const member = await currentMember(req.prisma, req.user!);
    const duplicate = await req.prisma.messageTemplates.findFirst({ where: { name: input.name }, select: { id: true } });
    if (duplicate) {
      return reply.code(409).send({ error: "template name already exists" });
    }
    const created = await req.prisma.messageTemplates.create({
      data: {
        name: input.name,
        body: input.body,
        suggestedCategory: input.suggestedCategory ? asCategory(input.suggestedCategory) : null,
        sortOrder: input.sortOrder,
        active: input.active,
        createdBy: member?.id ?? null,
      },
    });
    await audit(req.prisma, {
      userId: req.user!.id,
      action: "templates.create",
      entity: "message_templates",
      entityId: created.id,
      message: "template created",
    });
    return reply.code(201).send(serializeTemplate(created));
  });

  // ---- Edit ------------------------------------------------------------------
  app.patch<{ Params: { id: string } }>(
    "/api/templates/:id",
    { config: { access: "auth", action: "templates:write" } },
    async (req, reply) => {
      const param = z.uuid().safeParse(req.params.id);
      if (!param.success) {
        return reply.code(400).send({ error: "invalid template id" });
      }
      const parsed = templateUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid template body" });
      }
      const input = parsed.data;
      const row = await req.prisma.messageTemplates.findUnique({ where: { id: param.data }, select: { id: true, name: true } });
      if (!row) {
        return reply.code(404).send({ error: "not found" });
      }
      if (input.name !== undefined && input.name !== row.name) {
        const duplicate = await req.prisma.messageTemplates.findFirst({ where: { name: input.name }, select: { id: true } });
        if (duplicate && duplicate.id !== row.id) {
          return reply.code(409).send({ error: "template name already exists" });
        }
      }
      const data: Prisma.MessageTemplatesUpdateInput = { updatedAt: new Date() };
      if (input.name !== undefined) data.name = input.name;
      if (input.body !== undefined) data.body = input.body;
      if (input.suggestedCategory !== undefined) {
        data.suggestedCategory = input.suggestedCategory ? asCategory(input.suggestedCategory) : null;
      }
      if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
      if (input.active !== undefined) data.active = input.active;
      const updated = await req.prisma.messageTemplates.update({ where: { id: row.id }, data });
      await audit(req.prisma, {
        userId: req.user!.id,
        action: "templates.update",
        entity: "message_templates",
        entityId: row.id,
        message: "template updated",
      });
      return serializeTemplate(updated);
    },
  );

  // ---- Reorder (swap two rows' sort_order in one go) --------------------------
  app.patch(
    "/api/templates/reorder",
    { config: { access: "auth", action: "templates:write" } },
    async (req, reply) => {
      const parsed = templateReorderSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid reorder body" });
      }
      await req.prisma.$transaction(
        parsed.data.items.map((item) =>
          req.prisma.messageTemplates.update({
            where: { id: item.id },
            data: { sortOrder: item.sortOrder, updatedAt: new Date() },
          }),
        ),
      );
      await audit(req.prisma, {
        userId: req.user!.id,
        action: "templates.reorder",
        entity: "message_templates",
        entityId: null,
        message: "templates reordered",
      });
      return { updated: parsed.data.items.length };
    },
  );

  // ---- Delete ----------------------------------------------------------------
  app.delete<{ Params: { id: string } }>(
    "/api/templates/:id",
    { config: { access: "auth", action: "templates:write" } },
    async (req, reply) => {
      const param = z.uuid().safeParse(req.params.id);
      if (!param.success) {
        return reply.code(400).send({ error: "invalid template id" });
      }
      const row = await req.prisma.messageTemplates.findUnique({ where: { id: param.data }, select: { id: true } });
      if (!row) {
        return reply.code(404).send({ error: "not found" });
      }
      await req.prisma.messageTemplates.delete({ where: { id: row.id } });
      await audit(req.prisma, {
        userId: req.user!.id,
        action: "templates.delete",
        entity: "message_templates",
        entityId: row.id,
        message: "template deleted",
      });
      return reply.code(204).send();
    },
  );
}
