import { CHURCH_NAME } from '@/lib/church';
import { todayISO } from '@/lib/dates';
import {
  listM1Attendance,
  listM1Classes,
  listM1Enrollments,
  listM1Materials,
  listM1Sessions,
  listM1WaitingList,
} from '@/lib/api/m1';
import type {
  M1AttendanceApi,
  M1ClassApi,
  M1EnrollmentApi,
  M1PersonApi,
  M1PersonSearchApi,
  M1SessionApi,
} from '../../../packages/shared/schemas/m1';

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
  status: 'Present' | 'Absent' | 'Excused';
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

export function m1PersonFromApi(person: M1PersonApi): M1Person {
  return {
    id: person.id,
    first_name: person.firstName,
    last_name: person.lastName,
    phone: person.phone,
    email: person.email,
    location: person.location,
    address_details: person.addressDetails,
    gender: person.gender,
    age_group: person.ageGroup,
    contact_preference: person.contactPreference,
    category: person.category,
    m1_status: person.m1Status,
    baptism_status: person.baptismStatus,
    needs_m1: person.needsM1,
    needs_baptism: person.needsBaptism,
    needs_pastor: person.needsPastor,
  };
}

export function m1PersonSearchFromApi(person: M1PersonSearchApi): M1Person {
  return {
    id: person.id,
    first_name: person.firstName,
    last_name: person.lastName,
    phone: person.phone,
    email: null,
    location: person.location,
    address_details: null,
    gender: '',
    age_group: person.ageGroup,
    contact_preference: null,
    category: '',
    m1_status: null,
    baptism_status: null,
    needs_m1: false,
    needs_baptism: false,
    needs_pastor: false,
  };
}

function classFromApi(row: M1ClassApi): M1Class {
  return {
    id: row.id,
    title: row.title,
    venue: row.venue,
    required_days: row.requiredDays,
    status: row.status,
    archived_at: row.archivedAt,
    created_by: row.createdBy,
    created_at: row.createdAt,
  };
}

function sessionFromApi(row: M1SessionApi): M1Session {
  return {
    id: row.id,
    class_id: row.classId,
    day_number: row.dayNumber,
    session_date: row.sessionDate,
    start_time: row.startTime,
    topic: row.topic,
    summary: row.summary,
    closed: row.closed,
  };
}

function enrollmentFromApi(row: M1EnrollmentApi): M1Enrollment {
  return {
    id: row.id,
    class_id: row.classId,
    person_id: row.personId,
    enrolled_at: row.enrolledAt,
    walk_in: row.walkIn,
    status: row.status,
    certificate_no: row.certificateNo,
    certificate_issued_at: row.certificateIssuedAt,
    certificate_override_note: row.certificateOverrideNote,
    people: m1PersonFromApi(row.person),
  };
}

function attendanceFromApi(row: M1AttendanceApi): M1Attendance {
  return { id: row.id, session_id: row.sessionId, person_id: row.personId, status: row.status };
}

export async function fetchM1Classes(): Promise<M1Class[]> {
  return (await listM1Classes()).map(classFromApi);
}

export async function fetchClassSessions(classId: string): Promise<M1Session[]> {
  return (await listM1Sessions(classId)).map(sessionFromApi);
}

export async function fetchEnrollments(classId: string): Promise<M1Enrollment[]> {
  return (await listM1Enrollments(classId)).map(enrollmentFromApi);
}

export async function fetchAttendance(
  classId: string
): Promise<Record<string, M1Attendance[]>> {
  const rows = (await listM1Attendance(classId)).map(attendanceFromApi);
  const bySession: Record<string, M1Attendance[]> = {};
  for (const row of rows) (bySession[row.session_id] ??= []).push(row);
  return bySession;
}

export async function fetchPresentCounts(classId: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const row of (await listM1Attendance(classId)).filter((item) => item.status === 'Present')) {
    counts[row.personId] = (counts[row.personId] ?? 0) + 1;
  }
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

export async function fetchClassStats(classId: string): Promise<M1ClassStats> {
  const [sessions, attendanceBySession, enrollments, waiting, materials] = await Promise.all([
    fetchClassSessions(classId),
    fetchAttendance(classId),
    fetchEnrollments(classId),
    listM1WaitingList(),
    listM1Materials(classId),
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
  return {
    enrolled: enrolled.length,
    waiting: waiting.length,
    missed: missed.size,
    materials: materials.length,
    days: sessions.length,
    activeDay: activeSession?.day_number ?? null,
    activePresent,
  };
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