# 09 · Local-first migration: leave Supabase, own our data (Postgres + Prisma + our own API)

**Read this whole file before touching anything.** This is the plan, the rules, and the order of work. Do one phase at a time. At the end of every phase, stop, report, and wait for Kevin.

---

## 0 · Why we are doing this

Omega Ministries' leaders asked that church members' data is **not stored in the cloud**, and that the app can run **without internet**, mainly at the Info Desk. The data in this system includes names, phone numbers, addresses, family information, counseling and prayer notes, and **religious belief and practice** (baptism, classes, follow-up). Under most data protection laws, including Rwanda's, religious belief is a *special category* of personal data. The church is accountable for it.

So the goal is:
1. **All personal data lives on hardware the church controls**, in Rwanda. No third-party cloud database, storage, auth or analytics.
2. The app works on the church's local network with **no internet**.
3. It is **available** (starts by itself, survives power cuts, backed up), **fast**, and **secure by default**.
4. It does this on a **zero budget** now: Kevin's PC (Windows, WSL2, Docker Desktop), later a church-owned machine.

Everything built so far (screens, rules, SQL design) stays. What changes is the platform underneath.

**Compliance comes first.** Phase 0 and the data sovereignty documents come before any code move. Nothing here is legal advice. Where a law is cited, Kevin and the church must verify it with the National Cyber Security Authority (NCSA) or a lawyer. Do not invent legal claims. Write "to be verified" next to anything you cannot confirm.

## 1 · What changes and what stays

| Today (Supabase) | Target (local) |
|---|---|
| Browser talks straight to Supabase (`@supabase/supabase-js`) | Browser talks only to **our own API** over HTTPS |
| Supabase Auth (`auth.users`, `auth.uid()`) | Our own login: users table, argon2id passwords, server sessions |
| Row Level Security policies and `get_my_role()` | Authorization in the API (one policy module, tested). Optional database RLS later as a second layer |
| SQL RPC functions (`SECURITY DEFINER`, called by `anon`) | API endpoints and service functions that run transactions with Prisma. Pure triggers stay as SQL |
| Supabase Storage bucket `m1-materials` | Files on a Docker volume, served by the API with checks and expiring links |
| Generated Supabase types | Prisma client types + shared `zod` schemas |
| Netlify hosts the web app | A web container (Caddy serving the built React app) on our own machine |

Kept as is: React + TypeScript + Tailwind + shadcn UI, routes, components, the table design, triggers like `apply_contact_log`, the seed data idea, every spec in `docs/`.

**Important:** Prisma runs only on a server (Node). It cannot run in the browser. That is why a small API is part of this plan.

## 2 · Target architecture

```
Browser (Info Desk, volunteers, phones on church Wi-Fi)
        │  HTTPS (church domain pointing to the private LAN address)
        ▼
  [ proxy ]  Caddy: HTTPS, serves the built web app, forwards /api/*
        │ internal docker network (no published ports)
        ├──► [ api ]  Node + TypeScript + Fastify + Prisma + zod
        │        │
        │        ▼
        └──► [ db ]   PostgreSQL (private network only, data on a named volume)
              [ files ] volume mounted into api (uploads, certificates assets)
              [ backup ] nightly encrypted dump job
```
Only the proxy publishes ports (80 and 443). The database and API are never reachable from outside Docker.

Repo layout (monorepo, npm workspaces or pnpm, keep what the repo already uses if it works):
```
apps/web        existing React app (moved here, or leave at root and add apps/api; decide in Phase 1 and say why)
apps/api        new API
packages/shared zod schemas and types used by both
prisma/         schema.prisma, migrations/, seed.ts
deploy/         compose files, Caddyfile, backup scripts
docs/           specs, compliance/
```

## 3 · Git rules (do these first, in order)

1. **Do not merge, close or delete any existing branch or PR.** Do not touch `main`.
2. Make sure every branch with work is **committed and pushed**: the open PR branches (`feat/admin-control-and-checkin-fixes`, `feat/m1-baptism`, and any other local branch). Run `git status`, `git branch -vv`, `git log origin/<branch>..<branch>` for each. Report anything unpushed, push it.
3. Find the branch whose tip contains **everything** (the newest in the stack, expected to be `feat/m1-baptism`). Verify by checking that it contains the commits of the others (`git merge-base --is-ancestor`). Report the result.
4. Create two **annotated tags** on that tip and push them:
   - `supabase-final`: the last state that runs on Supabase. Never move or delete it.
   - `pre-local-first`: the start point of this migration.
