// Check-in screen data access (docs/09 Phase 4). Mirrors api/routes/checkin.ts
// response shapes; the API zod schemas stay the authority, ours parse inputs
// before sending and outputs before use. [local-first]
import { z } from 'zod';
import { api, ApiError } from './client';

// ---- Output shapes -----------------------------------------------------------

const personMiniSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  category: z.string(),
});

const searchItemSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string(),
  category: z.string(),
  location: z.string().nullable(),
  checkedInAt: z.string().nullable(),
});

const todayItemSchema = z.object({
  id: z.string(),
  checkedInAt: z.string(),
  checkedInBy: z.string(),
  person: personMiniSchema,
});

const expectedItemSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  category: z.string(),
  location: z.string().nullable(),
});

const checkinCreatedSchema = z.object({
  id: z.string(),
  checkedInAt: z.string(),
  person: personMiniSchema,
});

const newVisitorResponseSchema = z.object({
  person: personMiniSchema,
  attendanceId: z.string(),
  checkedInAt: z.string(),
  isDuplicate: z.boolean(),
});

export type CheckinSearchRow = z.infer<typeof searchItemSchema>;
export type AttendanceRow = z.infer<typeof todayItemSchema>;
export type ExpectedPerson = z.infer<typeof expectedItemSchema>;

export interface NewVisitorCandidate {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
}

const candidateSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string(),
});

// ---- Input shape (mirror of api/routes/checkin.ts newVisitorSchema) ----------

export interface NewVisitorInput {
  firstName: string;
  lastName: string;
  phone: string;
  gender: 'Male' | 'Female';
  ageGroup?: 'Child' | 'Youth' | 'Adult' | 'Elderly' | null;
  location?: string | null;
  howFoundChurch?: string | null;
  giveToChrist: boolean;
}

const newVisitorInputSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  phone: z.string().min(1).max(30),
  gender: z.enum(['Male', 'Female']),
  ageGroup: z.enum(['Child', 'Youth', 'Adult', 'Elderly']).nullish(),
  location: z.string().max(200).nullish(),
  howFoundChurch: z.string().max(200).nullish(),
  giveToChrist: z.boolean(),
});

// ---- Calls ---------------------------------------------------------------------

export async function searchPeople(q: string): Promise<CheckinSearchRow[]> {
  const body = await api<{ items: unknown[] }>('/api/checkin/search', { query: { q } });
  return z.object({ items: z.array(searchItemSchema) }).parse(body).items;
}

export async function todayAttendance(): Promise<AttendanceRow[]> {
  const body = await api<{ items: unknown[] }>('/api/checkin/today');
  return z.object({ items: z.array(todayItemSchema) }).parse(body).items;
}

export async function expectedToday(): Promise<ExpectedPerson[]> {
  const body = await api<{ items: unknown[] }>('/api/checkin/expected-today');
  return z.object({ items: z.array(expectedItemSchema) }).parse(body).items;
}

export async function checkIn(personId: string): Promise<void> {
  const body = await api('/api/checkin', { method: 'POST', json: { personId } });
  checkinCreatedSchema.parse(body);
}

export async function undoCheckin(attendanceId: string): Promise<void> {
  await api(`/api/checkin/${attendanceId}`, { method: 'DELETE' });
}

/**
 * Registers a visitor and checks them in. Resolves on success; on a
 * phone-duplicate (409 "similar visitor exists") resolves with the candidate
 * list instead of throwing, so the caller can show the "check in anyway" flow.
 */
export async function registerNewVisitor(
  input: NewVisitorInput
): Promise<{ kind: 'created'; personId: string; name: string } | { kind: 'duplicate'; candidates: NewVisitorCandidate[] }> {
  const valid = newVisitorInputSchema.parse(input);
  const body = await api<unknown>('/api/checkin/new-visitor', { method: 'POST', json: valid });
  const created = newVisitorResponseSchema.parse(body);
  const name = `${created.person.firstName} ${created.person.lastName}`.trim();
  return { kind: 'created', personId: created.person.id, name };
}

/** Extracts the 409 duplicate candidates from a registerNewVisitor failure. */
export function duplicateCandidates(error: unknown): NewVisitorCandidate[] {
  if (!(error instanceof ApiError) || error.status !== 409) return [];
  const body = error.body as { error?: unknown; candidates?: unknown } | null;
  if (!body || body.error !== 'similar visitor exists' || !Array.isArray(body.candidates)) return [];
  const parsed = z.array(candidateSchema).safeParse(body.candidates);
  return parsed.success ? parsed.data : [];
}
