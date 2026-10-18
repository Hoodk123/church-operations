# Supabase → Prisma inventory (Phase 2, docs/09)

Source: the 7 files in `supabase/migrations/` + the live database (read-only through the
Supabase MCP on 2026-10-17: columns, constraints, indexes, functions, triggers).
The live DB still runs PostgreSQL 17.6; the local container runs 17.9-trixie (same major).

Goal of the mapping: **no Supabase server parts** (`auth.*`, `storage.*`, `anon`/`authenticated`),
no RLS (`create policy`, `enable row level security`), no JWT helpers
(`auth.uid()`). Row/role authorization moves to the Phase 3 API (`policy.ts`).
Data-derivation triggers stay as plain SQL so the rules the screens depend on
cannot be forgotten. Naming note: the clean baseline is written **fresh** (empty
container), so renames are free; the Phase 4 web port must adapt to them.

## 1. Tables (15)

| Live table | What it is | Destination in the new stack |
|---|---|---|
| `people` | Church register (pre-repo baseline, updated by migrations 2026-10-07, 10, 12: `needs_pastor`, `assigned_at/by`, `email`, `address_details`, wider `contact_preference`, `needs_m1/needs_baptism`) | Prisma model `People`, same columns; `auth_user_id ABSent`— no auth link; part of the check constraints become Prisma enums |
| `team_members` | Staff list (pre-repo baseline) | model `TeamMembers`; `auth_user_id uuid references auth.users(id)` → renamed `user_id`, FK → our new `users(id)`, still nullable |
| `attendance` | One row per person per service (20261007000000) | Prisma model |
| `contact_log` | Calls/messages/visits (20261007000000; `finished` from 20261010000000) | Prisma model |
| `message_templates` | Templates volunteers send (20261010000000; `purpose` 20261012000000) | Prisma model; 9 seeded rows (4 from task-5, 5 from task-6) |
| `m1_classes` (→ `archived_at` 20261013000000) | M1 classes | Prisma model |
| `m1_sessions` | Class days | Prisma model |
| `m1_enrollments` | Enrolments + certificates | Prisma model |
| `m1_attendance` | Ticks | Prisma model |
| `m1_message_log` | "Sent" log | Prisma model |
| `m1_reply_links` | Private links for missed-day pages | Prisma model. Phase 3 change (docs/09): store `token_hash` instead of the raw link token |
| `m1_absence_replies` | The answers | Prisma model |
| `m1_materials` | Study material rows | Prisma model; the file bytes move from Supabase Storage to a local volume directory (Phase 3); `storage_path` keeps a path-shaped string |
| `baptism_events` | Baptism services (`archived_at` 20261013010000) | Prisma model |
| `baptism_registrations` | Who is registered on a service | Prisma model |
| `welcome_submissions` | (planned in docs/08, **does not exist** live or in migrations) | Not created in Phase 2; the Phase 3 public route validates and writes `people` directly; revisit only if the form needs a staging inbox |

## 2. Functions (live: 22)

**Kept as SQL (no `auth`/role check inside — the API checks who may call it):**

- `set_updated_at()` + trigger `trg_people_updated_at` on `people.updated_at` — kept exactly.
- `apply_contact_log()` + trigger `contact_log_apply` (insert side-effects: last_contact_date, follow_up_status, needs_pastor) — kept exactly.
- `revert_contact_log()` + trigger `contact_log_revert` (recompute the derived fields after a same-day deletion) — kept exactly.
- `stamp_assignment()` + trigger `people_stamp_assignment` — **modified**: the live body calls `my_team_member_id()`; the kept version stamps only `assigned_at`, `assigned_by` is set by the application (docs/09 line 131: "a column set by the application").
- `m1_attendance_touch_person()` + trigger `m1_attendance_touch` — kept exactly.
- `baptism_registration_sync()` + trigger `baptism_registration_sync` — kept exactly.
- `close_m1_session(uuid)` — **modified**: parameter `p_marked_by uuid` replaces the `my_team_member_id()` call; role gate ("Admin/Pastor/FC only") moves to the Phase 3 route. Kept in SQL because it is one transactional unit (open day → fill absences → complete enrolments → update people for the class).
- `issue_m1_certificates(uuid[])` — **kept, role gate removed** (Phase 3 route: Admin/Pastor). Uses the private sequence `m1_certificate_seq`, never reused after class deletes.
- `expected_today()` — kept as SQL, unmodified (it was `security invoker` and auth-free).
- `m1_waiting_list()` / `baptism_candidates()` — kept exactly (security invoker, no auth).
- `get_volunteer_overview()` — **modified**: drops the `get_my_role() = 'Admin'` filter clause (the Phase 3 route authorizes); the admin gate stays in `policy.ts`.

