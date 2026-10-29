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
import type { Prisma } from "../../src/generated/prisma/client.js";
import { FollowUpStatus } from "../../src/generated/prisma/client.js";
import { z } from "zod";
import { currentMember, isoDate } from "../lib/route-helpers.js";
import { humanize } from "../lib/enums.js";

const attentionItemSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string(),
  followUpStatus: z.string(),
  dateRegistered: z.string(),
  lastContactDate: z.string().nullable(),
  assignedTo: z.string().nullable(),
  assignedToName: z.string().nullable(),
});
export type AttentionItem = z.infer<typeof attentionItemSchema>;

const attentionReplySchema = z.object({
  counts: z.object({
    unassigned: z.number().int(),
    notStarted: z.number().int(),
    goneQuiet: z.number().int(),
  }),
  unassigned: z.array(attentionItemSchema),
  notStarted: z.array(attentionItemSchema),
  goneQuiet: z.array(attentionItemSchema),
});

const QUIET_STATUSES = [
  FollowUpStatus.Contacted,
  FollowUpStatus.Met,
  FollowUpStatus.Ongoing,
];

const ATTENTION_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  phone: true,
  followUpStatus: true,
  dateRegistered: true,
  lastContactDate: true,
  assignedTo: true,
  assignee: { select: { fullName: true } },
} as const satisfies Prisma.PeopleSelect;

type AttentionRow = Prisma.PeopleGetPayload<{ select: typeof ATTENTION_SELECT }>;

function daysAgo(days: number): Date {
  return new Date(new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10));
}

export function registerAttentionRoutes(app: FastifyInstance): void {
  app.get("/api/attention", { config: { access: "auth", action: "attention:read" } }, async (req) => {
    // Row scope for coordinators: only their assigned people, so the counts
    // stay consistent with their My Follow-ups view.
    const member = await currentMember(req.prisma, req.user!);
    const scope: { assignedTo?: string } =
      req.roleName === "Follow-up Coordinator" && member
        ? { assignedTo: member.id }
        : {};

    const unassignedRows: AttentionRow[] = await req.prisma.people.findMany({
      where: { ...scope, assignedTo: null },
      select: ATTENTION_SELECT,
      orderBy: { dateRegistered: "asc" },
      take: 100,
    });
    const notStartedRows: AttentionRow[] = await req.prisma.people.findMany({
      where: { ...scope, followUpStatus: "NotStarted", dateRegistered: { lt: daysAgo(3) } },
      select: ATTENTION_SELECT,
      orderBy: { dateRegistered: "asc" },
      take: 100,
    });
    const goneQuietRows: AttentionRow[] = await req.prisma.people.findMany({
      where: { ...scope, followUpStatus: { in: QUIET_STATUSES }, lastContactDate: { lt: daysAgo(14) } },
      select: ATTENTION_SELECT,
      orderBy: { lastContactDate: "asc" },
      take: 100,
    });

    const toItem = (row: AttentionRow): AttentionItem => ({
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      phone: row.phone,
      followUpStatus: humanize("FollowUpStatus", row.followUpStatus) ?? row.followUpStatus,
      dateRegistered: isoDate(row.dateRegistered),
      lastContactDate: row.lastContactDate ? isoDate(row.lastContactDate) : null,
      assignedTo: row.assignedTo,
      assignedToName: row.assignee?.fullName ?? null,
    });

    return attentionReplySchema.parse({
      counts: {
        unassigned: unassignedRows.length,
        notStarted: notStartedRows.length,
        goneQuiet: goneQuietRows.length,
      },
      unassigned: unassignedRows.map(toItem),
      notStarted: notStartedRows.map(toItem),
      goneQuiet: goneQuietRows.map(toItem),
    });
  });
}
