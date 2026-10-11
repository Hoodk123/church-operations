import type { SupabaseClient } from '@supabase/supabase-js';
import { daysSince, relativeDays } from '@/lib/dates';
import { phoneDigits } from '@/lib/phone';

export interface FollowUpPerson {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  category: string | null;
  location: string | null;
  needs_pastor: boolean;
  last_contact_date: string | null;
  follow_up_status: string;
  assigned_at: string | null;
  assigner: { full_name: string } | { full_name: string }[] | null;
  /** Day number of the most recent closed M1 day this person was Absent on. */
  missed_m1_day?: number | null;
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * For a set of people, return the latest closed M1 day each was marked Absent
 * on (task 6, 2.5) so their follow-up card can show "Missed M1 Day N".
 */
export async function fetchMissedM1(
  supabase: SupabaseClient,
  personIds: string[]
): Promise<Record<string, number>> {
  if (personIds.length === 0) return {};
  const { data } = await supabase
    .from('m1_attendance')
    .select('person_id, status, m1_sessions(day_number, closed)')
    .in('person_id', personIds)
    .eq('status', 'Absent');
  const result: Record<string, number> = {};
  for (const raw of (data ?? []) as {
    person_id: string;
    m1_sessions: { day_number: number; closed: boolean } | { day_number: number; closed: boolean }[] | null;
  }[]) {
    const session = one(raw.m1_sessions);
    if (!session || !session.closed) continue;
    const current = result[raw.person_id];
    if (current === undefined || session.day_number > current) {
      result[raw.person_id] = session.day_number;
    }
  }
  return result;
}

export function assignerName(person: FollowUpPerson): string | null {
  if (!person.assigner) return null;
  const a = Array.isArray(person.assigner) ? person.assigner[0] : person.assigner;
  return a?.full_name ?? null;
}

export function fullName(person: FollowUpPerson): string {
  return `${person.first_name} ${person.last_name}`;
}

export function telHref(phone: string | null): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, '');
  return cleaned ? `tel:${cleaned}` : null;
}

export function waHref(phone: string | null): string | null {
  const digits = phone ? phoneDigits(phone) : '';
  return digits ? `https://wa.me/${digits}` : null;
}

export function lastContactLabel(person: FollowUpPerson): string {
  if (!person.last_contact_date) return 'Never contacted';
  const days = daysSince(person.last_contact_date);
  if (days === 0) return 'Last contacted today';
  if (days === 1) return 'Last contacted yesterday';
  return `Last contacted ${days} days ago`;
}

/** True when the "New · assigned N days ago" tag should show. */
export function isNewAssignment(person: FollowUpPerson): boolean {
  if (!person.assigned_at || person.last_contact_date) return false;
  return daysSince(person.assigned_at) <= 7;
}

export function newAssignmentLabel(person: FollowUpPerson): string {
  const by = assignerName(person);
  return `New · assigned ${relativeDays(person.assigned_at ?? '')}${by ? ` by ${by}` : ''}`;
}