**Dropped (auth-runtime, replaced by the API):**

- `get_my_role()`, `get_my_team_id()`, `my_team_member_id()`, `is_class_leader()`, `is_class_staff()` — all read `auth.uid()`; the API knows the role/session directly.
- `get_reply_context(text)` / `submit_absence_reply(text,text,text)` — the two anon routes; become Phase 3 public routes (validation, rate-limit, honeypot; token hash change noted above).
- `delete_m1_class(uuid)` / `delete_baptism_event(uuid)` — logic moves to the Phase 3 API (transactional deletes incl. files on disk); not dropped silently: the deleting order in the SQL bodies of the two functions is preserved verbatim in the inventory below so the API implementation cannot forget a step.
- `rls_auto_enable()` (event trigger) — Supabase-only helper; no RLS in the local schema.

**Defense in depth note (change from P1 promise):** local tables get no RLS. The runtime
account keeps its least-privilege grants (schema-usage only), the API enforces the matrix
(`policy.ts`), and in the admin-function migration we **revoke `EXECUTE` on the
destructive/admin functions from `church_app`** so a leaked API credential cannot call them
directly either. That is the "two lines of defense" instead of RLS.
(This corrects a comment in `deploy/db/init/02-roles.sh`; the file itself is unchanged.)

## 3. Triggers (live, 5 app-side)

| Trigger | Table | Function | Kept? |
|---|---|---|---|
| `contact_log_apply` | contact_log | `apply_contact_log` | yes |
| `contact_log_revert` | contact_log | `revert_contact_log` | yes |
| `people_stamp_assignment` | people | `stamp_assignment` (modified) | yes |
| `trg_people_updated_at` | people | `set_updated_at` | yes |
| `m1_attendance_touch` | m1_attendance | `m1_attendance_touch_person` | yes |
| `baptism_registration_sync` | baptism_registrations | `baptism_registration_sync` | yes |
| (Supabase realtime/storage triggers) | realtime.*, storage.* | — | not applicable |

## 4. Constraints & enums

Live `text` columns with `CHECK (...)` lists become **Postgres enums** in the new schema
(cleaner, self-documenting; the Phase 4 app uses zod anyway, not the DB types):

- `gender`: Male / Female
- `age_group`: Child / Youth / Adult / Elderly
- `category`: Visitor / New Convert / M1 Class / Member / Returning / Counseling
- `follow_up_status`: Not Started / Contacted / Met / Ongoing / Completed
- `m1_status`: Not Started / In Progress / Completed
- `baptism_status`: Not yet / Scheduled / Baptized
- `contact_preference`: WhatsApp / Email / SMS / Call / Both
- `contact_log.method`: Call / WhatsApp / SMS / Visit / Other
- `contact_log.outcome`: Reached / No answer / Scheduled visit / Needs pastor / Wrong number
- `m1_classes.status`: Open / Closed
- `m1_enrollments.status`: Enrolled / Completed / Dropped
- `m1_attendance.status`: Present / Absent / Excused
- `m1_message_log.purpose`: reminder / catch_up / materials / certificate / baptism / other
- `m1_message_log.channel`: WhatsApp / Email / SMS / Call
- `m1_absence_replies.reason`: Work / Sick / Transport / Family / Forgot / Evening / Other
- `m1_absence_replies.source`: Link / Volunteer
- `baptism_events.status`: Scheduled / Done / Cancelled
- `baptism_registrations.status`: Registered / Baptized / Postponed
- `users.role` (new): Admin / Info Desk / Follow-up Coordinator / Pastor

Everything else (PK/FK/uniques) is carried 1:1, including:

