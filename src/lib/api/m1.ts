import { z } from "zod";
import { api } from "./client";
import {
  m1AbsenceReplyApiSchema,
  m1AbsenceReplyCreateSchema,
  m1AttendanceApiSchema,
  m1AttendanceUpdateSchema,
  m1CertificateIssueSchema,
  m1CertificateOverrideSchema,
  m1ClassApiSchema,
  m1ClassCreateSchema,
  m1ClassUpdateSchema,
  m1EnrollmentApiSchema,
  m1EnrollmentCreateSchema,
  m1MaterialApiSchema,
  m1MessageApiSchema,
  m1MessageCreateSchema,
  m1PersonApiSchema,
  m1PersonSearchApiSchema,
  m1PhoneMatchSchema,
  m1SearchSchema,
  m1SessionApiSchema,
  m1SessionSummarySchema,
  m1WalkInSchema,
  type M1AbsenceReplyApi,
  type M1AttendanceApi,
  type M1ClassApi,
  type M1EnrollmentApi,
  type M1MaterialApi,
  type M1MessageApi,
  type M1PersonApi,
  type M1PersonSearchApi,
  type M1SessionApi,
} from "../../../packages/shared/schemas/m1";

const itemsOf = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item) });
const createdSchema = z.object({ id: z.string().uuid() });

export async function listM1Classes(): Promise<M1ClassApi[]> {
  return itemsOf(m1ClassApiSchema).parse(await api<unknown>("/api/m1/classes")).items;
}

export async function createM1Class(input: z.input<typeof m1ClassCreateSchema>): Promise<string> {
  const body = m1ClassCreateSchema.parse(input);
  return createdSchema.parse(await api<unknown>("/api/m1/classes", { method: "POST", json: body })).id;
}

export async function updateM1Class(
  id: string,
  input: z.input<typeof m1ClassUpdateSchema>,
): Promise<void> {
  const body = m1ClassUpdateSchema.parse(input);
  await api<unknown>(`/api/m1/classes/${encodeURIComponent(id)}`, { method: "PATCH", json: body });
}

