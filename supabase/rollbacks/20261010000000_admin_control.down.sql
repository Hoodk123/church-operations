-- Rollback for 20261010000000_admin_control.sql.
-- WARNING: deletes data in the new table/columns. Only run if Kevin asks.

drop policy if exists "attendance_delete_own_today" on public.attendance;

drop function if exists public.expected_today();
drop function if exists public.get_volunteer_overview();
drop table    if exists public.message_templates;

-- put the previous version of the contact trigger back
create or replace function public.apply_contact_log()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.people
     set last_contact_date = new.contacted_at::date,
         follow_up_status = case
           when follow_up_status = 'Not Started' and new.outcome = 'Reached'
             then 'Contacted'
           else follow_up_status end,
         needs_pastor = needs_pastor or new.outcome = 'Needs pastor'
   where id = new.person_id;
  return new;
end; $$;
alter table public.contact_log drop column if exists finished;

drop trigger  if exists people_stamp_assignment on public.people;
drop function if exists public.stamp_assignment();
drop function if exists public.my_team_member_id();
alter table public.people drop column if exists assigned_by;
alter table public.people drop column if exists assigned_at;