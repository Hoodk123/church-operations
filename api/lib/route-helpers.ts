// Small shared helpers for routes: pagination, current team member,
// date serialization. Kept boring on purpose.
import { z } from "zod";
import type { SessionUser } from "../auth/session.js";
import type { ApiPrisma } from "../db.js";

// docs/09: "query limit max 100, pagination everywhere".
export const pageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export interface CurrentMember {
  id: string;
  fullName: string;
  role: SessionUser["role"];
}

/** The signed-in user's team_members row (users.user_id link; nullable). */
export async function currentMember(prisma: ApiPrisma, user: SessionUser): Promise<CurrentMember | null> {
  const member = await prisma.teamMembers.findFirst({
    where: { userId: user.id },
    select: { id: true, fullName: true, role: true },
  });
  return member ? { id: member.id, fullName: member.fullName, role: member.role } : null;
}

export function isoDate(value: Date): string {
  return value.toISOString();
}

/** A Date-only column rendered as YYYY-MM-DD. */
export function day(value: Date): string {
  return value.toISOString().slice(0, 10);
}
