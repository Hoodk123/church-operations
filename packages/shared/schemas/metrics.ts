// Shared response schemas for metrics API calls.
import { z } from "zod";

const metricCountSchema = z.number().int().nonnegative();

export const homeMetricsSchema = z.object({
  attendanceToday: metricCountSchema,
  attendanceLastSunday: metricCountSchema,
  visitorsWeek: metricCountSchema,
  convertsWeek: metricCountSchema,
  contactedWeek: metricCountSchema,
  waitingM1: metricCountSchema,
  needBaptism: metricCountSchema,
  lastPersonUpdatedAt: z.string().nullable(),
});
export type HomeMetrics = z.output<typeof homeMetricsSchema>;

export const peopleOpenQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export const peopleOpenPageApiSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      firstName: z.string(),
      lastName: z.string(),
      followUpStatus: z.string(),
      dateRegistered: z.string().nullable(),
      lastContactDate: z.string().nullable(),
      assignedTo: z.string().nullable(),
      needsPastor: z.boolean(),
    }),
  ),
  total: z.number().int().nonnegative(),
});
export type PeopleOpenPageApi = z.output<typeof peopleOpenPageApiSchema>;
export type PeopleOpenApi = PeopleOpenPageApi["items"][number];

export const volunteerOverviewSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      fullName: z.string(),
      role: z.string(),
      assigned: z.number().int(),
      contactedThisWeek: z.number().int(),
      overdue: z.number().int(),
      lastActive: z.string().nullable(),
    })
  ),
});

export type VolunteerOverview = z.output<typeof volunteerOverviewSchema>;
