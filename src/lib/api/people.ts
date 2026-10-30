// People calls (docs/09 Phase 4). Typed from the API's zod schemas —
// the single source of truth lives in api/schemas/people.ts. [local-first]
import { api } from "./client";
import {
  bulkAssignSchema,
  contactLogCreateSchema,
  teamMemberApiSchema,
  personCreateSchema,
  personDetailApiSchema,
  personListApiSchema,
  personApiSchema,
  personAssignSchema,
  type PersonApi,
  type PersonDetailApi,
  type PersonListApi,
  type ContactLogApi,
  type TeamMemberApi,
  type PersonCreateInput,
} from "../../../api/schemas/people";
import { z } from "zod";

const contactLogCreatedSchema = z.object({
  created: z.custom<ContactLogApi>(() => true),
  contactLogs: z.array(z.custom<ContactLogApi>(() => true)),
});

const recentPeopleSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      firstName: z.string(),
      lastName: z.string(),
      category: z.string(),
      createdAt: z.string(),
      updatedAt: z.string(),
      registeredByName: z.string().nullable(),
    })
  ),
});

export type RecentPerson = z.output<typeof recentPeopleSchema>["items"][number];

export type { PersonApi, PersonDetailApi, PersonListApi, ContactLogApi, TeamMemberApi, PersonCreateInput };

export async function listPeople(limit = 100, offset = 0): Promise<PersonListApi> {
  return personListApiSchema.parse(await api<unknown>("/api/people", { query: { limit, offset } }));
}

export async function getPersonDetail(id: string): Promise<PersonDetailApi> {
  return personDetailApiSchema.parse(await api<unknown>(`/api/people/${encodeURIComponent(id)}`));
}

/**
 * Full roster for the people table. The API caps one page at 100 rows
 * (limit/offset only), so page through until `total` is reached and keep the
 * client-side filtering behavior the screens were built on. [local-first]
 */
export async function listAllPeople(): Promise<PersonApi[]> {
  const pageSize = 100;
  const first = await listPeople(pageSize, 0);
  const items = [...first.items];
  while (items.length < first.total) {
    const page = await listPeople(pageSize, items.length);
    if (page.items.length === 0) break; // defensive: never loop forever
    items.push(...page.items);
  }
  return items;
}

export async function createPerson(input: PersonCreateInput): Promise<PersonApi> {
  personCreateSchema.parse(input);
  return personApiSchema.parse(await api<unknown>("/api/people", { method: "POST", json: input }));
}

export async function updatePerson(
  id: string,
  patch: Partial<Omit<PersonCreateInput, "assignedTo">>
): Promise<PersonApi> {
  return personApiSchema.parse(
    await api<unknown>(`/api/people/${encodeURIComponent(id)}`, { method: "PATCH", json: patch })
  );
}

export async function assignPerson(id: string, assignedTo: string | null): Promise<PersonApi> {
  personAssignSchema.parse({ assignedTo }); // validate body shape first
  return personApiSchema.parse(
    await api<unknown>(`/api/people/${encodeURIComponent(id)}/assign`, {
      method: "PATCH",
      json: { assignedTo },
    })
  );
}

export async function bulkAssign(ids: string[], assignedTo: string | null): Promise<{ updated: number }> {
  bulkAssignSchema.parse({ ids, assignedTo });
  return z
    .object({ updated: z.number().int() })
    .parse(await api<unknown>("/api/people/bulk-assign", { method: "PATCH", json: { ids, assignedTo } }));
}

export async function markNewConvert(id: string): Promise<PersonApi> {
  return personApiSchema.parse(
    await api<unknown>(`/api/people/${encodeURIComponent(id)}/mark-new-convert`, { method: "POST" })
  );
}

export async function logContact(
  personId: string,
  input: { method: string; outcome: string; note?: string | null; finished?: boolean }
): Promise<{ created: ContactLogApi; contactLogs: ContactLogApi[] }> {
  const body = contactLogCreateSchema.parse({
    method: input.method,
    outcome: input.outcome,
    note: input.note ?? null,
    finished: input.finished ?? false,
  });
  return contactLogCreatedSchema.parse(
    await api<unknown>(`/api/people/${encodeURIComponent(personId)}/contact-log`, {
      method: "POST",
      json: body,
    })
  );
}

/** Erase one person (rights tool; Admin only per the matrix). */
export async function deletePerson(id: string): Promise<void> {
  await api<undefined>(`/api/people/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function listTeamMembers(): Promise<TeamMemberApi[]> {
  return z.object({ items: z.array(teamMemberApiSchema) }).parse(await api<unknown>("/api/team-members")).items;
}

export async function recentPeople(): Promise<RecentPerson[]> {
  return recentPeopleSchema.parse(await api<unknown>("/api/people-recent")).items;
}

export type { PersonApi as Person } from "../../../api/schemas/people";
export { bulkAssignSchema };
