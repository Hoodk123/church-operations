import { z } from "zod";

export const m1PersonApiSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  location: z.string().nullable(),
  addressDetails: z.string().nullable(),
  gender: z.string(),
  ageGroup: z.string().nullable(),
  contactPreference: z.string().nullable(),
  category: z.string(),
  m1Status: z.string().nullable(),
  baptismStatus: z.string().nullable(),
  needsM1: z.boolean(),
  needsBaptism: z.boolean(),
  needsPastor: z.boolean(),
});

export const m1PersonSearchApiSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().nullable(),
  ageGroup: z.string().nullable(),
  location: z.string().nullable(),
});

export const m1ClassApiSchema = z.object({
  id: z.string(),
  title: z.string(),
  venue: z.string().nullable(),
  requiredDays: z.number().int(),
  status: z.string(),
  archivedAt: z.string().nullable(),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
});

export const m1SessionApiSchema = z.object({
  id: z.string(),
  classId: z.string(),
  dayNumber: z.number().int(),
  sessionDate: z.string(),
  startTime: z.string().nullable(),
  topic: z.string().nullable(),
  summary: z.string().nullable(),
  closed: z.boolean(),
});

export const m1EnrollmentApiSchema = z.object({
  id: z.string(),
  classId: z.string(),
  personId: z.string(),
  enrolledAt: z.string(),
  walkIn: z.boolean(),
  status: z.string(),
  certificateNo: z.string().nullable(),
  certificateIssuedAt: z.string().nullable(),
  certificateOverrideNote: z.string().nullable(),
  person: m1PersonApiSchema,
});

export const m1AttendanceApiSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  personId: z.string(),
  status: z.enum(["Present", "Absent", "Excused"]),
});

export const m1MessageApiSchema = z.object({
  personId: z.string(),
  sentAt: z.string(),
  purpose: z.string(),
  channel: z.string(),
  senderName: z.string().nullable().optional(),
});

export const m1AbsenceReplyApiSchema = z.object({
  personId: z.string(),
  sessionId: z.string(),
  reason: z.string(),
  note: z.string().nullable(),
  createdAt: z.string(),
  firstName: z.string(),
  lastName: z.string(),
});

export const m1MaterialApiSchema = z.object({
  id: z.string(),
  classId: z.string(),
  sessionId: z.string().nullable(),
  title: z.string(),
  mimeType: z.string().nullable(),
  sizeBytes: z.number().nullable(),
  createdAt: z.string(),
  uploader: z.string().nullable(),
});

export const m1ClassCreateSchema = z.object({
  title: z.string().min(1).max(120),
  venue: z.string().max(120).nullable(),
  requiredDays: z.number().int().min(1).max(10),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  firstDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const m1ClassUpdateSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  venue: z.string().max(120).nullable().optional(),
  status: z.enum(["Open", "Closed"]).optional(),
  archived: z.boolean().optional(),
  sessions: z.array(z.object({
    id: z.string().uuid(),
    sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  })).max(10).optional(),
});

export const m1EnrollmentCreateSchema = z.object({
  personId: z.string().uuid(),
  walkIn: z.boolean().default(false),
});

export const m1AttendanceUpdateSchema = z.object({
  personId: z.string().uuid(),
  status: z.enum(["Present", "Absent", "Excused"]).nullable(),
});

export const m1SearchSchema = z.object({
  query: z.string().trim().min(1).max(120),
});

export const m1PhoneMatchSchema = z.object({
  suffix: z.string().regex(/^\d{1,9}$/),
});

export const m1WalkInSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  gender: z.enum(["Male", "Female"]).nullable(),
  ageGroup: z.enum(["Child", "Youth", "Adult", "Elderly"]).nullable(),
  phone: z.string().min(1).max(30),
  email: z.string().email().max(200).nullable(),
  location: z.string().max(200).nullable(),
  addressDetails: z.string().max(200).nullable(),
  contactPreference: z.enum(["WhatsApp", "Email", "SMS", "Call"]),
});

export const m1MessageCreateSchema = z.object({
  personId: z.string().uuid(),
  classId: z.string().uuid().nullable(),
  sessionId: z.string().uuid().nullable(),
  purpose: z.enum(["reminder", "catch_up", "materials", "certificate", "baptism", "other"]),
  channel: z.enum(["WhatsApp", "Email", "SMS", "Call"]),
});

export const m1AbsenceReplyCreateSchema = z.object({
  sessionId: z.string().uuid(),
  personId: z.string().uuid(),
  reason: z.enum(["Work", "Sick", "Transport", "Family", "Forgot", "Evening", "Other"]),
  note: z.string().max(3000).nullable(),
});

export const m1CertificateIssueSchema = z.object({
  enrollmentIds: z.array(z.string().uuid()).min(1).max(100),
});

export const m1CertificateOverrideSchema = z.object({
  note: z.string().max(3000),
});

export const m1SessionSummarySchema = z.object({
  summary: z.string().max(3000).nullable(),
});

export type M1PersonApi = z.output<typeof m1PersonApiSchema>;
export type M1PersonSearchApi = z.output<typeof m1PersonSearchApiSchema>;
export type M1ClassApi = z.output<typeof m1ClassApiSchema>;
export type M1SessionApi = z.output<typeof m1SessionApiSchema>;
export type M1EnrollmentApi = z.output<typeof m1EnrollmentApiSchema>;
export type M1AttendanceApi = z.output<typeof m1AttendanceApiSchema>;
export type M1MessageApi = z.output<typeof m1MessageApiSchema>;
export type M1AbsenceReplyApi = z.output<typeof m1AbsenceReplyApiSchema>;
export type M1MaterialApi = z.output<typeof m1MaterialApiSchema>;
