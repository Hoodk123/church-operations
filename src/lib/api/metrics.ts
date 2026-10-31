import {
  homeMetricsSchema,
  peopleOpenPageApiSchema,
  peopleOpenQuerySchema,
  volunteerOverviewSchema,
  type HomeMetrics,
  type PeopleOpenApi,
  type VolunteerOverview,
} from "../../../packages/shared/schemas/metrics";
import { api } from "./client";

export async function homeMetrics(): Promise<HomeMetrics> {
  return homeMetricsSchema.parse(await api<unknown>("/api/metrics"));
}

export async function allOpenPeople(): Promise<PeopleOpenApi[]> {
  const pageSize = 100;
  const query = peopleOpenQuerySchema.parse({ limit: pageSize, offset: 0 });
  const first = peopleOpenPageApiSchema.parse(
    await api<unknown>("/api/metrics/people-open", { query }),
  );
  const items = [...first.items];
  while (items.length < first.total) {
    const nextQuery = peopleOpenQuerySchema.parse({ limit: pageSize, offset: items.length });
    const page = peopleOpenPageApiSchema.parse(
      await api<unknown>("/api/metrics/people-open", { query: nextQuery }),
    );
    if (page.items.length === 0) break;
    items.push(...page.items);
  }
  return items;
}

export async function volunteerOverview(): Promise<VolunteerOverview> {
  return volunteerOverviewSchema.parse(await api<unknown>("/api/metrics/volunteers"));
}
