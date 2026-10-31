// Client for the follow-up board API (docs/09 feature order #4).
// GET /api/board is the People read ordered by first name; the move is its own
// PATCH endpoint so the policy can require a dedicated board:move action.
import { z } from "zod";
import { api } from "./client";
import { personApiSchema, followUpStatusSchema, type PersonApi } from "../../../packages/shared/schemas/people";

const boardListSchema = z.object({ items: z.array(personApiSchema) });

export async function listBoard(): Promise<PersonApi[]> {
  const out = await api<unknown>("/api/board");
  return boardListSchema.parse(out).items;
}

export async function moveFollowUpStatus(
  id: string,
  to: z.infer<typeof followUpStatusSchema>,
): Promise<PersonApi> {
  const validId = z.uuid().parse(id);
  followUpStatusSchema.parse(to);
  const out = await api<unknown>(`/api/people/${encodeURIComponent(validId)}/follow-up-status`, {
    method: "PATCH",
    json: { followUpStatus: to },
  });
  return personApiSchema.parse(out);
}