5. Create the **integration branch** `platform/local-first` from the tag `pre-local-first`, and push it. All migration work happens on branches **created from `platform/local-first`**, named `platform/<number>-<name>` (for example `platform/p1-infra`). Pull requests target `platform/local-first`, never `main`.
6. Also create `legacy/supabase` pointing to `supabase-final` so the old version is always one checkout away.
7. Copy the newest spec files into `docs/` on `platform/local-first` if they are missing (`06b`, `07`, `08`, and this file `09`). Do not edit their content.
8. `main` stays as is until Kevin decides, after the final acceptance, how and when it is replaced.
9. Rollback at any time: `git checkout supabase-final` (or `legacy/supabase`), which still has the working Supabase version.

**Translation rule for older and future specs** (docs 04 to 08): wherever a spec says Supabase RPC, `SECURITY DEFINER` function, RLS policy, Supabase Storage, `auth.uid()` or `anon`, implement it on the new platform as: Prisma migration for tables, triggers and indexes; an API endpoint plus service function for logic; the API policy module for access rules; disk storage for files; a public API route with rate limiting for what `anon` could call. Keep the **behaviour and validation rules** exactly as the spec says. Do not edit the old specs; add a short `docs/09-translation-notes.md` listing each translation you made.

## 4 · Phases

### Phase 0 · Sovereignty and safety (no code moves yet)
Branch `platform/p0-sovereignty`.

Create `docs/compliance/` with:
1. **`data-map.md`**: generated from the real schema. One table listing every table and column that holds personal data: what it is, why we collect it (purpose), sensitivity (normal, **special: religious belief or practice, children, health/counseling**), who may see it (role), and retention (proposed). Highlight: baptism and class status, counseling category, notes, feedback, family fields, phone, address, welcome form answers, attendance (shows religious practice), message log.
2. **`DATA-SOVEREIGNTY.md`**: the rules this project follows. Start from these and adjust after checking with Kevin:
   - The church (Omega Ministries) is the **data controller**. The developer who operates the system is a **processor** acting on the church's written instructions.
   - All personal data is stored and processed only on church-controlled hardware in Rwanda. **No cloud database, storage, analytics, error tracking or email/SMS provider** receives personal data.
   - Known data flows outside our control, to be disclosed in the privacy notice: WhatsApp and SMS links open on a volunteer's own phone (message text and the person's number go to that app and its operator); the church public website on Google Sites and Google Forms (existing, outside this app).
   - GitHub holds **code only**. No real personal data, no database dumps, no screenshots with real people, ever. Seed data is fake. Add a pre-commit check that blocks `.env`, dumps (`*.sql` with INSERT of real rows, `*.dump`) and large data files.
   - Netlify and Supabase must hold **no real data**. List what is in them now (should be seed only) and the retirement steps in Phase 9.
   - Backups stay on church-controlled media, encrypted, in Rwanda.
   - Collect the minimum. Children's details are never collected on public pages.
3. **`privacy-notice.md`**: a plain-language draft for the welcome page and Info Desk (what we collect, why, who sees it, how long, rights to access, correct, delete, how to ask, who to contact). Mark it **DRAFT for review by the church and a lawyer**.
4. **`decisions-needed.md`**: questions for leaders and a lawyer. At minimum:
   - Who is the named data protection contact at the church?
   - Must the church register with the supervisory authority (NCSA) as a data controller? (to be verified)
   - Does Rwanda's data protection law (Law No. 058/2021 of 13/10/2021, to be verified) restrict storing or transferring personal data outside Rwanda, and what does it require for a rented server? (to be verified)
   - Retention periods: how long do we keep visitors who never returned, class records, counseling notes?
   - Breach procedure: who is told, how fast? (The law sets a short deadline for notifying the authority, to be verified.)
   - Which roles may see counseling notes, prayer or feedback text, family data?
   - Is a rented VPS in Rwanda acceptable, or church premises only?
   - Consent wording for the welcome form and for storing a person's religious practice.
