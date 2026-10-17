# Decisions needed — from church leaders and a lawyer

Plain questions, honest answers, next action. Nothing here is legal advice. **"to be verified"** means: confirm with NCSA (National Cyber Security Authority) or a lawyer before relying on it.

## For church leaders (Kevin + team)

1. **Data protection contact.** Who is the named contact at the church (name, phone/email) that appears on the privacy notice and answers data questions? → blocks publishing `privacy-notice.md`.
2. **Retention.** How long do we keep: (a) visitors who never returned; (b) M1 class records and certificates; (c) counseling notes; (d) contact-log notes? Answers write the retention column in `data-map.md`.
3. **Roles.** Confirm: who may see counseling notes, prayer/feedback text, family data? Starting proposal: **Pastor + Admin for counseling; Admin for all notes; Info Desk sees neither** (`data-map.md`). Confirm or change.
4. **Rented server.** Is a rented VPS in Rwanda acceptable, or church premises only (a mini PC behind the desk)? Current plan: church premises first, per docs/09.
5. **Consent wording.** Approve or rewrite the two welcome-form consent checkboxes in `privacy-notice.md`.
6. **Registers.** Baptism records are treated as a church register (kept long). Confirm the church wants that treated as permanent.
7. **Google side.** Confirm the Google Sites/Google Forms pages (what they collect today) do not ask for religious-sounding or children's data.

## For a lawyer (church instructs, we execute)

8. **Controller registration.** Must the church register with NCSA as a data controller/processor? (to be verified) → if yes, record outcome in `inventory-of-cloud-services.md`.
9. **Transfer and storage rules.** Does Rwanda's data protection law (Law No. 058/2021 of 13/10/2021, to be verified) restrict storing or transferring personal data outside Rwanda, and what does it require for a rented server? (to be verified) → informs rule 2 of `DATA-SOVEREIGNTY.md`.
10. **Breach procedure.** Does the law set a deadline for notifying the supervisory authority, and what notification procedure should the church follow? (to be verified) → a breach runbook then becomes part of Phase 7's ops docs.
11. **Special category handling.** What does the law require for religious-belief data (our baptism/attendance/class records) — explicit consent, church-internal processing? (to be verified) → adjusts the consent wording and `DATA-SOVEREIGNTY.md` rule 1.

## For Kevin (development)

12. **Repo rule sign-off.** Approve the GitHub "code only" enforcement (pre-commit hook, `DATA-SOVEREIGNTY.md` §4) and the "no real data in cloud services" checklist before Phase 9 retirement.
13. **Seed-only certification.** Confirm, after reading `inventory-of-cloud-services.md`, that the current Supabase and Netlify contents are (or are not) seed/demo only — the inventory does not read row contents, so Kevin's word (or a guided check) closes that gap.
