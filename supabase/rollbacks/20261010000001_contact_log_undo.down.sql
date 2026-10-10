-- Rollback for 20261010000001_contact_log_undo.sql
drop trigger if exists contact_log_revert on public.contact_log;
drop function if exists public.revert_contact_log();
drop policy if exists "contact_log_delete_own_today" on public.contact_log;
