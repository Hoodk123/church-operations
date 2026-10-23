// Auth routes (docs/09 Phase 3 "Auth" + "Errors" rules):
// - login: argon2id, locked accounts, constant-shaped failures (the response
//   never reveals whether the email exists), strict rate limit + audit
// - me / logout / change password: session cookie only, nothing in localStorage
// - change password invalidates every other session of that user
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { audit } from "../audit.js";
import { newCsrfToken, SESSION_COOKIE, CSRF_COOKIE, startSession, endSession, endAllSessionsExcept } from "../auth/session.js";
import { hashPassword, verifyPassword, passwordPolicyError } from "../auth/passwords.js";
import { humanize } from "../lib/enums.js";

const loginSchema = z.object({
  email: z.email().max(200).toLowerCase(),
  password: z.string().min(1).max(200),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(12).max(200),
});

// Window (minutes) an account is locked after the n-th failure in a row.
// 5 fails -> ~3 min, each next fail doubles, capped at 24 h. Reset on success.
function lockMinutesAfterFailures(failures: number): number {
  if (failures < 5) return 0;
  const minutes = Math.pow(2, failures - 5) * 3;
  return Math.min(minutes, 24 * 60);
}

function sessionCookieOptions(env: { CHURCH_ENV: string }, absoluteHours: number, expires: Date) {
  return {
    path: "/api",
    httpOnly: true,
    sameSite: "strict" as const,
    secure: env.CHURCH_ENV === "production",
    expires,
  };
}

function csrfCookieOptions(env: { CHURCH_ENV: string }, absoluteHours: number, expires: Date) {
  return {
    path: "/",
    httpOnly: false,
    sameSite: "strict" as const,
    secure: env.CHURCH_ENV === "production",
    expires,
  };
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/api/auth/login",
    {
      config: { access: "public", rateLimit: { max: 5, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid login body" });
      }
      const { email, password } = parsed.data;
      const user = await req.prisma.users.findUnique({ where: { email } });

      if (user?.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
        const retrySeconds = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000);
        return reply.code(401).header("Retry-After", String(retrySeconds)).send({ error: "invalid email or password" });
      }

      const ok = await verifyPassword(user?.passwordHash, password);
      if (!user || !ok || user.active !== true) {
        if (user) {
          const failures = user.failedLoginCount + 1;
          const lockMinutes = lockMinutesAfterFailures(failures);
          await req.prisma.users.update({
            where: { id: user.id },
            data: {
              failedLoginCount: failures,
              lockedUntil: lockMinutes > 0 ? new Date(Date.now() + lockMinutes * 60_000) : user.lockedUntil,
            },
          });
          await audit(req.prisma, {
            userId: user.id,
            action: "auth.login_failed",
            entity: "users",
            entityId: user.id,
            message: `failed login (attempt ${failures})`,
          });
        } else {
          await audit(req.prisma, {
            action: "auth.login_failed",
            entity: "users",
            entityId: null,
            message: "failed login for unknown account",
          });
        }
        // Constant shape: same body and status whether or not the email exists.
        return reply.code(401).send({ error: "invalid email or password" });
      }

      await req.prisma.users.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
      });

      const absoluteHours = req.env.SESSION_ABSOLUTE_HOURS;
      const { token, expiresAt } = await startSession(req.prisma, user.id, {
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        absoluteHours,
      });
      const csrfToken = newCsrfToken();
      reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions(req.env, absoluteHours, expiresAt));
      reply.setCookie(CSRF_COOKIE, csrfToken, csrfCookieOptions(req.env, absoluteHours, expiresAt));

      await audit(req.prisma, {
        userId: user.id,
        action: "auth.login",
        entity: "users",
        entityId: user.id,
        message: "login succeeded",
      });

      return { user: { id: user.id, email: user.email, role: humanize("UserRole", user.role) ?? user.role }, csrfToken };
    },
  );

  app.get(
    "/api/auth/me",
    { config: { access: "auth", action: "people:read" } },
    async (req, reply) => {
      if (!req.user) {
        return reply.code(401).send({ error: "unauthorized" });
      }
      return {
        user: { id: req.user.id, email: req.user.email, role: humanize("UserRole", req.user.role) ?? req.user.role },
        csrfToken: (req.cookies as Record<string, string | undefined>)[CSRF_COOKIE] ?? null,
      };
    },
  );

  app.post(
    "/api/auth/logout",
    { config: { access: "auth", action: "people:read" } },
    async (req, reply) => {
      if (req.sessionToken) {
        await endSession(req.prisma, req.sessionToken);
        if (req.user) {
          await audit(req.prisma, {
            userId: req.user.id,
            action: "auth.logout",
            entity: "users",
            entityId: req.user.id,
            message: "logout",
          });
        }
      }
      reply.clearCookie(SESSION_COOKIE, { path: "/api" });
      reply.clearCookie(CSRF_COOKIE, { path: "/" });
      return { ok: true };
    },
  );

  app.post(
    "/api/auth/password",
    { config: { access: "auth", action: "admin:settings" } },
    async (req, reply) => {
      const parsed = changePasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid request" });
      }
      const user = req.user!;
      const row = await req.prisma.users.findUniqueOrThrow({ where: { id: user.id } });
      const currentOk = await verifyPassword(row.passwordHash, parsed.data.currentPassword);
      if (!currentOk) {
        return reply.code(403).send({ error: "current password does not match" });
      }
      const policy = passwordPolicyError(parsed.data.newPassword);
      if (policy) {
        return reply.code(400).send({ error: policy });
      }
      const newHash = await hashPassword(parsed.data.newPassword);
      await req.prisma.users.update({ where: { id: user.id }, data: { passwordHash: newHash } });
      // Every other session of this user dies (stolen-cookie mitigation).
      await endAllSessionsExcept(req.prisma, user.id, req.sessionToken!);
      await audit(req.prisma, {
        userId: user.id,
        action: "auth.password_changed",
        entity: "users",
        entityId: user.id,
        message: "self password change",
      });
      return { ok: true };
    },
  );
}