export async function deleteM1Class(id: string): Promise<void> {
  await api<unknown>(`/api/m1/classes/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function listM1Sessions(classId: string): Promise<M1SessionApi[]> {
  return itemsOf(m1SessionApiSchema)
    .parse(await api<unknown>(`/api/m1/classes/${encodeURIComponent(classId)}/sessions`)).items;
}

export async function listM1Enrollments(classId: string): Promise<M1EnrollmentApi[]> {
  return itemsOf(m1EnrollmentApiSchema)
    .parse(await api<unknown>(`/api/m1/classes/${encodeURIComponent(classId)}/enrollments`)).items;
}

export async function enrollM1Person(
  classId: string,
  input: z.input<typeof m1EnrollmentCreateSchema>,
): Promise<string> {
  const body = m1EnrollmentCreateSchema.parse(input);
  return createdSchema.parse(
    await api<unknown>(`/api/m1/classes/${encodeURIComponent(classId)}/enrollments`, {
      method: "POST",
      json: body,
    }),
  ).id;
}

export async function listM1Attendance(classId: string): Promise<M1AttendanceApi[]> {
  return itemsOf(m1AttendanceApiSchema)
    .parse(await api<unknown>(`/api/m1/classes/${encodeURIComponent(classId)}/attendance`)).items;
}

export async function updateM1Attendance(
  sessionId: string,
  input: z.input<typeof m1AttendanceUpdateSchema>,
): Promise<{ id?: string }> {
  const body = m1AttendanceUpdateSchema.parse(input);
  const response = z.object({ id: z.string().uuid().optional(), cleared: z.boolean().optional() })
    .parse(await api<unknown>(`/api/m1/sessions/${encodeURIComponent(sessionId)}/attendance`, {
    method: "PATCH",
    json: body,
    }));
  return { id: response.id };
}

export async function closeM1Session(sessionId: string): Promise<void> {
  await api<unknown>(`/api/m1/sessions/${encodeURIComponent(sessionId)}/close`, { method: "POST" });
}

export async function saveM1SessionSummary(sessionId: string, summary: string): Promise<void> {
  const body = m1SessionSummarySchema.parse({ summary });
  await api<unknown>(`/api/m1/sessions/${encodeURIComponent(sessionId)}/summary`, {
    method: "PATCH",
    json: body,
  });
}

export async function issueM1Certificates(enrollmentIds: string[]): Promise<number> {
  const body = m1CertificateIssueSchema.parse({ enrollmentIds });
  const response = z.object({ issued: z.number().int().nonnegative() })
    .parse(await api<unknown>("/api/m1/certificates", { method: "POST", json: body }));
  return response.issued;
}

export async function updateM1CertificateOverride(enrollmentId: string, note: string): Promise<void> {
  const body = m1CertificateOverrideSchema.parse({ note });
  await api<unknown>(`/api/m1/enrollments/${encodeURIComponent(enrollmentId)}/certificate-override`, {
    method: "PATCH",
    json: body,
  });
}

export async function listM1WaitingList(): Promise<M1PersonApi[]> {
  return itemsOf(m1PersonApiSchema).parse(await api<unknown>("/api/m1/waiting-list")).items;
}

export async function searchM1People(query: string): Promise<M1PersonSearchApi[]> {
  const body = m1SearchSchema.parse({ query });
  return itemsOf(m1PersonSearchApiSchema)
    .parse(await api<unknown>("/api/m1/people/search", { method: "POST", json: body })).items;
}

export async function findM1PersonByPhoneSuffix(suffix: string): Promise<M1PersonSearchApi[]> {
  const body = m1PhoneMatchSchema.parse({ suffix });
  return itemsOf(m1PersonSearchApiSchema)
    .parse(await api<unknown>("/api/m1/people/phone-match", { method: "POST", json: body })).items;
}

export async function createM1WalkInPerson(
  input: z.input<typeof m1WalkInSchema>,
): Promise<string> {
  const body = m1WalkInSchema.parse(input);
  return createdSchema.parse(await api<unknown>("/api/m1/people", { method: "POST", json: body })).id;
}

export async function updateM1PersonNeeds(
  personId: string,
  patch: { needsM1?: boolean; needsBaptism?: boolean; needsPastor?: boolean },
): Promise<void> {
  const body = z.object({
    needsM1: z.boolean().optional(),
    needsBaptism: z.boolean().optional(),
    needsPastor: z.boolean().optional(),
  }).parse(patch);
  await api<unknown>(`/api/m1/people/${encodeURIComponent(personId)}/needs`, { method: "PATCH", json: body });
}

export async function listM1Messages(sessionId: string): Promise<M1MessageApi[]> {
  return itemsOf(m1MessageApiSchema)
    .parse(await api<unknown>(`/api/m1/sessions/${encodeURIComponent(sessionId)}/messages`)).items;
}

export async function getM1PersonMessages(personId: string): Promise<M1MessageApi[]> {
  return itemsOf(m1MessageApiSchema)
    .parse(await api<unknown>(`/api/m1/people/${encodeURIComponent(personId)}/messages`)).items;
}

export async function logM1Message(input: z.input<typeof m1MessageCreateSchema>): Promise<void> {
  const body = m1MessageCreateSchema.parse(input);
  await api<unknown>("/api/m1/messages", { method: "POST", json: body });
}

export async function createM1ReplyLink(
  sessionId: string,
  personId: string,
): Promise<{ replyPath: string; materialsPath: string }> {
  const body = z.object({ personId: z.string().uuid() }).parse({ personId });
  return z.object({
    replyPath: z.string(),
    materialsPath: z.string(),
  }).parse(await api<unknown>(`/api/m1/sessions/${encodeURIComponent(sessionId)}/reply-links`, {
    method: "POST",
    json: body,
  }));
}

export async function listM1AbsenceReplies(classId: string): Promise<M1AbsenceReplyApi[]> {
  return itemsOf(m1AbsenceReplyApiSchema)
    .parse(await api<unknown>(`/api/m1/classes/${encodeURIComponent(classId)}/absence-replies`)).items;
}

export async function createM1AbsenceReply(
  input: z.input<typeof m1AbsenceReplyCreateSchema>,
): Promise<void> {
  const body = m1AbsenceReplyCreateSchema.parse(input);
  await api<unknown>("/api/m1/absence-replies", { method: "POST", json: body });
}

export async function listM1Materials(classId: string): Promise<M1MaterialApi[]> {
  return itemsOf(m1MaterialApiSchema)
    .parse(await api<unknown>(`/api/m1/classes/${encodeURIComponent(classId)}/materials`)).items;
}

export async function uploadM1Material(classId: string, file: File): Promise<void> {
  const formData = new FormData();
  formData.append("file", file);
  await api<unknown>(`/api/m1/classes/${encodeURIComponent(classId)}/materials`, {
    method: "POST",
    formData,
  });
}

export async function getM1MaterialUrl(materialId: string): Promise<string> {
  const response = z.object({ url: z.string(), expiresIn: z.number().int() })
    .parse(await api<unknown>(`/api/m1/materials/${encodeURIComponent(materialId)}/signed`));
  return new URL(response.url, window.location.origin).toString();
}

export async function deleteM1Material(materialId: string): Promise<void> {
  await api<unknown>(`/api/m1/materials/${encodeURIComponent(materialId)}`, { method: "DELETE" });
}
