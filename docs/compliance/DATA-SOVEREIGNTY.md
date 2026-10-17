# DATA-SOVEREIGNTY.md — the rules this project follows

Omega Ministries' app moves off third-party clouds so that church members' personal data — names, phones, addresses, family context, counseling and prayer notes, and religious belief or practice (baptism, M1 class, follow-up) — lives on **hardware the church controls, in Rwanda**, and the app runs on the church Wi-Fi with **no internet**. Nothing in this document is legal advice; where a legal claim appears it is marked **to be verified** with the National Cyber Security Authority (NCSA) or a lawyer.

## 1. Controller and processor

- The church (Omega Ministries) is the **data controller**. Kevin, the developer operating the system, is a **processor** acting on the church's written instructions. (to be verified — the church must confirm this role split in writing; see `decisions-needed.md`.)

## 2. Where data lives

- All personal data is stored and processed only on church-controlled hardware in Rwanda. **No cloud database, storage, analytics, error tracking or email/SMS provider receives personal data.**
- The target stack (docs/09): a local PostgreSQL database in Docker, our own API, a Caddy proxy — private network only. Only the proxy has ports.
- Backups stay on church-controlled media (**external drive, encrypted**, key offline), inside Rwanda.

## 3. Known data flows outside our control — disclosed in the privacy notice

| Flow | What leaves our system | Control |
|---|---|---|
| WhatsApp / SMS links | Volunteer taps a generated `wa.me`/`sms:` link with message text and phone number in the URL; those go to the volunteer's own messaging app and its operator (WhatsApp/Meta or the phone carrier) | Disclosed in the privacy notice; message bodies are never stored in our database |
| Church public website (Google Sites) and Google Forms | Contact happens on Google infrastructure — existing, outside this app | Disclosed; the Google Form must not collect religious-sounding answers (to be verified with the church) |
| GitHub | **Code only.** No real personal data, no database dumps, no screenshots with real people, ever. Seed data is fake | Enforced by `scripts/git-hooks/pre-commit` (below) |

## 4. GitHub holds code only — enforced

`scripts/git-hooks/pre-commit` (run `bash scripts/git-hooks/install.sh` once) blocks staged commits of:

- any `.env` or `.env.*` file (secrets);
- any `*.dump`, `*.bak2` backupish file, any file **over 5 MB** (bulk data);
- any `*.sql` **outside `supabase/migrations/` and `prisma/migrations/`** that contains row `INSERT`s (migration DDL there is allowed by design).

## 5. Supabase and Netlify hold no real data

Verified on 2026-10-17 against the live Supabase project (counts only, no row contents read): **team_members 0, people 5, attendance 5, contact_log 1, message_templates 9, m1_classes 2, m1_sessions 9, m1_enrollments 1, m1_attendance 1, m1_message_log 0, m1_reply_links 1, m1_absence_replies 0, m1_materials 0, baptism_events 1, baptism_registrations 0; storage bucket `m1-materials`: 0 files.** These tiny counts are consistent with seed/demo data only, but **I did not read row contents, so I cannot certify every row is fake** — see `inventory-of-cloud-services.md`. Netlify hosts the deployed web app (no `netlify.toml` in the repo, so it is plain Vite static hosting); only public code is deployed, but confirm Admin never puts personal data on a Netlify function/edge. Retirement happens in Phase 9, only after Kevin confirms in writing.

## 6. Data minimisation

- Collect the minimum: the welcome flow collects name, phone, (optional) how-they-found-us and consent — nothing else.
- **Children's details are never collected on public pages.** A child appears in the system only when a guardian brings them in person.
- Counseling records (notes, category Counseling) are never visible to Info Desk or Follow-up Coordinators; Pastor and Admin only (see `data-map.md`).

## 7. Success criteria

The migration (docs/09, Phases 1–9) is "sovereign" only when ALL of these hold:

1. unplugged internet ⇒ app still works on LAN over HTTPS;
2. zero requests to third-party domains in the browser network tab;
3. no personal data in logs, URLs, localStorage, screenshots, chat, or backups outside church media;
4. restores from backup have been **tested** (a backup that was never restored does not count).
