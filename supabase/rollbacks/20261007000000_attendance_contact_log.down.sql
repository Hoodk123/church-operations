-- Rollback for the Task 4 baseline (20261007000000_attendance_contact_log).
-- WARNING: this deletes data. Only run if Kevin asks.
-- Run against the live database ONLY to undo the original Task 4 bootstrap.

drop policy if exists "pastor can update only their assigned people" on public.people;
drop policy if exists "pastor can read only their assigned people" on public.people;
drop policy if exists "info desk and admin can insert people" on public.people;
drop policy if exists "coordinator and admin can update any people" on public.people;
drop policy if exists "admin, info desk, coordinator can read all people" on public.people;
drop policy if exists "admin can delete people" on public.people;
drop policy if exists "contact_log_delete_admin" on public.contact_log;
drop policy if exists "contact_log_modify_admin" on public.contact_log;
drop policy if exists "contact_log_insert" on public.contact_log;
drop policy if exists "contact_log_select" on public.contact_log;
drop policy if exists "attendance_delete" on public.attendance;
drop policy if exists "attendance_insert" on public.attendance;
drop policy if exists "attendance_select" on public.attendance;

alter table public.contact_log disable row level security;
alter table public.attendance  disable row level security;

drop trigger if exists contact_log_apply on public.contact_log;
drop function if exists public.apply_contact_log();
drop function if exists public.get_my_team_id();
drop function if exists public.get_my_role();

drop table if exists public.contact_log;
drop table if exists public.attendance;

alter table public.people drop column if exists needs_pastor;