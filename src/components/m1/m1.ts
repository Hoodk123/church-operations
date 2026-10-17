import type { SupabaseClient } from '@supabase/supabase-js';
import { CHURCH_NAME } from '@/lib/church';
import { todayISO } from '@/lib/dates';

export interface M1Person {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  location: string | null;
  address_details: string | null;
  gender: string | null;
  age_group: string | null;
  contact_preference: string | null;
  category: string | null;
  m1_status: string | null;
  baptism_status: string | null;
  needs_m1: boolean;
  needs_baptism: boolean;
  needs_pastor: boolean;
}

export interface M1Class {
  id: string;
  title: string;
  venue: string | null;
  required_days: number;
  status: string;
  archived_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface M1Session {
  id: string;
  class_id: string;
  day_number: number;
  session_date: string;
  start_time: string | null;
  topic: string | null;
  summary: string | null;
  closed: boolean;
}

export interface M1Enrollment {
  id: string;
  class_id: string;
  person_id: string;
  enrolled_at: string;
  walk_in: boolean;
  status: string;
  certificate_no: string | null;
  certificate_issued_at?: string | null;
  certificate_override_note?: string | null;
  people: M1Person;
}

export interface M1Attendance {
  id: string;
  session_id: string;
  person_id: string;
  status: string;
  people?: M1Person | null;
}

export interface AbsenceReply {
  id: string;
  session_id: string;
  person_id: string;
  reason: string;
  note: string | null;
  created_at: string;
}

export interface MessageLogRow {
  id: string;
  purpose: string;
  channel: string;
  sent_at: string;
}

/** Day tiles are drawn from the sessions already scheduled for the class. */
export const DEFAULT_VENUE = CHURCH_NAME;
export const DEFAULT_START_TIME = '17:00';
export const DEFAULT_REQUIRED_DAYS = 6;

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function fmtDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const date = new Date(y!, m! - 1, d!);
  return `${DAY_SHORT[date.getDay()]} ${d} ${MONTH_SHORT[date.getMonth()]}`;
}

