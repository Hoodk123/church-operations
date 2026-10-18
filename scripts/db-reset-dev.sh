#!/bin/sh
# Resets the DEVELOPMENT database to an empty, freshly initialised state.
#     bash scripts/db-reset-dev.sh
# Danger: erases every table, row, user and password in the volume. Guarded:
# refuses to run unless CHURCH_ENV=dev in .env, and asks for a typed word.
# The PRODUCTION database (church machine) can never be wiped by this script
# from a dev PC because .env there will say CHURCH_ENV=production.
set -eu
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "ERROR: no .env here. Run this from inside the repo (bash scripts/db-reset-dev.sh)." >&2
  exit 1
fi

env_value=$(sed -n 's/^CHURCH_ENV=//p' .env)
if [ "$env_value" != "dev" ]; then
  echo "ERROR: .env says CHURCH_ENV=\"$env_value\", not \"dev\"." >&2
  echo "       This command would have erased a real database. Stopped on purpose." >&2
  exit 1
fi

printf 'This deletes ALL local data (volume church_pgdata). Type "reset" to confirm: '
read -r answer
if [ "$answer" != "reset" ]; then
  echo "Aborted. Nothing was deleted."
  exit 1
fi

docker compose -f deploy/docker-compose.yml --project-directory . down -v
# down -v removes the project's named volumes; the explicit rm covers a
# manually-created straggler volume only (ignore if absent).
docker volume rm church_pgdata church-operations_church_pgdata >/dev/null 2>&1 || true

echo "Data erased. Starting a fresh database (init scripts run again)..."
sh scripts/db-up.sh
