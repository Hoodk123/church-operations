#!/bin/sh
# Stops the local database. DATA IS KEPT (the named volume stays).
#     bash scripts/db-down.sh
# To stop AND ERASE the data (reset to a brand-new empty database), use
#     bash scripts/db-reset-dev.sh      (development only - see that script)
set -eu
cd "$(dirname "$0")/.."

docker compose -f deploy/docker-compose.yml --project-directory . down
echo "Database stopped. Your data is safe in the 'church_pgdata' volume."
