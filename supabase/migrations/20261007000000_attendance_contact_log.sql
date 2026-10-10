-- Baseline for Task 4 (docs/04-roadmap-and-database.md).
-- This file documents what is ALREADY applied to the shared Supabase project
-- (recorded there as migrations task4_attendance_contact_log and
-- scope_people_policies_to_authenticated). It is kept for repo history and
-- rollback reference; do NOT replay it on the live database (rule: apply once).

-- 1. Flag people the pastor should know about
alter table public.people
  add column if not exists needs_pastor boolean not null default false;

-- 2. Attendance: one row per person per service per date
create table if not exists public.attendance (
  id            uuid primary key default gen_random_uuid(),
  person_id     uuid not null references public.people(id) on delete cascade,
  service_date  date not null default current_date,
  service_name  text not null default 'Sunday Service',
  checked_in_by uuid references public.team_members(id),
  checked_in_at timestamptz not null default now(),
  unique (person_id, service_date, service_name)
);
create index if not exists attendance_service_date_idx
  on public.attendance (service_date);

-- 3. Contact log: every call, message, or visit
create table if not exists public.contact_log (
  id           uuid primary key default gen_random_uuid(),
  person_id    uuid not null references public.people(id) on delete cascade,
  contacted_by uuid not null references public.team_members(id),
  contacted_at timestamptz not null default now(),
  method  text not null
    check (method in ('Call','WhatsApp','SMS','Visit','Other')),
  outcome text not null
    check (outcome in ('Reached','No answer','Scheduled visit','Needs pastor','Wrong number')),
  note    text
);
create index if not exists contact_log_person_idx
  on public.contact_log (person_id, contacted_at desc);

-- 4. Keep people.last_contact_date and status in step with the log
create or replace function public.apply_contact_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.people
     set last_contact_date = greatest(last_contact_date, new.contacted_at::date),
         follow_up_status = case
           when follow_up_status = 'Not Started' and new.outcome = 'Reached'
             then 'Contacted'
           else follow_up_status
         end,
         needs_pastor = needs_pastor or new.outcome = 'Needs pastor'
   where id = new.person_id;
  return new;
end;
$$;

drop trigger if exists contact_log_apply on public.contact_log;
create trigger contact_log_apply
  after insert on public.contact_log
  for each row execute function public.apply_contact_log();

-- 5. Helpers used by the policies
create or replace function public.get_my_role()
returns text
language sql stable security definer
set search_path = public
as $$
  select role from public.team_members where auth_user_id = auth.uid()
$$;

create or replace function public.get_my_team_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select id from public.team_members where auth_user_id = auth.uid()
$$;

-- 6. RLS
alter table public.attendance  enable row level security;
alter table public.contact_log enable row level security;

-- attendance: you can see a row only if you can already see that person
create policy "attendance_select" on public.attendance
  for select to authenticated
  using (exists (select 1 from public.people p where p.id = attendance.person_id));

create policy "attendance_insert" on public.attendance
  for insert to authenticated
  with check (
    public.get_my_role() in ('Admin','Info Desk','Follow-up Coordinator')
    and checked_in_by = public.get_my_team_id()
  );

create policy "attendance_delete" on public.attendance
  for delete to authenticated
  using (public.get_my_role() = 'Admin');

-- contact_log: same visibility rule as attendance
create policy "contact_log_select" on public.contact_log
  for select to authenticated
  using (exists (select 1 from public.people p where p.id = contact_log.person_id));

create policy "contact_log_insert" on public.contact_log
  for insert to authenticated
  with check (
    public.get_my_role() in ('Admin','Follow-up Coordinator','Pastor','Info Desk')
    and contacted_by = public.get_my_team_id()
    and exists (select 1 from public.people p where p.id = contact_log.person_id)
  );

create policy "contact_log_modify_admin" on public.contact_log
  for update to authenticated
  using (public.get_my_role() = 'Admin')
  with check (public.get_my_role() = 'Admin');

create policy "contact_log_delete_admin" on public.contact_log
  for delete to authenticated
  using (public.get_my_role() = 'Admin');

-- people policies scoped to authenticated roles (applied 20261007194808)
alter table public.people enable row level security;

create policy "admin can delete people" on public.people
  for delete to authenticated
  using (public.get_my_role() = 'Admin');

create policy "admin, info desk, coordinator can read all people" on public.people
  for select to authenticated
  using (public.get_my_role() in ('Admin','Info Desk','Follow-up Coordinator'));

create policy "coordinator and admin can update any people" on public.people
  for update to authenticated
  using (public.get_my_role() in ('Follow-up Coordinator','Admin','Info Desk'))
  with check (public.get_my_role() in ('Follow-up Coordinator','Admin','Info Desk'));

create policy "info desk and admin can insert people" on public.people
  for insert to authenticated
  with check (public.get_my_role() in ('Info Desk','Admin','Follow-up Coordinator'));

create policy "pastor can read only their assigned people" on public.people
  for select to authenticated
  using (public.get_my_role() = 'Pastor' and assigned_to = public.get_my_team_id());

create policy "pastor can update only their assigned people" on public.people
  for update to authenticated
  using (public.get_my_role() = 'Pastor' and assigned_to = public.get_my_team_id())
  with check (public.get_my_role() = 'Pastor' and assigned_to = public.get_my_team_id());