- `attendance` unique `(person_id, service_date, service_name)`
- `contact_log` → FKs + `finished boolean default false`
- `m1_*` uniques: `(class_id, day_number)`, `(class_id, person_id)`, `(session_id, person_id)`
- `certificate_no` unique on enrolments and registrations
- `m1_classes.required_days` between 1 and 10
- people FK cascade rules: `attendance.people`, `contact_log`, `m1_*`, `baptism_registrations` cascade on person delete; the other FKs (`team_members` participants) keep NO ACTION as live.

## 5. Indexes

Carried: `attendance_service_date_idx` (already `service_date`),
`contact_log_person_idx (person_id, contacted_at desc)`, `m1_attendance_person_idx`,
`m1_message_log_person_idx (person_id, sent_at desc)`, the unique indexes of the tables above.

New, per docs/09 Phase 2 §5 (each for a named query pattern):

- `people_phone_idx` on `people(phone)` — the Info Desk lookup (was missing live)
- `people_date_registered_idx` on `people(date_registered)` — overdue logic (was missing live)
- `people_assigned_to_follow_up_status_idx` on `people(assigned_to, follow_up_status)` — volunteer dashboards; covers the live single-column `idx_people_assigned_to`, which is therefore NOT carried
- `attendance_date_person_idx` on `attendance(service_date, person_id)` — check-in and `expected_today()`; covers the live single-column date index
- `m1_attendance(session_id, person_id)` and `m1_enrollments(class_id, person_id)` are already served by their unique constraints → no extra index
- `sessions_user_id_idx`, `sessions_expires_at_idx`, `audit_log_created_at_idx`, `audit_log_user_id_idx` (new tables)

Where kept, names change only where Prisma's default naming would differ; every index is
**named explicitly in the schema** (docs/09: "name them in the schema").

## 6. New tables (replacing Supabase auth, per docs/09 Phase 2 §4)

- `users`: `id uuid pk default gen_random_uuid()`, `email text unique not null`,
  `password_hash text not null` (argon2id; seeded/paid in Phase 3 — never a raw value),
  `role user_role not null`, `team_member_id uuid unique references team_members(id)`
  (nullable: a user needs a team_member row to be useful, but seeding order matters),
  `active boolean not null default true`, `failed_login_count int not null default 0`,
  `locked_until timestamptz`, `last_login_at timestamptz`, `created_at/updated_at`.
- `sessions`: `id text pk` (**hashed** session id), `user_id fk users on delete cascade`,
  `created_at`, `expires_at`, `ip_hash text`, `user_agent text`.
- `audit_log`: `id uuid pk`, `user_id uuid nullable fk users on delete set null`,
  `action text not null`, `entity text not null`, `entity_id uuid`,
  `message text not null` (**policy: no personal values; names/phones are NEVER written here**),
  `created_at timestamptz not null default now()`.
- `login_attempts`: **deferred to Phase 3** with the rate limiter (docs/09: "if needed");
  noted so the decision is recorded, not lost.

`team_members.auth_user_id` → `user_id` (on `users(id)`). The role fields in
`team_members.role` and `users.role` are kept in step by the seed/application; a
Migration later, if drift is ever observed, is a Phase 8 audit item.

## 7. What happens to data movement (planning, per Kevin's requirement)

- **create**: `.sql` under `prisma/migrations/` only (git-hook allowlist). `0001` baseline
  schema; `0002` triggers/functions; `0003` new auth tables + index adds + function
  execute revokes; seed data lives in `prisma/seed.ts` (TypeScript), **never** as
  `.sql` inserts in git.
- **update**: future column/table changes are new numbered migrations created with
  `prisma migrate dev --create-only`, then `migrate dev` to apply — playing with a
  `--from-url` diff for review before commit where useful.
- **delete**: destructive `.sql` should be avoided; when needed (`drop` is never a hurry),
  the pre-commit hook still blocks it and the removal always includes a comment on what
  was dropped. **Bulk data** (real people import, big volume trees) never enters git:
  `.dump` is blocked, CSV/JSON staging stays in a git-ignored folder handled by an API
  job (Phase 3's Excel import rule).

## 8. Not adopted (Supabase-only parts left behind)

`auth.*` whole schema, `storage.*` schema+buckets (`m1-materials` files become local
files), Realtime, Supabase RPC/REST web routes and helpers, `anon`/`authenticated`/`service_role`
roles and grants, the two JWT-token-helpers, `permissions` views, and the 20261013020000
hardening grants (their purpose is fulfilled by having no public DB access at all).