5. **`rights-procedures.md`**: how Admin handles a request to see, correct, export, or delete a person's data. This becomes real features in Phase 3: *export one person's data* and *erase or anonymise one person* (keeping aggregate counts).

Also in Phase 0: write `docs/compliance/inventory-of-cloud-services.md` listing every external service the repo uses now (Supabase project, Netlify, GitHub, fonts or CDNs loaded by the app, analytics, Sentry if any). Check `index.html` and the CSS for **external font or script URLs**. Offline and sovereignty both require **self-hosted fonts and assets** (Geist via `@fontsource` or local files). Add that to Phase 4.

Stop after Phase 0. Kevin reviews the documents.

### Phase 1 · Local infrastructure (database first)
Branch `platform/p1-infra`.

- `deploy/docker-compose.yml` with a `db` service first (the API and web come later):
  - Image `postgres` pinned to a specific tag (use the **major version of the current Supabase database** if it can be read with `select version()`, otherwise 17), never `latest`.
  - Named volume for data. **Do not bind-mount a Windows folder** (slow and permission problems). Keep the repo inside the WSL filesystem (`~/projects`), not under `/mnt/c`.
  - `restart: unless-stopped`, a healthcheck (`pg_isready`), memory limit, `shm_size`, log rotation.
  - Port bound to `127.0.0.1:5432` **for development only**, with a clear comment. In the production compose file the database has **no published ports**.
  - Credentials only from an env file that is **not committed**. Provide `.env.example` with fake values. Generate strong random defaults with a script (`scripts/gen-secrets.sh`).
  - Init script creates two roles: `church_owner` (runs migrations, owns objects) and `church_app` (runtime: not superuser, no create db or role, `CONNECTION LIMIT 20`, only the privileges the app needs). The app must **never** connect as the superuser or owner.
  - `ALTER SYSTEM` defaults for a small machine: `max_connections 50`, `shared_buffers`, `statement_timeout`, `idle_in_transaction_session_timeout`, `log_min_duration_statement 500`.
  - Set `TZ=Africa/Kigali` for the app, store timestamps as `timestamptz` (UTC).
- `scripts/` with `db-up`, `db-down`, `db-reset-dev` (dev only, refuses to run if the env says production), `psql` shell.
- Write `docs/local-setup.md` for Windows 11 + WSL2 + Docker Desktop (enable WSL integration, `.wslconfig` memory limit, how to check Docker is running, how to reach the DB). Test every command yourself and fix the doc until it works from a clean clone.
- Report: how to start the database, how to connect, what you could not test.

### Phase 2 · Schema, Prisma, seed
Branch `platform/p2-prisma`.

1. **Inventory** every migration in `supabase/migrations/` and every function, trigger, policy and view. Write `docs/supabase-to-prisma-inventory.md`: each item, what it does, and where it goes (Prisma model, raw SQL migration, API service, API policy, dropped).
2. Build a **clean baseline SQL**: the tables, constraints, indexes, enums and triggers **without** Supabase parts (`auth.*`, `storage.*`, `anon`/`authenticated` grants, `create policy`, `enable row level security`, `get_my_role()`, `my_team_member_id()`). Apply it to the local Postgres. Keep the logic of triggers (`apply_contact_log`, `stamp_assignment`, `m1_attendance_touch`, `baptism_registration_sync`) as plain SQL in raw migrations. Replace `auth.uid()` usage with a column set by the application, or move the logic to the API.
3. Prisma: use the **current stable Prisma** and follow its official docs for the current setup (generator, config file, driver adapter). Do not copy patterns from old tutorials. Steps: `prisma init`, `prisma db pull` against the local baseline database, **review and clean** `schema.prisma` (model and field names, enums, `@db.Uuid`, `@default(dbgenerated("gen_random_uuid()"))`, `@db.Timestamptz`, relations, indexes, `@@map` names), then create the **baseline migration** and mark it as applied (`migrate diff` / `migrate resolve`) so a fresh database and the existing one match. From now on all schema changes go through `prisma migrate`. Custom SQL (triggers, partial unique indexes, check constraints) goes in migration files created with `--create-only`.
4. New tables replacing Supabase auth: `users` (id, email, password_hash, role, team_member link, active, failed_login_count, locked_until, last_login_at), `sessions` (id hashed, user_id, created_at, expires_at, ip hash, user agent), `audit_log` (who, what, entity, entity id, time, no personal values in the message), `login_attempts` if needed. Roles stay: Admin, Info Desk, Follow-up Coordinator, Pastor.
5. **Indexes** (name them in the schema): `people(phone)`, `people(assigned_to, follow_up_status)`, `people(category)`, `people(date_registered)`, `attendance(service_date, person_id)`, `contact_log(person_id, created_at desc)`, `m1_attendance(session_id, person_id)`, `m1_enrollments(class_id, person_id)`, `welcome_submissions(status, submitted_at desc)` when those tables exist. Check each query with `EXPLAIN` once there is seed data. Do not add indexes without a query that needs them.
6. **Seed**: `prisma/seed.ts` creates fake data only: the roles, one admin per role with **random passwords printed once** (never committed), the people, volunteers, a class, a baptism service, templates. Re-runnable and idempotent. Fake phone numbers only (use a clearly fake range).
7. Acceptance: a fresh clone can run `db-up`, `prisma migrate deploy`, `prisma db seed` and get a working database; `prisma migrate status` is clean; a script compares the Prisma schema with the database and reports no drift.

