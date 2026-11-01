import {
  baptismCandidatesResponseSchema,
  baptismEventInputSchema,
  baptismEventsResponseSchema,
  baptismEventPatchSchema,
  baptismRegistrationsResponseSchema,
  baptismRegistrationInputSchema,
  type BaptismEventInput,
  type BaptismEventPatch,
} from "../../../packages/shared/schemas/baptism";
import { api } from "./client";

export async function fetchBaptismCandidates() {
  return baptismCandidatesResponseSchema.parse(
    await api<unknown>("/api/baptism/candidates"),
  ).items;
}

export async function fetchBaptismEvents() {
  return baptismEventsResponseSchema.parse(
    await api<unknown>("/api/baptism/events"),
  ).items;
}

export async function fetchBaptismRegistrations() {
  return baptismRegistrationsResponseSchema.parse(
    await api<unknown>("/api/baptism/registrations"),
  ).items;
}

export async function createBaptismEvent(input: BaptismEventInput) {
  const body = baptismEventInputSchema.parse(input);
  return api<{ id: string }>("/api/baptism/events", { method: "POST", json: body });
}

export async function updateBaptismEvent(id: string, input: BaptismEventPatch) {
  const body = baptismEventPatchSchema.parse(input);
  await api<{ ok: true }>(`/api/baptism/events/${encodeURIComponent(id)}`, { method: "PATCH", json: body });
}

export async function archiveBaptismEvent(id: string, archivedAt: string | null) {
  await api<{ ok: true }>(`/api/baptism/events/${encodeURIComponent(id)}`, {
    method: "PATCH",
    json: { archivedAt },
  });
}

export async function deleteBaptismEvent(id: string) {
  await api<void>(`/api/baptism/events/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function markBaptismEventDone(id: string) {
  await api<{ ok: true }>(`/api/baptism/events/${encodeURIComponent(id)}/mark-done`, { method: "POST" });
}

export async function registerForBaptism(input: { eventId: string; personId: string }) {
  const body = baptismRegistrationInputSchema.parse(input);
  return api<{ id: string }>("/api/baptism/registrations", { method: "POST", json: body });
}

export async function unregisterFromBaptism(id: string) {
  await api<void>(`/api/baptism/registrations/${encodeURIComponent(id)}`, { method: "DELETE" });
}
