// Mapping layer between the API's camelCase shapes and the legacy snake_case
// rows the people screens (table, toolbar, drawer) render. [local-first]
import type { ContactLogApi, PersonApi, TeamMemberApi } from '../../../api/schemas/people';
import type { Person } from './columns';

export function personApiToRow(p: PersonApi): Person {
  return {
    id: p.id,
    first_name: p.firstName,
    last_name: p.lastName,
    gender: p.gender,
    age_group: p.ageGroup,
    phone: p.phone,
    location: p.location,
    category: p.category,
    m1_status: p.m1Status,
    hbf_group: p.hbfGroup,
    how_found_church: p.howFoundChurch,
    date_registered: p.dateRegistered,
    assigned_to: p.assignedTo,
    assigned_to_name: p.assignedToName,
    follow_up_status: p.followUpStatus,
    needs_pastor: p.needsPastor,
    last_contact_date: p.lastContactDate,
    baptism_status: p.baptismStatus,
    notes: p.notes ?? null,
    registered_by: p.registeredBy,
    registered_by_name: p.registeredByName,
    contact_preference: p.contactPreference,
    email: p.email,
    address_details: p.addressDetails,
    needs_m1: p.needsM1,
    needs_baptism: p.needsBaptism,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

/** Contact-log drawer row (the old supabase select shape). */
export function contactLogApiToRow(c: ContactLogApi): {
  id: string;
  contacted_at: string;
  method: string;
  outcome: string;
  note: string | null;
  logged_by: { full_name: string } | null;
} {
  return {
    id: c.id,
    contacted_at: c.contactedAt,
    method: c.method,
    outcome: c.outcome,
    note: c.note,
    logged_by: c.contactedByName != null ? { full_name: c.contactedByName } : null,
  };
}

/** The Add/Edit forms and the drawer selects keep plain-string state, while
 * the API enums are closed lists. Keep a value only when the same constants
 * the dropdowns render actually contain it — the API's zod validation stays
 * the backstop for anything else. */
export function enumOrNull<T extends readonly string[]>(
  list: T,
  value: string | null | undefined,
): T[number] | null {
  return value != null && (list as readonly string[]).includes(value)
    ? (value as T[number])
    : null;
}

/** Required variant: throws (surfaced by the form's error box) when the
 * stored value is not in the list. */
export function enumReq<T extends readonly string[]>(list: T, value: string | null | undefined): T[number] {
  const v = enumOrNull(list, value);
  if (v == null) throw new Error(`Unsupported option: ${String(value)}`);
  return v;
}

/** The drawer/AddPerson select options were built from team_members rows. */
export function teamMemberToOption(m: TeamMemberApi): { id: string; full_name: string } {
  return { id: m.id, full_name: m.fullName };
}