### Phase 3 · The API
Branch `platform/p3-api`.

Stack: Node LTS, TypeScript (strict), **Fastify**, Prisma, `zod` for every input and output, `argon2` for passwords, `pino` for logs. Keep dependencies few and maintained; run `npm audit`.

Foundations (build these before features):
- **Config**: validated env at startup (zod); refuse to start with missing or weak secrets.
- **Auth**: login with email and password (argon2id), server-side **sessions** stored hashed in Postgres, cookie `HttpOnly; Secure; SameSite=Strict`, idle timeout (for example 8 hours) and absolute timeout (for example 24 hours), logout, change password, admin password reset. CSRF protection for state-changing requests (origin check plus token). No tokens in `localStorage`.
- **Rate limiting** (`@fastify/rate-limit` backed by Postgres or memory, per IP and per account): login (strict, with lockout and backoff), public welcome and reply routes (strict), everything else (generous). Return 429 with `Retry-After`.
- **Request limits**: body limit default 100 KB, upload route up to 25 MB with MIME and extension allow-list, JSON depth limit, query `limit` max 100, pagination everywhere, request timeout, `statement_timeout` in the database.
- **Database connections**: one Prisma client per process, pool size 10 (`connection_limit`), `church_app` role with a connection limit above that. Graceful shutdown. If the API ever runs in several instances, add PgBouncer; not now.
- **Headers**: `@fastify/helmet`, strict CSP (no external origins), CORS closed (same origin only through the proxy), no server banner, `Cache-Control: no-store` on authenticated responses.
- **Authorization**: one module `policy.ts` with a role-by-action matrix, used by every route (`can(user, 'people:read')`, `can(user, 'class:delete')`), plus **row scope** rules (a volunteer sees only their assigned people; Pastor read-only; counseling only Pastor and Admin). Default deny. A route without a policy declaration fails a startup check.
- **Audit log** for logins, failures, permission denials, exports, imports, deletions, role changes, assignment changes, certificate issuing, reads of sensitive records (counseling, notes).
- **Errors**: never leak stack traces, SQL, ids of other records or whether an email exists. Logs must **not contain personal data** (no names, phones, notes, message text).
- **Public routes** (no login) are the only ones that replace `anon` RPCs: the welcome form (`docs/08`), the returning-visitor shortcut, the reply pages (`docs/06`, `docs/07`). Each: strict rate limit, honeypot, zod validation, constant-shaped responses, expiring single-use tokens hashed in the database.
- **Files**: store under a volume path outside the web root with random names, never user-supplied names; check size, MIME by content, extension; download only through the API after a permission check or through a short-lived signed link; `Content-Disposition: attachment`; no directory listing. Add the clamav option as a later note.
- **Rights tools** from Phase 0: export one person's data, anonymise or erase one person (with confirm and audit).

Then port the features in this order, each as its own commit with tests: auth and `/me`; people (list with sort, filter, group, search, create, edit, drawer data); check-in and attendance; contact log and follow-ups; board moves (with the docs/07 rules); attention; assign and templates; volunteers overview; Home metrics; M1 and Baptism (everything built so far); Excel import (docs/07 Part D) as an API job with the same validation. Keep behaviour identical to what the screens do now.

