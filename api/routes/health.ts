// Health check (public): tells "am I up" without any personal data.
// The detailed admin status page (backups, disk, certificate) is Phase 7.
import type { FastifyInstance } from "fastify";

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/health",
    { config: { access: "public" } },
    async (req, reply) => {
      try {
        await req.prisma.$queryRaw`SELECT 1`;
        return { status: "ok", db: "up" };
      } catch {
        return reply.code(503).send({ status: "degraded", db: "down" });
      }
    },
  );
}
