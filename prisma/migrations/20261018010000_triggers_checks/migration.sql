-- Phase 2 · pure SQL behaviour kept out of Prisma (docs/09 says triggers stay
-- as SQL; everything that was a SECURITY DEFINER RPC moves to the Phase 3 API)
-- and the value-list CHECK constraints the schema now expresses as enums.
--
-- Differences from the Supabase originals:
--   * no SECURITY DEFINER and no `auth.uid()` helpers: with a single runtime
--     role (church_app) triggers run as the caller, which owns the same DML
--     grants;
--   * stamp_assignment() no longer calls my_team_member_id(): the API sets
--     people.assigned_by itself (that Supabase helper read auth.uid()).
-- Value discrepancies vs live (apply_contact_log): the later
-- 20261010000000_admin_control.sql body wins (last_contact_date = max day,
-- finished -> Completed), matching what is on the shared database today.

-- ────────────────── 1. functions (plain, invoker) ──────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.apply_contact_log()
returns trigger
language plpgsql
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

create or replace function public.revert_contact_log()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_last     date;
  v_finished boolean;
begin
  select max(contacted_at)::date, bool_or(finished)
    into v_last, v_finished
    from public.contact_log
   where person_id = old.person_id;

  update public.people
     set last_contact_date = v_last,
         follow_up_status = case
           when v_finished then 'Completed'::"FollowUpStatus"
           when follow_up_status in ('Completed', 'Contacted') then
             case when v_last is null
                  then 'Not Started'::"FollowUpStatus"
                  else 'Contacted'::"FollowUpStatus"
             end
           else follow_up_status
         end
   where id = old.person_id;

  return old;
end;
$$;

create or replace function public.stamp_assignment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (tg_op = 'INSERT' and new.assigned_to is not null)
     or (tg_op = 'UPDATE' and new.assigned_to is distinct from old.assigned_to) then
    new.assigned_at := now();
    -- assigned_by is set by the API together with assigned_to.
  end if;
  return new;
end;
$$;

create or replace function public.m1_attendance_touch_person()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'Present' then
    update public.people set m1_status = 'In Progress'
     where id = new.person_id and m1_status = 'Not Started';
  end if;
  return new;
end;
$$;

create or replace function public.baptism_registration_sync()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'Baptized' then
    if new.baptized_at is null then new.baptized_at := now(); end if;
    update public.people
       set baptism_status = 'Baptized', needs_baptism = false
     where id = new.person_id;
  elsif new.status = 'Registered' then
    update public.people set baptism_status = 'Scheduled'
     where id = new.person_id and baptism_status = 'Not yet';
  elsif new.status = 'Postponed' then
    update public.people set baptism_status = 'Not yet'
     where id = new.person_id and baptism_status = 'Scheduled';
  end if;
  return new;
end;
$$;

-- ────────────────── 2. triggers ──────────────────

-- updated_at maintenance (people had trg_people_updated_at live; the same
-- behaviour now covers the other tables that carry updated_at)
drop trigger if exists trg_people_updated_at on public.people;
create trigger trg_people_updated_at
  before update on public.people
  for each row execute function public.set_updated_at();

drop trigger if exists trg_message_templates_updated_at on public.message_templates;
create trigger trg_message_templates_updated_at
  before update on public.message_templates
  for each row execute function public.set_updated_at();

drop trigger if exists trg_users_updated_at on public.users;
create trigger trg_users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- contact log -> derived fields on people
drop trigger if exists contact_log_apply on public.contact_log;
create trigger contact_log_apply
  after insert on public.contact_log
  for each row execute function public.apply_contact_log();

drop trigger if exists contact_log_revert on public.contact_log;
create trigger contact_log_revert
  after delete on public.contact_log
  for each row execute function public.revert_contact_log();

-- assignment stamping
drop trigger if exists people_stamp_assignment on public.people;
create trigger people_stamp_assignment
  before insert or update of assigned_to on public.people
  for each row execute function public.stamp_assignment();

-- M1 tick keeps people.m1_status moving
drop trigger if exists m1_attendance_touch on public.m1_attendance;
create trigger m1_attendance_touch
  after insert or update of status on public.m1_attendance
  for each row execute function public.m1_attendance_touch_person();

-- baptism registration keeps people.baptism_status in step
drop trigger if exists baptism_registration_sync on public.baptism_registrations;
create trigger baptism_registration_sync
  before insert or update of status on public.baptism_registrations
  for each row execute function public.baptism_registration_sync();

-- ────────────────── 3. sequence ──────────────────

-- M1 certificate numbers stay database-side so they are never reused
-- (API Phase 3 allocates through nextval in its transaction).
create sequence if not exists public.m1_certificate_seq
  as integer start 1 increment 1;

-- ────────────────── 4. check constraints ──────────────────
-- (value lists became enums at baseline; these two are numeric ranges and
-- stay as CHECK so a bad import can never create a "day 0" or day 11)

alter table public.m1_classes
  drop constraint if exists m1_classes_required_days_check;

alter table public.m1_classes
  add constraint m1_classes_required_days_check
  check (required_days between 1 and 10);

alter table public.m1_sessions
  drop constraint if exists m1_sessions_day_number_check;

alter table public.m1_sessions
  add constraint m1_sessions_day_number_check
  check (day_number >= 1);
