// Session/cookie handling for the API (docs/09 Phase 3 "Auth").
// - The cookie holds a random token; the DB stores only its SHA-256 hash.
// - Absolute timeout via sessions.expires_at; idle timeout via last_seen_at
//   (bumped at most once a minute so reads stay cheap).
// - No tokens in localStorage anywhere; the browser keeps only the cookie.
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { ApiPrisma } from "../db.js";
import type { Users } from "../../src/generated/prisma/client.js";

export const SESSION_COOKIE = "ch_sess";
export const CSRF_COOKIE = "ch_csrf";

export type SessionUser = Pick<Users, "id" | "email" | "role" | "active">;

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

export function newCsrfToken(): string {
  return randomUUID().replace(/-/g, "");
}

export function csrfMatches(cookieValue: string | undefined, headerValue: string | undefined): boolean {
  if (!cookieValue || !headerValue) return false;
  const a = Buffer.from(cookieValue);
  const b = Buffer.from(headerValue);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface ResolvedSession {
  user: SessionUser;
  token: string;
}

export async function startSession(
  prisma: ApiPrisma,
  userId: string,
  meta: { ip: string; userAgent?: string; absoluteHours: number },
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + meta.absoluteHours * 3_600_000);
  await prisma.sessions.create({
    data: {
      id: hashSessionToken(token),
      userId,
      expiresAt,
      ipHash: hashIp(meta.ip),
      userAgent: meta.userAgent?.slice(0, 200),
    },
  });
  return { token, expiresAt };
}

export async function resolveSession(
  prisma: ApiPrisma,
  token: string,
  idleMs: number,
): Promise<ResolvedSession | null> {
  const row = await prisma.sessions.findUnique({
    where: { id: hashSessionToken(token) },
    include: { user: true },
  });
  if (!row) return null;
  const now = Date.now();
  if (row.expiresAt.getTime() <= now) return null;
  if (row.user.active !== true) return null;
  const idle = now - row.lastSeenAt.getTime();
  if (idle > idleMs) return null;
  // Bump last_seen at most once a minute; failures here still grant this
  // request, the next one retries the update.
  if (idle > 60_000) {
    try {
      await prisma.sessions.update({ where: { id: row.id }, data: { lastSeenAt: new Date() } });
    } catch {
      // already gone by concurrent logout — treat as expired
      return null;
    }
  }
  return { user: { id: row.user.id, email: row.user.email, role: row.user.role, active: row.user.active }, token };
}

export async function endSession(prisma: ApiPrisma, token: string): Promise<void> {
  await prisma.sessions.deleteMany({ where: { id: hashSessionToken(token) } });
}

export async function endAllSessionsExcept(prisma: ApiPrisma, userId: string, keepToken: string): Promise<void> {
  await prisma.sessions.deleteMany({
    where: { userId, NOT: { id: hashSessionToken(keepToken) } },
  });
}
