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
| `people` | Church register (pre-repo baseline, updated by migrations 2026-10-07, 10, 12: `needs_pastor`, `assigned_at/by`, `email`, `address_details`, wider `contact_preference`, `needs_m1/needs_baptism`) | Prisma model `People`, same columns; ``auth_user_id` dropped`— no auth link; part of the check constraints become Prisma enums |
| `team_members` | Staff list (pre-repo baseline) | model `TeamMembers`; `auth_user_id uuid references auth.users(id)` → renamed `user_id`, FK → our new `users(id)`, still nullable |
| `attendance` | One row per person per service (20261007000000) | Prisma model |
| `contact_log` | Calls/messages/visits (20261007000000; `finished` from 20261010000000) | Prisma model |
| `message_templates` | Templates volunteers send (20261010000000; `purpose` 20261012000000) | Prisma model; 9 seeded rows (4 from task-5, 5 from task-6) |
| `m1_classes` (→ `archived_at` 20261013000000) | M1 classes | Prisma model |
| `m1_sessions` | Class days | Prisma model |
| `m1_enrollments` | Enrolments + certificates | Prisma model |
| `m1_attendance` | Ticks | Prisma model |
| `m1_message_log` | "Sent" log | Prisma model |
| `m1_reply_links` | Private links for missed-day pages | Prisma model. The API generates token + 21-day expiry (no SQL defaults); Phase 3 change (docs/09): store `token_hash` instead of the raw link token |
| `m1_absence_replies` | The answers | Prisma model |
| `m1_materials` | Study material rows | Prisma model; the file bytes move from Supabase Storage to a local volume directory (Phase 3); `storage_path` keeps a path-shaped string |
| `baptism_events` | Baptism services (`archived_at` 20261013010000) | Prisma model |
| `baptism_registrations` | Who is registered on a service | Prisma model |
| `welcome_submissions` | (planned in docs/08, **does not exist** live or in migrations) | Not created in Phase 2; the Phase 3 public route validates and writes `people` directly; revisit only if the form needs a staging inbox |

## 2. Functions (live: 22)

**Kept as SQL (pure trigger functions only — no `auth`/role check inside):**

- `set_updated_at()` + triggers `trg_people_updated_at` / `trg_message_templates_updated_at` / `trg_users_updated_at` — live only had the people trigger; the same behaviour now covers the other tables that carry `updated_at`.
- `apply_contact_log()` + trigger `contact_log_apply` (insert side-effects: last_contact_date, follow_up_status, needs_pastor) — kept exactly.
- `revert_contact_log()` + trigger `contact_log_revert` — kept, with the follow_up_status literals **cast to the enum** (they were plain text on Supabase; the CASE arms could not mix text/enum otherwise).
- `stamp_assignment()` + trigger `people_stamp_assignment` — **modified**: the live body calls `my_team_member_id()`; the kept version stamps only `assigned_at`, `assigned_by` is set by the application (docs/09 line 131: "a column set by the application").
- `m1_attendance_touch_person()` + trigger `m1_attendance_touch` — kept exactly.
- `baptism_registration_sync()` + trigger `baptism_registration_sync` — kept exactly.

