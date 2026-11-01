import { z } from "zod";

export const baptismEventStatusSchema = z.enum(["Scheduled", "Done", "Cancelled"]);

export const baptismCandidateSchema = z.object({
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  location: z.string().nullable(),
  addressDetails: z.string().nullable(),
  contactPreference: z.string().nullable(),
  baptismStatus: z.string().nullable(),
  needsBaptism: z.boolean(),
  m1CompletedAt: z.string().nullable(),
});

export const baptismEventSchema = z.object({
  id: z.uuid(),
  eventDate: z.string(),
  eventTime: z.string().nullable(),
  venue: z.string().nullable(),
  officiant: z.string().nullable(),
  status: baptismEventStatusSchema,
  notes: z.string().nullable(),
  archivedAt: z.string().nullable(),
  createdBy: z.uuid().nullable(),
});

export const baptismRegistrationPersonSchema = z.object({
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  contactPreference: z.string().nullable(),
  addressDetails: z.string().nullable(),
  location: z.string().nullable(),
});

export const baptismRegistrationSchema = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  personId: z.uuid(),
  status: z.enum(["Registered", "Baptized"]),
  baptizedAt: z.string().nullable(),
  person: baptismRegistrationPersonSchema,
});

export const baptismEventInputSchema = z.object({
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  eventTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullish(),
  venue: z.string().max(200).nullish().transform((value) => (value?.trim() ? value.trim() : null)),
  notes: z.string().max(2000).nullish().transform((value) => (value?.trim() ? value.trim() : null)),
  status: baptismEventStatusSchema.default("Scheduled"),
});

export const baptismEventPatchSchema = baptismEventInputSchema.partial().extend({
  archivedAt: z.string().datetime().nullable().optional(),
});

export const baptismRegistrationInputSchema = z.object({
  eventId: z.uuid(),
  personId: z.uuid(),
});

export const baptismCandidatesResponseSchema = z.object({
  items: z.array(baptismCandidateSchema),
});

export const baptismEventsResponseSchema = z.object({
  items: z.array(baptismEventSchema),
});

export const baptismRegistrationsResponseSchema = z.object({
  items: z.array(baptismRegistrationSchema),
});

export type BaptismCandidate = z.infer<typeof baptismCandidateSchema>;
export type BaptismEvent = z.infer<typeof baptismEventSchema>;
export type BaptismRegistration = z.infer<typeof baptismRegistrationSchema>;
export type BaptismRegistrationPerson = z.infer<typeof baptismRegistrationPersonSchema>;
export type BaptismEventInput = z.infer<typeof baptismEventInputSchema>;
export type BaptismEventPatch = z.infer<typeof baptismEventPatchSchema>;
