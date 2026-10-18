-- Runs ONCE, on the first start of an empty data directory, by the
-- superuser (POSTGRES_USER = church_owner). Tune the server for a small
-- machine. These go through ALTER SYSTEM, which writes postgresql.auto.conf
-- (docker entrypoint later runs pg_reload_conf() semantics on restart; we
-- reload explicitly below so they apply from the first session).
--
-- Version choice: the live Supabase database runs "PostgreSQL 17.6" and we
-- pin the local image to 17.9 (17 series). docs/09 Phase 1.

ALTER SYSTEM SET max_connections = '50';
-- Notes on the values:
-- max_connections  50   The API (Phase 3) will hold a pool of ~10. 50 leaves
--                       room for psql, backups and migrations.
-- statement_timeout     A query longer than this is killed instead of hurting
--                       the Info Desk. Backups/migrations set it to 0 for
--                       their own session when they need long runs.
-- log_min_duration_statement 500  Every query slower than half a second is
--                       logged, so we can find slow spots before they hurt.
ALTER SYSTEM SET statement_timeout = '60s';
ALTER SYSTEM SET idle_in_transaction_session_timeout = '60s';
ALTER SYSTEM SET log_min_duration_statement = '500';
SELECT pg_reload_conf();
