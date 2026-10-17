# Rights procedures — how Admin answers a data request

How the Admin role handles a resident's request to **see, correct, export, or delete** their data. In today's Supabase app: given verbally-by-help pages. From **Phase 3 (docs/09)** these become real features; until then Admin follows this runbook by hand. Every step below is written into the privacy notice's "Your rights".

For every request the Admin **records the request in the audit log** once audit_log exists (Phase 2): date, who asked, what was asked, what was done. A request is answered within a reasonable time (target: 7 days; legal deadline to be verified — see `decisions-needed.md` Q10–11).

## 1. Ask to see ("Know what you hold about me")

Tomorrow (Phase 3): Admin opens the person's record and shows it; the **export feature (below)** is the printable answer. Today: Admin opens People → person drawer, walks through every visible field with the person, including notes only if the Admin judges them appropriate to share — notes may contain third-party (other people's) info that must not be disclosed. **If notes mention another person, redact that other person's name before showing anything.**

## 2. Ask to correct ("Fix my data")

Everyone may correct immediately via the drawer/ui (existing feature). Admin may move the person out of a mistaken category (e.g., "Counseling" entered in error) — correction, not deletion: keep a plain note "category corrected at person's request, date" and **no personal content in that note** (audit rule).

## 3. Ask to export ("Put my data on paper")

Phase 3 feature: **export one person's data** — a single document (PDF) with every field of their record: people row, attendance, contact log, class records, baptism registration, absence replies. Rules:

- file carries the person's own data only, generated server-side, sent over the LAN session (no email);
- exports are audited (who exported, when, for whom — no personal values in the audit message);
- third-party mentions in notes are **redacted** before the file is produced.

Today: Admin compiles from the screens by hand.

## 4. Ask to erase ("Delete me") or anonymise

Phase 3 feature: **erase or anonymise one person**, keeping aggregate counts. The two options:

- **Anonymise (default).** Replace name/phone/email/address/notes with "Removed at request", keep the record's statistics value (attended N services, completed M1 in year X). Attendance rows, contact_log rows, message log rows stay but lose the identity link. Baptism register rows stay (church register rule, `decisions-needed.md` Q6).
- **Hard erase (only if the person insists).** Delete the person row (cascades to attendance, contact_log, enrollments, baptism registration, message log, reply links). Certificates already issued are not re-issued; the certificate sequence is not rewound. If rows are needed for a mandatory church register, use anonymise instead — legal justification to be verified.

Both require: explicit confirmation dialog naming the person, Admin only (role matrix below), full audit entry, and the person is told what will remain (aggregates / register). **Children's records** always follow the same path; there is no public-page data to erase for children because children are never collected publicly.

Role matrix for these tools (docs/09 Phase 8): see = Admin (all roles via screens); correct = Admin + coordinators today; **export/erase tools: Admin only**, never Info Desk or coordinators.

## 5. Refusals and exceptions

A refusal (e.g., erasing a code-required register row) must (a) be explained to the person in writing (what remains and why), (b) be recorded in the decisions log. If the person escalates, they may contact NCSA (address to be verified when the privacy notice is finalised).

---

*This runbook is runbook paper today, enforced software from Phase 3. Nothing here is legal advice; final wording to be reviewed by NCSA or a lawyer (to be verified).*
