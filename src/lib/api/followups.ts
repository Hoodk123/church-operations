import { z } from "zod";
import { followUpDashboardApiSchema, followUpsQuerySchema } from "../../../api/schemas/people";
import { api } from "./client";

export async function myFollowUps(date: string) {
  const query = followUpsQuerySchema.parse({ date });
  return followUpDashboardApiSchema.parse(
    await api<unknown>("/api/follow-ups", { query }),
  );
}

export async function undoContactLog(id: string): Promise<void> {
  const validId = z.uuid().parse(id);
  await api<undefined>(`/api/contact-log/${encodeURIComponent(validId)}`, {
    method: "DELETE",
  });
}
