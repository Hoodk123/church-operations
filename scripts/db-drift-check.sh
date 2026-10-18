#!/usr/bin/env bash
# Phase 2 drift check (docs/09): the database must match the Prisma schema.
#
# It runs two checks and fails loudly if either finds a problem:
#   1. prisma migrate status  - every migration applied, nothing missing
#   2. prisma migrate diff    - live database vs prisma/schema.prisma is empty
#
# Exit codes: 0 = no drift, 1 = drift or error.
# Run it where the repo is checked out AND `npx prisma` is available; it needs
# the .env database URL (built by prisma.config.ts) and a running local stack.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

STATUS_OUTPUT=$(npx prisma migrate status 2>&1)
if ! echo "$STATUS_OUTPUT" | grep -q "Database schema is up to date\|already in sync\|No pending migrations"; then
  echo "migrate status did not report a clean state:"
  echo "$STATUS_OUTPUT"
  exit 1
fi
echo "migrate status: OK"
echo "$STATUS_OUTPUT" | tail -n 1

# from-config-datasource introspects the live database; --exit-code makes the
# CLI return 2 when the diff is not empty. Prisma does not track triggers,
# functions or CHECK constraints, so only tables/columns/indexes/enums/foreign
# keys are compared here; scripts/db-drift-check keeps those in sync because
# they live in migrations that deploy ran.
DIFF_OUTPUT=$(mktemp)
npx prisma migrate diff \
  --from-config-datasource \
  --to-schema "prisma/schema.prisma" \
  --script \
  --exit-code >"$DIFF_OUTPUT" 2>&1
DIFF_EXIT=$?

if [ "$DIFF_EXIT" -eq 0 ]; then
  echo "schema drift check: no drift, database matches prisma/schema.prisma"
  exit 0
fi

if [ "$DIFF_EXIT" -eq 2 ]; then
  echo "schema drift: database and prisma/schema.prisma differ:"
  cat "$DIFF_OUTPUT"
  exit 1
fi

echo "drift check failed to run:"
cat "$DIFF_OUTPUT"
exit 1
