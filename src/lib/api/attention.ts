import { attentionReplySchema, type AttentionReply } from "../../../packages/shared/schemas/attention";
import { api } from "./client";

export async function listAttention(): Promise<AttentionReply> {
  return attentionReplySchema.parse(await api<unknown>("/api/attention"));
}

export type { AttentionReply };
