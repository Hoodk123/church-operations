-- Task 5 admin control and check-in fixes (docs/05-ux-fixes-and-admin-control.md).
-- Additive only: new columns, new tables, new functions/policies. Nothing on
-- `main` changes behaviour in a destructive way. Apply once, through the
-- Supabase MCP server.

-- A. Who assigned a person, and when
alter table public.people
  add column if not exists assigned_at timestamptz,
  add column if not exists assigned_by uuid references public.team_members(id);

-- Helper the stamp trigger relies on. Documented in 04 (part A) but absent
-- from the live database (its policies were built on get_my_team_id instead).
-- Recreated here as documented so stamp_assignment() runs.
create or replace function public.my_team_member_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select id from public.team_members where auth_user_id = auth.uid()
$$;

create or replace function public.stamp_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT' and new.assigned_to is not null)
     or (tg_op = 'UPDATE' and new.assigned_to is distinct from old.assigned_to) then
    new.assigned_at := now();
    new.assigned_by := public.my_team_member_id();
  end if;
  return new;
end;
$$;

drop trigger if exists people_stamp_assignment on public.people;
create trigger people_stamp_assignment
  before insert or update of assigned_to on public.people
  for each row execute function public.stamp_assignment();

-- one-time backfill so existing assignments show a date
update public.people
   set assigned_at = coalesce(updated_at, now())
 where assigned_to is not null and assigned_at is null;

-- B. Finish a person from the Log sheet
alter table public.contact_log
  add column if not exists finished boolean not null default false;

create or replace function public.apply_contact_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.people
     set last_contact_date = new.contacted_at::date,
         follow_up_status = case
           when new.finished then 'Completed'
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

-- C. Message templates the admin writes and volunteers send
create table if not exists public.message_templates (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null unique,
  body               text not null,
  suggested_category text
    check (suggested_category in
      ('Visitor','New Convert','M1 Class','Member','Returning','Counseling')),
  sort_order         int not null default 0,
  active             boolean not null default true,
  created_by         uuid references public.team_members(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.message_templates enable row level security;

create policy "templates_read" on public.message_templates
  for select to authenticated
  using (active or public.get_my_role() = 'Admin');

create policy "templates_admin_write" on public.message_templates
  for all to authenticated
  using (public.get_my_role() = 'Admin')
  with check (public.get_my_role() = 'Admin');

insert into public.message_templates (name, body, suggested_category, sort_order) values
 ('Visitor welcome',
  'Hello {name}, thank you for worshipping with us on Sunday. We were glad to meet you. Is there anything we can pray about with you this week? From {volunteer}, Church Operations.',
  'Visitor', 1),
 ('New convert',
  'Hello {name}, we are so happy about your decision to follow Jesus. We would love to walk with you. When can we meet this week? From {volunteer}.',
  'New Convert', 2),
 ('We missed you',
  'Hello {name}, we missed you on Sunday and are thinking of you. Is everything well? From {volunteer}.',
  null, 3),
 ('M1 class invitation',
  'Hello {name}, our next M1 class is coming up and we would love to see you there. Can we count on you? From {volunteer}.',
  'M1 Class', 4)
on conflict (name) do nothing;

-- D. Volunteer overview for the admin (Admin only, one query)
create or replace function public.get_volunteer_overview()
returns table (
  team_member_id uuid, full_name text, role text,
  assigned int, contacted_this_week int, overdue int, last_active timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select tm.id, tm.full_name, tm.role,
         (count(distinct p.id) filter (where p.follow_up_status <> 'Completed'))::int,
         (select count(*) from public.contact_log c
           where c.contacted_by = tm.id
             and c.contacted_at >= date_trunc('week', now()))::int,
         (count(distinct p.id) filter (where
            p.follow_up_status <> 'Completed' and (
              (p.follow_up_status = 'Not Started'
                 and p.date_registered < current_date - 3)
              or (p.follow_up_status in ('Contacted','Met','Ongoing')
                 and p.last_contact_date < current_date - 14))))::int,
         (select max(c.contacted_at) from public.contact_log c
           where c.contacted_by = tm.id)
    from public.team_members tm
    left join public.people p on p.assigned_to = tm.id
   where public.get_my_role() = 'Admin'
     and tm.role in ('Admin','Follow-up Coordinator','Pastor')
   group by tm.id, tm.full_name, tm.role
   order by tm.full_name
$$;

-- E. Regulars expected today: came at the last service, not checked in yet
create or replace function public.expected_today()
returns setof public.people
language sql
stable
security invoker
set search_path = public
as $$
  select p.* from public.people p
   where exists (
           select 1 from public.attendance a
            where a.person_id = p.id
              and a.service_date = (select max(service_date)
                                      from public.attendance
                                     where service_date < current_date))
     and not exists (
           select 1 from public.attendance a
            where a.person_id = p.id and a.service_date = current_date)
$$;

-- F. Undo check-in for Info Desk on rows they created today (new policy,
-- additive alongside the existing Admin-only attendance_delete)
create policy "attendance_delete_own_today" on public.attendance
  for delete to authenticated
  using (public.get_my_role() = 'Info Desk'
     and checked_in_by = public.my_team_member_id()
     and service_date = current_date);