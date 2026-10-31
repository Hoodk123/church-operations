// Needs-Attention endpoint (docs/04 Screen 5). Three groups, computed in the
// database:
//   1. Unassigned            — assigned_to is null
//   2. Not started > 3 days  — follow_up_status = "Not Started" and
//                              date_registered < today - 3 days
//   3. Gone quiet            — status Contacted/Met/Ongoing and
//                              last_contact_date < today - 14 days
// Row scope: Follow-up Coordinators see only people assigned to them; other
// roles with people:read see the full lists (docs/04: "Other roles see the
// lists read-only"; Admin bulk-assigns through the existing assign routes).
import type { FastifyInstance } from "fastify";
import { FollowUpStatus } from "../../src/generated/prisma/client.js";
import { currentMember } from "../lib/route-helpers.js";
import { attentionReplySchema } from "../schemas/attention.js";
import { PERSON_INCLUDE, serializePerson } from "./people.js";

const QUIET_STATUSES = [
  FollowUpStatus.Contacted,
  FollowUpStatus.Met,
  FollowUpStatus.Ongoing,
];

function daysAgo(days: number): Date {
  return new Date(new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10));
}

export function registerAttentionRoutes(app: FastifyInstance): void {
  app.get("/api/attention", { config: { access: "auth", action: "attention:read" } }, async (req) => {
    // Row scope for coordinators: only their assigned people, so the counts
    // stay consistent with their My Follow-ups view.
    const member = await currentMember(req.prisma, req.user!);
    const isCoordinator = req.roleName === "Follow-up Coordinator";
    if (isCoordinator && !member) {
      return attentionReplySchema.parse({
        counts: { unassigned: 0, notStarted: 0, goneQuiet: 0 },
        unassigned: [],
        notStarted: [],
        goneQuiet: [],
      });
    }
    const scope: { assignedTo?: string } = isCoordinator && member ? { assignedTo: member.id } : {};

    const unassignedRows = isCoordinator
      ? []
      : await req.prisma.people.findMany({
          where: { assignedTo: null },
          include: PERSON_INCLUDE,
          orderBy: { dateRegistered: "asc" },
          take: 100,
        });
    const notStartedRows = await req.prisma.people.findMany({
      where: { ...scope, followUpStatus: "NotStarted", dateRegistered: { lt: daysAgo(3) } },
      include: PERSON_INCLUDE,
      orderBy: { dateRegistered: "asc" },
      take: 100,
    });
    const goneQuietRows = await req.prisma.people.findMany({
      where: { ...scope, followUpStatus: { in: QUIET_STATUSES }, lastContactDate: { lt: daysAgo(14) } },
      include: PERSON_INCLUDE,
      orderBy: { lastContactDate: "asc" },
      take: 100,
    });

    return attentionReplySchema.parse({
      counts: {
        unassigned: unassignedRows.length,
        notStarted: notStartedRows.length,
        goneQuiet: goneQuietRows.length,
      },
      unassigned: unassignedRows.map((row) => serializePerson(row, false)),
      notStarted: notStartedRows.map((row) => serializePerson(row, false)),
      goneQuiet: goneQuietRows.map((row) => serializePerson(row, false)),
    });
  });
}
