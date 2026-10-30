# AGENTS.md — working rules for AI agents on this repo

## Hard rules
- Never push to `main`. Work on the current phase branch, push after each green item.
- One logical item = one commit. Stop after an item only if its checks fail.
- Fake/seed data only everywhere: no real names, phones or notes in code, tests, logs, commits.
- Never commit secrets (tokens, passwords, private keys). `.env` stays gitignored; the
  GitHub token must never appear in any file, log or commit message.
- No external URLs at runtime (sovereignty rule): fonts, icons, CDNs must all be self-hosted.
- Strict TypeScript/zod on every API input and output; no `any`; no personal data in logs
  or audit messages.
- If the spec and the code disagree, or a product/legal decision is needed, ask one short
  question instead of guessing.
- Windows dev: DB is the Docker container `church-db` on `127.0.0.1:5433`; use PowerShell
  (`Select-Object`), not `tail`.
- Use caveman style. Read only what the task needs. Use context7 for library APIs.
## Current phase
**Phase 3 · The API** on branch `platform/p3-api` (docs/09-local-first-migration.md).
PR target: `platform/local-first`.

## Work order (docs/09 Phase 3 wrap-up)
- [x] A. pull + typecheck + smoke green
- [x] B. route-registry test (exact route inventory) + policy alignment
- [x] C. vitest config + per-role x per-action matrix test
- [x] D. public welcome + returning routes, attention endpoint, export-person,
      CSV import (docs/07 Part D), audits for notes/counseling reads
- [x] E. `TRUST_PROXY` env (off unless behind the trusted proxy)
- [x] F. CI workflow `.github/workflows/ci.yml`
- [x] G. `@prisma/client` moved to dependencies

## Verification before every push
`npx tsc --noEmit -p api` then `npm test` then `npx tsx api/tests/smoke.ts` → all green.

## Known gaps (state honestly in reports/PR)
- Counseling routes (`counseling:read`/`write`) do not exist yet; policy tests cover them only.
- Staff-side welcome-submission review screen and the photo/status flow are Phase 4 territory.
- M1 absence-replies access is not yet tightened to Pastor+Admin (needs a church decision).
- `People.phone` is not unique: use `findFirst`, never `findUnique`.
- CI's first real run has not been observed by an agent yet (verify after first push).
