// Home metrics + volunteer overview (docs/09 feature order #5).
// Mirrors Home.tsx `fetchCounts` (all HEAD-count Supabase queries) and the
// exact SQL of public.get_volunteer_overview() (Admin/overseer rows only).
// Calendar math is done with the database's own clock (current_date/dow) so
// "today", "week start" and "prev Sunday" match the rows' service_date values.
import type { FastifyInstance } from "fastify";
import type { UserRole } from "../../src/generated/prisma/client.js";
import { asCategory, humanize } from "../lib/enums.js";
import { isoDate } from "../lib/route-helpers.js";

type DB = import("../db.js").ApiPrisma;

type HomeDates = {
  today: Date;
  prevSunday: Date;
  weekStart: Date;
  weekStartMonday: Date;
};

/** current_date, the previous Sunday, the Sunday week start, and Monday week start. */
async function homeDates(prisma: DB): Promise<HomeDates> {
  const rows = await prisma.$queryRaw<
    Array<{ today: string; prevSunday: string; weekStart: string; weekStartMonday: string }>
  >`
    SELECT to_char(current_date, 'YYYY-MM-DD') AS today,
           to_char(current_date - (CASE WHEN EXTRACT(dow FROM current_date) = 0 THEN 7 ELSE EXTRACT(dow FROM current_date) END)::int, 'YYYY-MM-DD') AS "prevSunday",
           to_char(current_date - EXTRACT(dow FROM current_date)::int, 'YYYY-MM-DD') AS "weekStart",
           to_char(current_date - (EXTRACT(isodow FROM current_date)::int - 1), 'YYYY-MM-DD') AS "weekStartMonday"`;
  const first = rows[0];
  if (!first) throw new Error("internal: cannot read home dates");
  return {
    today: calendarDate(first.today),
    prevSunday: calendarDate(first.prevSunday),
    weekStart: calendarDate(first.weekStart),
    weekStartMonday: calendarDate(first.weekStartMonday),
  };
}

/** YYYY-MM-DD -> UTC midnight Date (Prisma stores Date @db.Date as the date part). */
function calendarDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function registerMetricsRoutes(app: FastifyInstance): Promise<void> {
  // ---- All dashboard counters in one round trip -----------------------------
  app.get("/api/metrics", { config: { access: "auth", action: "metrics:read" } }, async (req) => {
    const dates = await homeDates(req.prisma);
    const [attendanceToday, attendanceLastSunday, visitorsWeek, convertsWeek, contactedWeek, waitingM1, needBaptism] =
      await req.prisma.$transaction([
        req.prisma.attendance.count({ where: { serviceDate: dates.today } }),
        req.prisma.attendance.count({ where: { serviceDate: dates.prevSunday } }),
        req.prisma.people.count({ where: { category: asCategory("Visitor"), dateRegistered: { gte: dates.weekStart } } }),
        req.prisma.people.count({ where: { category: asCategory("New Convert"), dateRegistered: { gte: dates.weekStart } } }),
        req.prisma.contactLog.count({ where: { contactedAt: { gte: dates.weekStart } } }),
        req.prisma.people.count({ where: { needsM1: true } }),
        req.prisma.people.count({ where: { needsBaptism: true, baptismStatus: { not: "Baptized" } } }),
      ]);
    const latest = await req.prisma.people.findFirst({
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    });
    return {
      attendanceToday,
      attendanceLastSunday,
      visitorsWeek,
      convertsWeek,
      contactedWeek,
      waitingM1,
      needBaptism,
      lastPersonUpdatedAt: latest ? latest.updatedAt.toISOString() : null,
    };
  });

  // ---- Open follow-up list (the Home "needs attention" list) -----------------
  app.get("/api/metrics/people-open", { config: { access: "auth", action: "metrics:read" } }, async (req) => {
    const rows = await req.prisma.people.findMany({
      where: { followUpStatus: { not: "Completed" } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        followUpStatus: true,
        dateRegistered: true,
        lastContactDate: true,
        assignedTo: true,
        needsPastor: true,
      },
      orderBy: [{ createdAt: "desc" }],
      take: 100,
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
        followUpStatus: humanize("FollowUpStatus", row.followUpStatus) ?? "",
        dateRegistered: row.dateRegistered ? row.dateRegistered.toISOString().slice(0, 10) : null,
        lastContactDate: row.lastContactDate ? row.lastContactDate.toISOString().slice(0, 10) : null,
        assignedTo: row.assignedTo,
        needsPastor: row.needsPastor ?? false,
      })),
    };
  });

  // ---- Volunteer overview (port of public.get_volunteer_overview) ------------
  app.get("/api/metrics/volunteers", { config: { access: "auth", action: "metrics:volunteers" } }, async (req) => {
    const dates = await homeDates(req.prisma);
    const overseerRoles: UserRole[] = ["Admin", "FollowUpCoordinator", "Pastor"];
    const overseers = await req.prisma.teamMembers.findMany({
      where: { role: { in: overseerRoles } },
      select: { id: true, fullName: true, role: true },
      orderBy: [{ fullName: "asc" }],
    });
    if (overseers.length === 0) {
      return { items: [] };
    }
    const overseerIds = overseers.map((o) => o.id);
    const [assignedRows, weekContactRows, lastContactRows] = await req.prisma.$transaction([
      req.prisma.people.findMany({
        where: { assignedTo: { in: overseerIds } },
        select: { assignedTo: true, followUpStatus: true, dateRegistered: true, lastContactDate: true },
      }),
      req.prisma.contactLog.groupBy({
        where: { contactedBy: { in: overseerIds }, contactedAt: { gte: dates.weekStartMonday } },
        by: ["contactedBy"],
        _count: { _all: true },
      }),
      req.prisma.contactLog.groupBy({
        where: { contactedBy: { in: overseerIds } },
        by: ["contactedBy"],
        _max: { contactedAt: true },
      }),
    ]);

    const weekContacts = new Map<string, number>(weekContactRows.map((row) => [row.contactedBy, row._count._all]));
    const lastContacts = new Map<string, Date | null>(
      lastContactRows.map((row) => [row.contactedBy, row._max.contactedAt]),
    );

    const items = overseers.map((o) => {
      const mine = assignedRows.filter((p) => p.assignedTo === o.id);
      const assigned = mine.filter((p) => p.followUpStatus !== "Completed").length;
      const overdue = mine.filter((p) => {
        if (p.followUpStatus === "Completed") return false;
        const status = humanize("FollowUpStatus", p.followUpStatus);
        if (status === "Not Started") {
          return p.dateRegistered !== null && p.dateRegistered.getTime() < dates.today.getTime() - 3 * MS_PER_DAY;
        }
        if (status === "Contacted" || status === "Met" || status === "Ongoing") {
          return (
            p.lastContactDate !== null &&
            p.lastContactDate.getTime() < dates.today.getTime() - 14 * MS_PER_DAY
          );
        }
        return false;
      }).length;
      const lastActive = lastContacts.get(o.id) ?? null;
      return {
        id: o.id,
        fullName: o.fullName,
        role: humanize("UserRole", o.role) ?? "",
        assigned,
        contactedThisWeek: weekContacts.get(o.id) ?? 0,
        overdue,
        lastActive: lastActive === null ? null : isoDate(lastActive),
      };
    });
    return { items };
  });
}