export function fmtDateFull(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function fmtTime(time: string | null): string {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const hour = h ?? 0;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const show = hour % 12 === 0 ? 12 : hour % 12;
  return `${show}${m ? `:${String(m).padStart(2, '0')}` : ''} ${suffix}`;
}

/** The next date whose weekday matches today being a Sunday => next Sunday. */
export function nextSundayISO(): string {
  const now = new Date();
  const target = new Date(now);
  const daysUntilSunday = (7 - now.getDay()) % 7 || 7;
  target.setDate(now.getDate() + daysUntilSunday);
  const y = target.getFullYear();
  const m = String(target.getMonth() + 1).padStart(2, '0');
  const d = String(target.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const date = new Date(y!, m! - 1, d!);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

export function personName(person: Pick<M1Person, 'first_name' | 'last_name'>): string {
  return `${person.first_name} ${person.last_name}`;
}

export async function fetchClassSessions(
  supabase: SupabaseClient,
  classId: string
): Promise<M1Session[]> {
  const { data } = await supabase
    .from('m1_sessions')
    .select('*')
    .eq('class_id', classId)
    .order('day_number', { ascending: true });
  return data ?? [];
}

export async function fetchEnrollments(
  supabase: SupabaseClient,
  classId: string
): Promise<M1Enrollment[]> {
  const { data } = await supabase
    .from('m1_enrollments')
    .select(
      'id, class_id, person_id, enrolled_at, walk_in, status, certificate_no, certificate_issued_at, people(id, first_name, last_name, phone, email, location, address_details, gender, age_group, contact_preference, category, m1_status, baptism_status, needs_m1, needs_baptism, needs_pastor)'
    )
    .eq('class_id', classId)
    .order('enrolled_at', { ascending: true });
  return (data ?? []) as unknown as M1Enrollment[];
}

export async function fetchAttendance(
  supabase: SupabaseClient,
  classId: string
): Promise<Record<string, { id: string; session_id: string; person_id: string; status: string }[]>> {
  const sessions = await fetchClassSessions(supabase, classId);
  const ids = sessions.map((s) => s.id);
  if (ids.length === 0) return {};
  const { data } = await supabase
    .from('m1_attendance')
    .select('id, session_id, person_id, status')
    .in('session_id', ids);
  const bySession: Record<string, { id: string; session_id: string; person_id: string; status: string }[]> = {};
  for (const row of data ?? []) {
    (bySession[row.session_id] ??= []).push(row);
  }
  return bySession;
}

/**
 * Count Present markers per person across every day of a class. Used by the
 * Enrolled tab (progress bar) and by close-class / verify.
 */
export async function fetchPresentCounts(
  supabase: SupabaseClient,
  classId: string
): Promise<Record<string, number>> {
  const sessions = await fetchClassSessions(supabase, classId);
  const ids = sessions.map((s) => s.id);
  if (ids.length === 0) return {};
  const { data } = await supabase
    .from('m1_attendance')
    .select('person_id')
    .in('session_id', ids)
    .eq('status', 'Present');
  const counts: Record<string, number> = {};
  for (const row of data ?? []) counts[row.person_id] = (counts[row.person_id] ?? 0) + 1;
  return counts;
}

/**
 * Numbers for the four M1 stat tiles. Read straight from the database so the
 * tiles never guess: enrolled count, today's present count, waiting list size
 * and how many enrolled people have missed a closed day.
 */
export interface M1ClassStats {
  enrolled: number;
  waiting: number;
  missed: number;
  materials: number;
  days: number;
  activeDay: number | null;
  activePresent: number;
}

export async function fetchClassStats(
  supabase: SupabaseClient,
  classId: string
): Promise<M1ClassStats> {
  const [sessions, attendanceBySession, enrollments, waiting, materials] = await Promise.all([
    fetchClassSessions(supabase, classId),
    fetchAttendance(supabase, classId),
    fetchEnrollments(supabase, classId),
    supabase.rpc('m1_waiting_list'),
    supabase.from('m1_materials').select('id').eq('class_id', classId),
  ]);
  const enrolled = enrollments.filter((e) => e.status === 'Enrolled');
  const enrolledIds = new Set(enrolled.map((e) => e.person_id));
  const activeSession = sessions.find((s) => !s.closed) ?? sessions[0] ?? null;
  const activeRows = activeSession ? (attendanceBySession[activeSession.id] ?? []) : [];
  const activePresent = activeRows.filter((r) => r.status === 'Present').length;
  const closedIds = new Set(sessions.filter((s) => s.closed).map((s) => s.id));
  const missed = new Set<string>();
  for (const [sessionId, rows] of Object.entries(attendanceBySession)) {
    if (!closedIds.has(sessionId)) continue;
    for (const row of rows) {
      if (row.status === 'Absent' && enrolledIds.has(row.person_id)) missed.add(row.person_id);
    }
  }
  const waitingData = waiting.data as unknown[] | null;
  return {
    enrolled: enrolled.length,
    waiting: Array.isArray(waitingData) ? waitingData.length : 0,
    missed: missed.size,
    materials: (materials.data ?? []).length,
    days: sessions.length,
    activeDay: activeSession?.day_number ?? null,
    activePresent,
  };
}

/**
 * The close-class step the DB does not automate: any "Enrolled" student whose
 * Present count already clears the required days gets promoted to Completed and
 * their person row synced — without a certificate.
 */
export async function completeEligibleEnrollments(
  supabase: SupabaseClient,
  classId: string,
  requiredDays: number
): Promise<void> {
  const [enrollments, counts] = await Promise.all([
    fetchEnrollments(supabase, classId),
    fetchPresentCounts(supabase, classId),
  ]);
  const due = enrollments.filter(
    (e) => e.status === 'Enrolled' && (counts[e.person_id] ?? 0) >= requiredDays
  );
  if (due.length === 0) return;
  const { data: updated } = await supabase
    .from('m1_enrollments')
    .update({ status: 'Completed' })
    .in('id', due.map((e) => e.id))
    .select('person_id')
    .returns<{ person_id: string }[]>();
  const personIds = (updated ?? []).map((r) => r.person_id);
  if (personIds.length > 0) {
    await supabase
      .from('people')
      .update({ m1_status: 'Completed', needs_m1: false })
      .in('id', personIds);
  }
}

/** Whether the visiting student has hit the required-day counts already. */
export function progressFor(
  counts: Record<string, number>,
  required: number,
  personId: string
): number {
  return Math.min(1, (counts[personId] ?? 0) / Math.max(1, required));
}

export function dayStatusColor(count: number, required: number): string {
  if (required === 0) return 'bg-primary';
  const ratio = count / required;
  if (ratio >= 1) return 'bg-emerald-500';
  if (ratio >= 0.5) return 'bg-amber-500';
  return 'bg-primary';
}

/** Never show an empty venue on a tile or certificate. */
export function venueLabel(venue: string | null | undefined): string {
  return venue?.trim() || DEFAULT_VENUE;
}

/** Week start used to place "this Sunday vs next Sunday" labels. */
export function weekLabel(dateISO: string): string {
  if (dateISO === todayISO()) return 'Today';
  const [y, m, d] = dateISO.slice(0, 10).split('-').map(Number);
  const date = new Date(y!, m! - 1, d!);
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((date.getTime() - start.getTime()) / 86_400_000);
  if (diff === 1) return 'Tomorrow';
  return fmtDate(dateISO);
}