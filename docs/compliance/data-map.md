# Personal data map — generated from the real schema

Source of truth: the live Supabase schema inspected on **2026-10-17**, cross-checked with every file in `supabase/migrations/`. This map lists every table and column that holds personal data. "Roles" uses the four roles that exist today: **Admin, Info Desk, Follow-up Coordinator, Pastor** (see `rights-procedures.md`, phasing toward `docs/09` Phase 8).

Sensitivity levels:

- **normal** — identifies a person; protect, low risk.
- **special: practice** — reveals religious belief or practice (baptism, M1/class status, attendance at worship). Under most data protection laws this is a special category; **to be verified with NCSA or a lawyer.**
- **special: children** — data about a child.
- **special: health/counseling** — counseling context, sickness in a note (health hints), prayer or feedback text.

The project rule: **no real personal data outside church-controlled hardware, ever.** Today the Supabase project must hold seed data only (see `inventory-of-cloud-services.md`).

## public.people (5 rows live)

| Column | What it holds | Purpose | Sensitivity | Who may see | Retention, proposed |
|---|---|---|---|---|---|
| first_name, last_name | Name | Identify the person; check-in | normal | all roles | Active members: while attending. Visitors who never returned: **needs church decision** (`decisions-needed.md`) |
| gender | Male/Female | Records, certificates | normal | all roles | same as name |
| age_group | Child/Youth/Adult/Elderly | Age-appropriate follow-up | **special: children** when "Child" | all roles | same; a child's record is never created from a public page |
| phone | Phone number | WhatsApp/SMS contact, check-in search | normal | all roles | same |
| email | Email address | Contact | normal | all roles | same |
| location, address_details | Area, address | Visits, M1 location grouping | normal (address more sensitive) | all list roles | same |
| category | Visitor / New Convert / M1 Class / Member / Returning / **Counseling** | Follow-up workflow | **special: practice**; "Counseling" is **special: counseling** | Admin/ID/FC (+Pastor restrict per policy) | same |
| m1_status | Not Started / In Progress / Completed | Discipleship class tracking | **special: practice** | Admin/FC/Pastor read; ID class ops | same |
| needs_m1, needs_baptism, baptism_status | Class/baptism pipeline flags and status | Baptism and M1 planning | **special: practice** | Admin/FC/Pastor | same |
| attendance via `attendance` table (person_id, service_date, service_name) | Worship attendance | Check-in, "expected today" | **special: practice** (presence at worship) | Admin/ID/FC read; ID/FC insert | same |
| follow_up_status, last_contact_date, assigned_to, assigned_at, assigned_by, registered_by | Follow-up workflow and workload | Coordination | normal | Admin/FC (assigned scope), ID write, Pastor restricted | same |
| hbf_group | Home-based fellowship group | Community assignment | normal | Admin/FC/ID | same |
| how_found_church | "How did you find us" answer | Outreach improvement | normal | Admin/ID/FC | same |
| contact_preference | WhatsApp/Email/SMS/Call/Both | How they want contact | normal | Admin/ID/FC | same |
| needs_pastor | Pastor should know flag | Care routing | normal (reveals care need) | Admin/FC/Pastor | dismissed when resolved; record then normal retention |
| notes | Free-text notes | Context | **sensitive** (can name health, family, faith) | **Admin and Pastor only; Info Desk must not see** (Info Desk screen hides notes) | **needs church decision** |
| date_registered, created_at, updated_at | Timestamps | Audit, ordering | normal | all roles | same |

## public.attendance (5 rows live)

| Column | What it holds | Purpose | Sensitivity | Who may see | Retention, proposed |
|---|---|---|---|---|---|
| person_id, service_date, service_name, checked_in_by/at | Who attended which service | Check-in, reports | **special: practice** | roles as above | same as people |

## public.contact_log (1 row live)

| Column | What it holds | Purpose | Sensitivity | Who may see | Retention, proposed |
|---|---|---|---|---|---|
| person_id, contacted_by, contacted_at, method | Who was contacted how and when | Follow-up tracking (docs/07 rules) | normal | Admin/FC/ID (+Pastor restricted) | same as people |
| outcome | Reached / No answer / Needs pastor / etc | Status | normal | same | same |
| note | Free-text | Context | **sensitive** | same as `people.notes` — Info Desk ECB hidden; **needs church decision** | same |
| finished | Log closed | "Finish this person" from Log sheet | normal | same | same |