Testing: Vitest + a real test Postgres in Docker. Cover auth, rate limits, authorization per role, input validation, and every previously RPC-based rule.

### Phase 4 · Port the web app
Branch `platform/p4-web`.
- Add `src/lib/api/` as the **only** place that calls `fetch`. Typed client from the shared zod schemas. Components never call fetch directly.
- Replace every `supabase` import and call, one feature at a time. When done, **remove `@supabase/supabase-js`**, the env vars, generated Supabase types and the Supabase folder references in README. (The tag keeps the old version.)
- Auth context uses `/api/auth/me`. A global **error boundary** so a crash shows a message and a retry button, not a white page.
- Self-host fonts and icons; remove every external URL. Verify with the network tab: **zero requests to other domains**.
- Vite dev server proxies `/api` to the API.
- Keep all UI rules from docs 05 to 08 (no scrollbars on tabs, centered dialogs, names not ids).

### Phase 5 · Containers
Branch `platform/p5-containers`.
- `apps/api/Dockerfile`: multi-stage, `node:<lts>-slim` pinned, production dependencies only, runs as a **non-root user**, read-only root filesystem where possible, `HEALTHCHECK`, no secrets in layers, `.dockerignore`.
- `apps/web/Dockerfile`: multi-stage, build the Vite app, serve the static files with Caddy (or nginx), non-root where possible.
- `deploy/docker-compose.prod.yml`: services `proxy`, `web`, `api`, `db`, `migrate` (a one-shot job that runs `prisma migrate deploy` before the API starts), `backup`. Two networks: `public` (proxy only) and `internal` (api, db, backup). Only the proxy publishes 80 and 443. `restart: unless-stopped`. Resource limits. Healthchecks and `depends_on: condition: service_healthy`.
- Image hygiene: pin versions, scan with Trivy (or `docker scout`) and report findings, drop capabilities (`cap_drop: [ALL]`), `no-new-privileges`, tmpfs for temp dirs.
- One command to start everything: `make up` (or a script), and `make logs`, `make down`.

### Phase 6 · HTTPS without browser warnings
Branch `platform/p6-https`.
- Caddy as the proxy. Prepare **two modes** and document both:
  1. **Real domain, private address.** Kevin's domain gets an A record pointing to the machine's **private LAN IP** (for example `app.<domain>` → `192.168.x.x`). Caddy obtains a Let's Encrypt certificate with the **DNS challenge** (needs the DNS provider module and an API token kept in the env file). Result: a valid certificate on every device, including visitors' phones, with **no internet needed at runtime** (renewal needs a short internet connection roughly every 60 days, so schedule and document it, and add an expiry alert on the status page).
  2. **Development**: `https://localhost` with Caddy's internal CA or mkcert.
- A local DNS entry or router setting so the domain resolves on the LAN without internet. Document it (router DNS override, or a small local resolver).
- Redirect HTTP to HTTPS, HSTS only after the real certificate works, TLS 1.2+.
- Do not publish the machine to the internet. No port forwarding.
- Kevin sets up the domain and DNS himself; the agent prepares config, a checklist, and a test script that confirms the certificate, redirect and headers.

### Phase 7 · Availability, backups, speed
Branch `platform/p7-ops`.
- Auto start on boot (Docker Desktop startup on Windows; for a Linux mini PC, systemd). Restart policies tested by killing containers and rebooting.
- **Backups**: nightly `pg_dump` (custom format) plus the uploads volume, **encrypted** with `age` or `gpg` (the key kept offline, not on the same machine), to an external drive. Retention: 7 daily, 4 weekly, 6 monthly. A **restore script** and a **restore test** that loads the latest backup into a temporary database and checks row counts. Document the monthly restore drill. A backup that has never been restored does not count.
- **Status page** for Admin (`/admin/health`): API up, database up, last backup time and size, certificate expiry, disk free, number of failed logins today. No personal data.
- Power: document a UPS recommendation and safe shutdown.
- **Speed**: `EXPLAIN` the slow queries; pagination and `select` only needed columns; gzip or brotli at the proxy; static asset caching with hashed filenames; no N+1 queries (Prisma `include` carefully); a simple load test (k6 or autocannon) with 20 concurrent users on Check-in and People, report the numbers. Targets on a modest PC: Check-in search under 200 ms, People list page under 300 ms.
- Disk: BitLocker or LUKS full disk encryption recommended; note it in the setup doc.

