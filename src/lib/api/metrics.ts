import { volunteerOverviewSchema, type VolunteerOverview } from "../../../packages/shared/schemas/metrics";
import { api } from "./client";

export async function volunteerOverview(): Promise<VolunteerOverview> {
  return volunteerOverviewSchema.parse(await api<unknown>("/api/metrics/volunteers"));
}
