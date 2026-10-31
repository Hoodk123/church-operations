// Shared request and response schemas for attention API calls.
import { z } from "zod";
import { personApiSchema } from "./people.js";

export const attentionReplySchema = z.object({
  counts: z.object({
    unassigned: z.number().int(),
    notStarted: z.number().int(),
    goneQuiet: z.number().int(),
  }),
  unassigned: z.array(personApiSchema),
  notStarted: z.array(personApiSchema),
  goneQuiet: z.array(personApiSchema),
});

export type AttentionReply = z.output<typeof attentionReplySchema>;
