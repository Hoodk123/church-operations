#!/bin/sh
# Opens a psql SQL shell inside the running database as the owner role.
#     bash scripts/db-psql.sh
# Only church_owner (powers everything, including destructive actions). The
# API role church_app runs through the Phase 3 API - never from here.
set -eu
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "ERROR: no .env here. Run bash scripts/db-up.sh first." >&2
  exit 1
fi
[ "$(docker inspect --format='{{.State.Status}}' church-db 2>/dev/null)" = "running" ] || {
  echo "ERROR: church-db is not running. Start it with: bash scripts/db-up.sh" >&2
  exit 1
}

exec docker exec -it church-db psql \
  -U "$(sed -n 's/^POSTGRES_USER=//p' .env)" \
  -d "$(sed -n 's/^POSTGRES_DB=//p' .env)"
