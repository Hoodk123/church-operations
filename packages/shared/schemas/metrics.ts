// Shared response schemas for metrics API calls.
import { z } from "zod";

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
