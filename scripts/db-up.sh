#!/bin/sh
# Starts the local database. From the repo root (or WSL repo folder):
#     bash scripts/db-up.sh
# Prints the container state and a "how to connect" summary when healthy.
set -eu
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "No .env found - creating one with fresh random secrets..." >&2
  sh scripts/gen-secrets.sh
fi

docker compose -f deploy/docker-compose.yml --project-directory . up -d

echo "Waiting for the database to report healthy..."
attempts=0
until docker inspect --format='{{.State.Health.Status}}' church-db 2>/dev/null | grep -q healthy; do
  attempts=$((attempts + 1))
  if [ "$attempts" -gt 30 ]; then
    echo "!'! the database did not become healthy in 5 minutes. Check:" >&2
    echo "    docker logs church-db --tail 50" >&2
    exit 1
  fi
  sleep 10
done

echo "Database is up."
echo "  Connect with:   bash scripts/db-psql.sh"
echo "  (or)            docker exec -it church-db psql -U \"\$(sed -n 's/^POSTGRES_USER=//p' .env)\" -d \"\$(sed -n 's/^POSTGRES_DB=//p' .env)\""
echo "  from JetBrains/DataGrip etc.: 127.0.0.1, port = PG_PORT in .env (localhost only);"
echo "  user/password from .env - the password is NOT printed here."
