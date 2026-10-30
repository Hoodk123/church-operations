// Admin user tools: list accounts and reset a password (no email; the new
// password is returned once to the Admin who asked).
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { audit } from "../audit.js";
import { hashPassword, passwordPolicyError } from "../auth/passwords.js";
import { humanize } from "../lib/enums.js";
import { isoDate } from "../lib/route-helpers.js";

const idParam = z.uuid();

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/admin/users", { config: { access: "auth", action: "admin:users" } }, async (req) => {
    const rows = await req.prisma.users.findMany({
      orderBy: [{ email: "asc" }],
      select: {
        id: true,
        email: true,
        role: true,
        active: true,
        lastLoginAt: true,
        lockedUntil: true,
      },
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        email: row.email,
        role: humanize("UserRole", row.role) ?? row.role,
        active: row.active,
        lastLoginAt: row.lastLoginAt ? isoDate(row.lastLoginAt) : null,
        locked: row.lockedUntil !== null && row.lockedUntil.getTime() > Date.now(),
      })),
    };
  });

  app.post<{ Params: { id: string } }>(
    "/api/admin/users/:id/password",
    { config: { access: "auth", action: "admin:users" } },
    async (req, reply) => {
      const param = idParam.safeParse(req.params.id);
      if (!param.success) return reply.code(400).send({ error: "invalid user id" });
      const parsed = z.object({ newPassword: z.string().min(12).max(200) }).safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "invalid request" });
      const policy = passwordPolicyError(parsed.data.newPassword);
      if (policy) return reply.code(400).send({ error: policy });
      const user = await req.prisma.users.findUnique({ where: { id: param.data }, select: { id: true } });
      if (!user) return reply.code(404).send({ error: "not found" });
      const newHash = await hashPassword(parsed.data.newPassword);
      await req.prisma.users.update({
        where: { id: user.id },
        data: { passwordHash: newHash, failedLoginCount: 0, lockedUntil: null },
      });
      await req.prisma.sessions.deleteMany({ where: { userId: user.id } });
      await audit(req.prisma, {
        userId: req.user!.id,
        action: "auth.password_reset",
        entity: "users",
        entityId: user.id,
        message: "admin password reset",
      });
      return { ok: true };
    },
  );
}