### Phase 8 · Roles and security verification
Branch `platform/p8-security`.
- Write `docs/permissions.md`: the role matrix. Starting point, adjust with Kevin:

| Area | Admin | Info Desk | Follow-up Coordinator | Pastor |
|---|---|---|---|---|
| Check-in, new visitor | yes | yes | read | read |
| People list, basic fields | yes | yes (no notes) | assigned and unassigned | read |
| People notes, feedback text, family | yes | no | assigned only | read |
| Counseling records | yes | no | no | yes |
| Follow-ups and contact log | all | no | assigned (all as coordinator) | read |
| Assign people | yes | no | yes | no |
| Classes: attendance ticks, enrol | yes | yes | yes | read |
| Class: delete, certificates, materials delete | yes | no | no | no |
| Baptism: register, mark done | yes | no | yes | read |
| Import, export, erase a person | yes | no | no | no |
| Users and roles, templates, settings | yes | no | no | no |
| Audit log, health page | yes | no | no | no |

- Automated tests prove every cell of that matrix (allowed and denied) against the running API.
- Run and report: `npm audit`, container scan, a ZAP baseline scan or equivalent against the local site, checks for SQL injection attempts on search fields, XSS in notes and feedback text, CSRF, session fixation, brute force on login, oversized bodies, path traversal on uploads, public route abuse. Fix findings or list them honestly.
- Confirm in the browser that no requests leave the LAN and nothing personal is in logs, URLs or local storage.
- Ask Kevin to try to break roles with a real login for each role.

### Phase 9 · Offline test and retiring the cloud
Branch `platform/p9-cutover`.
- **Offline acceptance test**: unplug the internet (Wi-Fi router uplink off, but the LAN on). From a second device on the LAN, open the app by its domain over HTTPS: log in, check in a person, assign, log a contact, tick class attendance, submit the welcome form from a phone on the church Wi-Fi. Everything must work. Record results.
- **WSL2 reachability**: WSL2 uses NAT by default, so other devices cannot reach it. Document the fix (mirrored networking in `.wslconfig` on current Windows 11, or a `netsh interface portproxy` rule plus firewall rule), test from a phone, and note that a dedicated Linux mini PC avoids this.
- **Retire Supabase and Netlify** (only after Kevin confirms in writing): export seed data if wanted, delete the Supabase project, remove its keys from every place, rotate anything that was ever exposed, stop or replace the Netlify site with a plain "moved" page that serves no data, remove the Netlify env variables and any GitHub Actions secrets for them. Record the dates in `docs/compliance/inventory-of-cloud-services.md`.
- Final report to Kevin: what runs where, how to start and stop it, how to back up and restore, known gaps.
- Then Kevin decides how `platform/local-first` replaces `main`.

## 5 · Rules for the agent (apply always)
- One phase per branch. Stop after each phase with a short report: what changed, how to run it, what you could not test.
- Never push to `main`. Never merge. Open pull requests into `platform/local-first` and stop.
- **No real personal data** anywhere during this work: not in the repo, tests, logs, screenshots or chat. Fake seed data only.
- Never commit secrets. Run a secret scan before each push.
- Do not delete Supabase code until its replacement passes acceptance in that phase (the tag already protects us, but keep the app working on the branch).
- Prefer boring, well-maintained tools. Pin versions. Keep the number of dependencies low.
- When a spec and reality disagree, or a legal question appears, **ask Kevin** instead of guessing.
- Report honestly: say plainly what is unverified. Do not claim compliance. The documents you write support the church's compliance work; they do not prove it.
- Windows + WSL2 + Docker Desktop is the development environment. Every command in the docs must work from a clean clone there.

## 6 · Order summary
P0 sovereignty and documents → P1 database in Docker → P2 Prisma, baseline, seed → P3 API → P4 web port → P5 containers → P6 HTTPS → P7 backups and speed → P8 roles and security → P9 offline test and retire the cloud.

Estimated effort for one careful developer plus an agent: P0 to P2 about a week, P3 and P4 several weeks (most of the work), P5 to P9 about two weeks. Features from docs 06b, 07 and 08 not yet built are implemented **after** P4 on the new platform, using the translation rule in section 3.
