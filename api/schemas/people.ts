// Domain schemas for People — the single source of truth for route input and
// output validation (docs/09 Phase 3: "zod for every input and output" and
// Phase 4: "Typed client from the shared zod schemas"). The Phase 4 web app
// will import these; wire fields are camelCase and dates are ISO strings.
import { z } from "zod";

export const categorySchema = z.enum(["Visitor", "New Convert", "M1 Class", "Member", "Returning", "Counseling"]);
export const followUpStatusSchema = z.enum(["Not Started", "Contacted", "Met", "Ongoing", "Completed"]);
export const m1StatusSchema = z.enum(["Not Started", "In Progress", "Completed"]);
export const baptismStatusSchema = z.enum(["Not yet", "Scheduled", "Baptized"]);
export const genderSchema = z.enum(["Male", "Female"]);
export const ageGroupSchema = z.enum(["Child", "Youth", "Adult", "Elderly"]);
export const contactPreferenceSchema = z.enum(["WhatsApp", "Email", "SMS", "Call"]);

const nullableTrimmed = z.string().max(200).nullish().transform((v) => {
  const trimmed = v?.trim();
  return trimmed === "" ? null : (trimmed ?? null);
});

const optionalNote = z
  .string()
  .max(3000)
  .nullish()
  .transform((v) => (v === "" ? null : (v ?? null)));

export const personCreateSchema = z.object({
  firstName: z.string().min(1).max(80).transform((v) => v.trim()),
  lastName: z.string().min(1).max(80).transform((v) => v.trim()),
  gender: genderSchema,
  ageGroup: ageGroupSchema.nullish(),
  phone: z.string().max(30),
  location: nullableTrimmed,
  hbfGroup: nullableTrimmed,
  category: categorySchema.default("Visitor"),
  m1Status: m1StatusSchema.nullish(),
  baptismStatus: baptismStatusSchema.nullish(),
  followUpStatus: followUpStatusSchema.default("Not Started"),
  contactPreference: contactPreferenceSchema.nullish(),
  email: z.email().max(200).nullish(),
  addressDetails: nullableTrimmed,
  howFoundChurch: nullableTrimmed,
  assignedTo: z.uuid().nullish(),
  needsPastor: z.boolean().default(false),
  needsM1: z.boolean().default(false),
  needsBaptism: z.boolean().default(false),
  notes: optionalNote,
});

export const personUpdateSchema = z.object({
  firstName: z.string().min(1).max(80).transform((v) => v.trim()).optional(),
  lastName: z.string().min(1).max(80).transform((v) => v.trim()).optional(),
  gender: genderSchema.optional(),
  ageGroup: ageGroupSchema.nullish().optional(),
  phone: z.string().max(30).optional(),
  location: nullableTrimmed.optional(),
  hbfGroup: nullableTrimmed.optional(),
  category: categorySchema.optional(),
  m1Status: m1StatusSchema.nullish().optional(),
  baptismStatus: baptismStatusSchema.nullish().optional(),
  followUpStatus: followUpStatusSchema.optional(),
  contactPreference: contactPreferenceSchema.nullish().optional(),
  email: z.email().max(200).nullish().optional(),
  addressDetails: nullableTrimmed.optional(),
  howFoundChurch: nullableTrimmed.optional(),
  needsPastor: z.boolean().optional(),
  needsM1: z.boolean().optional(),
  needsBaptism: z.boolean().optional(),
  notes: optionalNote.optional(),
});

// `assignedTo` is NOT part of personUpdateSchema: changing it is a separate
// action ("assign") with its own role check (matrix: Assign people).
export const personAssignSchema = z.object({
  assignedTo: z.uuid().nullish().transform((v) => (v === undefined ? undefined : (v ?? null))),
});

// Bulk assign (Attention page): one volunteer, many people at once.
export const bulkAssignSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(100),
  assignedTo: z.uuid().nullish().transform((v) => (v === undefined ? undefined : (v ?? null))),
});

export const contactLogCreateSchema = z.object({
  method: z.enum(["Call", "WhatsApp", "SMS", "Visit", "Other"]),
  outcome: z.enum(["Reached", "No answer", "Scheduled visit", "Needs pastor", "Wrong number"]),
  note: optionalNote,
  finished: z.boolean().default(false),
});

export type PersonCreateInput = z.input<typeof personCreateSchema>;
export type PersonCreateValue = z.output<typeof personCreateSchema>;
export type PersonUpdateValue = z.output<typeof personUpdateSchema>;

// ---- API output shapes -----------------------------------------------------

export const teamMemberApiSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  role: z.enum(["Admin", "Info Desk", "Follow-up Coordinator", "Pastor"]),
});
export type TeamMemberApi = z.output<typeof teamMemberApiSchema>;

export const contactLogApiSchema = z.object({
  id: z.string(),
  personId: z.string(),
  method: z.string(),
  outcome: z.string(),
  note: z.string().nullable(),
  finished: z.boolean(),
  contactedAt: z.string(),
  contactedByName: z.string().nullable(),
});
export type ContactLogApi = z.output<typeof contactLogApiSchema>;

export const personApiSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  gender: z.string(),
  ageGroup: z.string().nullable(),
  phone: z.string(),
  location: z.string().nullable(),
  category: z.string(),
  m1Status: z.string().nullable(),
  hbfGroup: z.string().nullable(),
  howFoundChurch: z.string().nullable(),
  dateRegistered: z.string(),
  assignedTo: z.string().nullable(),
  assignedToName: z.string().nullable(),
  assignedBy: z.string().nullable(),
  followUpStatus: z.string(),
  needsPastor: z.boolean(),
  lastContactDate: z.string().nullable(),
  baptismStatus: z.string().nullable(),
  contactPreference: z.string().nullable(),
  email: z.string().nullable(),
  addressDetails: z.string().nullable(),
  needsM1: z.boolean(),
  needsBaptism: z.boolean(),
  assignedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  // Sensitive: included only when the caller's role allows it (policy).
  notes: z.string().nullable().optional(),
  registeredBy: z.string().nullable(),
  registeredByName: z.string().nullable(),
});
export type PersonApi = z.output<typeof personApiSchema>;

export const personListApiSchema = z.object({
  items: z.array(personApiSchema),
  total: z.number().int(),
});
export type PersonListApi = z.output<typeof personListApiSchema>;

export const personDetailApiSchema = z.object({
  person: personApiSchema,
  contactLogs: z.array(contactLogApiSchema),
  latestEnrollment: z
    .object({
      status: z.string(),
      classTitle: z.string().nullable(),
      enrolledAt: z.string(),
    })
    .nullable(),
});
export type PersonDetailApi = z.output<typeof personDetailApiSchema>;
