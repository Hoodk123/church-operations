# Inventory of cloud services — what touches this system today

Checked on **2026-10-17** on `platform/p0-sovereignty`. Goal: list, show what must move or be retired when we leave the cloud (docs/09 Phase 9), and prove "no real data" where possible — honestly marking what is **not verified**.

## 1. Supabase (database + auth + storage) — RETIRE in Phase 9

Included today: Postgres database (public schema, 15 tables — see `data-map.md`), Supabase Auth (`team_members.auth_user_id` → `auth.users`), storage bucket `m1-materials`, and the two anon RPCs (`get_reply_context`, `submit_absence_reply`).

**Verified live, counts only (no row contents read):** team_members **0**, people **5**, attendance **5**, contact_log **1**, message_templates **9**, m1_classes **2**, m1_sessions **9**, m1_enrollments **1**, m1_attendance **1**, m1_message_log **0**, m1_reply_links **1**, m1_absence_replies **0**, m1_materials **0**, baptism_events **1**, baptism_registrations **0**; storage: bucket `m1-materials` with **0 files**.

Assessment: counts this small are consistent with seed/demo rows only. **I did not look at row contents (per the "counts only" rule), so I cannot certify every row is fake — Kevin confirms this in `decisions-needed.md` Q13 or we do a guided row-level review together.** Nothing in the counts suggests real-member volume (5 people total).

Retirement steps (Phase 9, only after Kevin confirms in writing): export wanted seed → delete project, rotate every key (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, dashboard password, provider keys), then delete. Record dates here.

## 2. Netlify (static web app hosting) — RETIRE or replace in Phase 9

**Verified:** there is **no `netlify.toml` in this repo** and the repo contains no Netlify function/env code. So Netlify is plain static hosting of the built Vite app (per `docs/08`, the site lives at `https://church-operations.netlify.app`). What Netlify serves is public code only, but I could **not inspect the Netlify dashboard** (no CLI credentials here): unverified items are the deploy settings, custom domains, any form/identity add-on, and access logs. Kevin: please check your Netlify account settings; the retirement step is "point the domain to the Caddy container", not "delete the site" — keep a plain static "moved" page first.

## 3. GitHub (code hosting) — KEEP, code only

- **Verified by full-history scan** (all 40 reachable commits): no `.env`, `*.dump`, or key-pattern hits (the only pattern matches were SVG path data and the `microtask-1.2.3.tgz` npm path in `package-lock.json` — benign). No GitHub Actions workflows exist (`.github/` absent).
- Enforced going forward: `scripts/git-hooks/pre-commit` blocks `.env*`, dumps, oversized files, and row-INSERT `.sql` **outside `supabase/migrations/` and `prisma/migrations/`** (`DATA-SOVEREIGNTY.md` §4).
- **Not verifiable from here:** GitHub Secrets (if any) and the `github-security` SSH deploy key setup — Kevin should confirm no Supabase/Netlify tokens sit in repo/org secrets.

## 4. External URLs the app actually loads at runtime — NONE (verified)

- `index.html` is clean: no CDN, no external font, no analytics.
- Fonts: **self-hosted already** — `@fontsource-variable/geist` ships Geist woff2 files inside the bundle (visible in the build output). No Phase-4 font work is strictly needed for fonts, but the "zero external requests" network-tab check in Phase 4 stays.
- `src/` contains no third-party URLs that fetch resources; the only `https://` hits are `wa.me`/`sms:` links the user taps (runtime privacy disclosure, `DATA-SOVEREIGNTY.md` §3) and `supabase.com` appearing in `components.json` (shadcn registry URL — developer tooling, not runtime).
- `docs/mockups/*.html` reference `fonts.googleapis.com` — static design files, never deployed; they may be touched only when the docs move (docs/09 step 7 says do not edit specs' content; mockups are not specs — leave them but never deploy `docs/mockups/`).

## 5. Nothing else found

No analytics, no Sentry/error tracking, no email/SMS provider SDK (WhatsApp/SMS are the volunteer's own phone apps), no CI/CD beyond the git push. npm registry is build-time only.

## Conclusion

Only **Supabase** (data + auth + storage) and **Netlify** (static site) actually serve real artifacts today. Both are retired in Phase 9. GitHub stays for code only. **Unverified items carried into the report:** Netlify dashboard contents, GitHub secrets, and Supabase row contents (counts only were read).