Everything on `security definer` moves, per the docs/09 translation rule
("WHEREEVER a spec says Supabase RPC or SECURITY DEFINER function, implement it as
an API endpoint plus service function"):

- `close_m1_session(uuid)` → Phase 3 API service (one transaction: close day → fill absences → complete enrolments → update people); the acting team member is passed by the API (the `p_marked_by` idea), the role gate ("Admin/Pastor/FC only") lives in `policy.ts`.
- `issue_m1_certificates(uuid[])` → Phase 3 API service (Admin/Pastor route); it allocates numbers through `m1_certificate_seq`, never reused after class deletes.
- `expected_today()`, `m1_waiting_list()`, `baptism_candidates()` → Phase 3 API queries (they were auth-free invoker functions; the SQL bodies are preserved below in exact detail so the services cannot forget a rule).
- `get_volunteer_overview()` → Phase 3 API service; drops the `get_my_role() = 'Admin'` filter clause (route authorizes).
- `get_reply_context(text)` / `submit_absence_reply(text,text,text)` → the two anon routes become Phase 3 public routes (validation, rate-limit, honeypot); `m1_reply_links.token`/`expires_at` have **no SQL defaults — the API generates token and `now() + 21 days`** (kept docs/09 idea: store `token_hash` later in Phase 3).
- `delete_m1_class(uuid)` / `delete_baptism_event(uuid)` → Phase 3 API services (transactional deletes incl. files on disk); the deleting order in the SQL bodies is preserved verbatim in the migration history comment trail so the API implementation cannot forget a step.
- `get_my_role()`, `get_my_team_id()`, `my_team_member_id()`, `is_class_leader()`, `is_class_staff()` — all read `auth.uid()`; the API knows the role/session directly.
- `rls_auto_enable()` (event trigger) — Supabase-only helper; no RLS in the local schema.

**Defense in depth note (change from P1 promise):** local tables get no RLS. The runtime
account keeps its least-privilege grants (schema-usage only) and the API enforces the
matrix (`policy.ts`). Even stronger than planned: **no admin functions exist on the
database at all**, so a leaked API credential cannot do more than the DML on tables
it was given. There is nothing to `REVOKE EXECUTE`.
(This corrects a comment in `deploy/db/init/02-roles.sh`; the file itself is unchanged.)

## 3. Triggers (8 on the new database)

| Trigger | Table | Function | Kept? |
|---|---|---|---|
| `contact_log_apply` | contact_log | `apply_contact_log` | yes |
| `contact_log_revert` | contact_log | `revert_contact_log` | yes |
| `people_stamp_assignment` | people | `stamp_assignment` (modified) | yes |
| `trg_people_updated_at` | people | `set_updated_at` | yes |
| `trg_message_templates_updated_at` | message_templates | `set_updated_at` | new (same behaviour as live's people trigger) |
| `trg_users_updated_at` | users | `set_updated_at` | new (new table) |
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

Carried: `people_category_idx` and `people_hbf_group_idx`/`people_location_idx` (single-column lookups),
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
  `password_hash text not null` (argon2id; seed creates the four admin logins with
  random passwords printed ONCE — never stored or committed),
  `role user_role not null`, `active boolean not null default true`,
  `failed_login_count int not null default 0`, `locked_until timestamptz`,
  `last_login_at timestamptz`, `created_at/updated_at`.
- `sessions`: `id text pk` (**hashed** session id), `user_id fk users on delete cascade`,
  `created_at`, `expires_at`, `ip_hash text`, `user_agent text`.
- `audit_log`: `id uuid pk`, `user_id uuid nullable fk users (NO ACTION: users are
  deactivated, not deleted, so nothing dangles)`,
  `action text not null`, `entity text not null`, `entity_id uuid`,
  `message text not null` (**policy: no personal values; names/phones are NEVER written here**),
  `created_at timestamptz not null default now()`.
- `login_attempts`: **deferred to Phase 3** with the rate limiter (docs/09: "if needed");
  noted so the decision is recorded, not lost.

`team_members.auth_user_id` → `user_id` (on `users(id)`). The role fields in
`team_members.role` and `users.role` are kept in step by the seed/application; a
Migration later, if drift is ever observed, is a Phase 8 audit item.

## 7. What happens to data movement (planning, per Kevin's requirement)

- **create**: `.sql` under `prisma/migrations/` only (git-hook allowlist). Two migrations
  shipped in this phase: `20261018000000_baseline` (all enums, the 15 app tables + the 3
  new auth tables, indexes, FKs) and `20261018010000_triggers_checks` (the 8 triggers,
  `m1_certificate_seq`, the two numeric CHECK constraints). Seed data lives in
  `prisma/seed.ts` (TypeScript, runs as `church_app`), **never** as `.sql` inserts in git.
- **update**: future column/table changes are new numbered migrations created with
  `prisma migrate dev --create-only`, then `migrate deploy` to apply.
- **delete**: destructive `.sql` should be avoided; when needed (`drop` is never a hurry),
  the pre-commit hook still blocks it and the removal always includes a comment on what
  was dropped. **Bulk data** (real people import, big volume trees) never enters git:
  `.dump` is blocked, CSV/JSON staging stays in a git-ignored folder handled by an API
  job (Phase 3's Excel import rule).

## 8. Tooling (as implemented)

- Prisma **7.10.1** (current stable; 8 is still RC). Per Prisma 7 rules the connection
  URL lives in **`prisma.config.ts`** (root), built from the same `.env` keys the Docker
  stack uses (`POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB/PG_PORT`, with
  `DATABASE_URL` overriding). dotenv is loaded by the config; the CLI reads nothing by itself.
- Schema: `prisma/schema.prisma`, `datasource db { provider = \"postgresql\" }` (no url),
  generator `prisma-client` with output `src/generated/prisma` (ESM; git-ignored;
  `npm install` runs `prisma generate` through the `postinstall` script).
- Client runtime needs `@prisma/adapter-pg` + `pg` (Phase 3 passes this into
  `PrismaClient`); dev tools: `prisma`, `tsx`, `dotenv`, `@types/pg`; `argon2`
  (runtime dep) is used by the seed for password hashes.
- `scripts/db-drift-check.sh`: runs `prisma migrate status` and a
  `prisma migrate diff --from-config-datasource --to-schema` with `--exit-code`;
  exits non-zero when anything differs. Verified green in this phase.
- On WSL (Ubuntu) Node is installed through nvm (`~/.nvm`), so `npm`/`npx` work there;
  Windows keeps its own Node 24 install.

## 9. Not adopted (Supabase-only parts left behind)

`auth.*` whole schema, `storage.*` schema+buckets (`m1-materials` files become local
files), Realtime, Supabase RPC/REST web routes and helpers, `anon`/`authenticated`/`service_role`
roles and grants, the two JWT-token-helpers, `permissions` views, and the 20261013020000
hardening grants (their purpose is fulfilled by having no public DB access at all).
