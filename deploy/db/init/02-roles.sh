#!/bin/bash
# Runs ONCE, first start only, after 01-server-config.sql (alphabetical).
# Executed by the official postgres entrypoint as a shell script, so the real
# secrets are available as environment variables here only.
#
# Two roles, always:
#   church_owner  (already created by the official entrypoint from
#                  POSTGRES_USER/POSTGRES_PASSWORD). Owns the objects and
#                  runs migrations (Prisma, Phase 2). Maintenance as owner is
#                  normal and expected.
#   church_app    The ONLY role the application API (Phase 3) uses at
#                 runtime. Not superuser, cannot create databases or roles,
#                 connection-limited. The app must never connect as
#                 church_owner or the superuser.
set -euo pipefail

: "${POSTGRES_DB:?POSTGRES_DB missing}"
: "${POSTGRES_USER:?POSTGRES_USER missing}"

if [ -z "${CHURCH_APP_PASSWORD:-}" ]; then
  echo "ERROR: CHURCH_APP_PASSWORD is not set. Run scripts/gen-secrets.sh and fill .env." >&2
  exit 1
fi
if [ "${#CHURCH_APP_PASSWORD}" -lt 24 ]; then
  echo "ERROR: CHURCH_APP_PASSWORD is shorter than 24 characters. Refusing to continue." >&2
  exit 1
fi

# 0. Hardening: the official image generates pg_hba.conf with TRUST for
#    127.0.0.1/::1 (a leftover of first-boot convenience). Anything inside the
#    container connecting over loopback must still authenticate, so flip those
#    to scram-sha-256. The catch-all "host all all all scram-sha-256" line
#    appended by the entrypoint already enforces passwords for every other
#    address. Unix-socket ("local") lines stay trust ON PURPOSE: only code
#    running inside the container (our scripts, psql via docker exec) can use
#    them.
PG_HBA="$PGDATA/pg_hba.conf"
# GNU sed -E may mis-handle side-by-side "s///;s///" with \1 refs, so use two
# separate -e expressions; each rewrites one trust line to scram-sha-256.
sed -E -e 's/^(host .*)trust$/\1scram-sha-256/' -i "$PG_HBA"

psql -v ON_ERROR_STOP=1 \
     --username "$POSTGRES_USER" \
     --dbname "$POSTGRES_DB" \
     --set=app_password="$CHURCH_APP_PASSWORD" <<'SQL'
-- 1. The runtime role. :'app_password' is expanded (and quote-safe) by psql.
DROP ROLE IF EXISTS church_app;
CREATE ROLE church_app
  LOGIN
  PASSWORD :'app_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE
  CONNECTION LIMIT 20;

-- 2. Schema access. Only church_owner creates objects there.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO church_app;

-- 3. Everything church_owner creates in the future is automatically usable
--    by church_app - no need to chase every new migration with grants.
--    church_app still gets NO power over the server itself.
ALTER DEFAULT PRIVILEGES FOR ROLE church_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO church_app;
ALTER DEFAULT PRIVILEGES FOR ROLE church_owner IN SCHEMA public
  GRANT SELECT, UPDATE ON SEQUENCES TO church_app;
ALTER DEFAULT PRIVILEGES FOR ROLE church_owner IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO church_app;
SQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -c "SELECT pg_reload_conf();"

echo "init/02-roles.sh: pg_hba hardened (scram on loopback), church_app created with limited rights."