## public.team_members (0 rows live)

| Column | What it holds | Purpose | Sensitivity | Who may see | Retention |
|---|---|---|---|---|---|
| full_name | Volunteer/staff name | Identity, assignment | normal | all roles | While serving + 12 months |
| role | Admin / Info Desk / Follow-up Coordinator / Pastor | Authorization | normal | Admin | same |
| auth_user_id | Supabase auth link | Login mapping | normal | Admin (nobody else needs it) | same |

## public.message_templates (9 rows live)

Template *bodies* contain `{name}` placeholders, not real values; they are content, not personal data. Admin-managed. Retain while in use.

## public.m1_classes / public.m1_sessions (2 / 9 rows live)

| Column | What it holds | Purpose | Sensitivity | Who may see | Retention |
|---|---|---|---|---|---|
| title, venue, date/time, topic, summary | Class logistics and teaching summary (sent in messages) | Class management | normal (summary may carry teaching content) | staff read; leaders edit | While class active; archive **needs church decision** |
| `m1_enrollments`: person_id, status, enrolled_by, walk_in, certificate_no, certificate_issued_at, certificate_override_note | Who is enrolled, certificates | M1 pipeline, certificates | **special: practice** | Admin/FC/Pastor read; ID enrol ops | **needs church decision** (certificates: long-lived by nature) |
| `m1_attendance`: session_id, person_id, status | Class attendance ticks | Class records | **special: practice** | Admin/FC/ID ticks, Pastor read | **needs church decision** |
| `m1_message_log`: person_id, purpose, channel | That a message was sent about a person | "Sent" indicators, catch-up | normal (no message body stored — bodies go through WhatsApp/SMS on the volunteer's phone, disclosed in the privacy notice) | Admin/FC read | same |
| `m1_reply_links`: token, person_id, expires_at | Single-use absence reply link | Public reply page (/reply/:token) | normal (token is a credential; hashed in the local-first target) | leaders only | expire (21 days) then delete |
| `m1_absence_replies`: reason, note | Why a person missed ("Sick" ⇒ health hint; "Family") | Catch-up planning | **special: health/counseling** when written by the person | Pastor + Admin only in local-first target (today leaders see them — tighten: `decisions-needed.md`) | **needs church decision** |
| `m1_materials`: title, storage_path, mime, size | Study material files (bucket `m1-materials`, 0 files live) | Class materials | normal | leaders read, Admin delete | while archived class exists; files move to local disk in Phase 3 |

## public.baptism_events / public.baptism_registrations (1 / 0 rows live)

| Column | What it holds | Purpose | Sensitivity | Who may see | Retention |
|---|---|---|---|---|---|
| event_date, time, venue, officiant, notes, status, archived_at | Baptism service logistics | Service planning | normal | Admin/Pastor write; staff read | **needs church decision** |
| registrations: person_id, status, baptized_at, certificate_no | Who was baptized when | Sacramental record | **special: practice — highest**; treat like a church register | Admin/Pastor write, class-leader read | **permanent church register candidate** (needs church decision) |

## Not built yet — planned data (docs 08, inventories in Phase 2)

| Table planned | What it will hold | Sensitivity |
|---|---|---|
| `welcome_submissions` | Name, phone, how found us, **nothing about children** — public page | normal; must never collect children's details on public pages |
| `users`, `sessions`, `audit_log`, `login_attempts` (Phase 2) | Login email, hashed password, session hashes, who-did-what | normal; **no personal values in audit messages** |

## Rules carried by this map

1. Screens never show ids where a name belongs (docs/06, 07, 08).
2. Info Desk never sees `notes`, counseling text, or counselling-category details beyond the drawer's hidden parts.
3. Children (age_group = Child) are never on public pages; their records exist only if the family brings them in person.
4. Attendance-y fields (service + class) prove religious practice — they are special category, stored on church hardware only after Phase 1 and listed in the privacy notice.
5. Anything marked "needs church decision" goes to `decisions-needed.md`. Nothing here is legal advice; sensitive-class assignments are "to be verified" with NCSA or a lawyer.
