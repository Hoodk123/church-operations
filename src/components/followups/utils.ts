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
}

export function assignerName(person: FollowUpPerson): string | null {
  if (!person.assigner) return null;
  const a = Array.isArray(person.assigner) ? person.assigner[0] : person.assigner;
  return a?.full_name ?? null;
}

export function fullName(person: FollowUpPerson): string {
  return `${person.first_name} ${person.last_name}`;
}

export function initialsOf(first: string, last: string): string {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
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
