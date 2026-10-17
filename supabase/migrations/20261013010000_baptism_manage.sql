-- Baptism services: archive, edit and permanent delete (section 3/4)
-- Additive only. No existing table, column or function is removed.

alter table public.baptism_events add column if not exists archived_at timestamptz;

-- Tighten the baptism event policies so edits follow the class rule:
--   read: any signed-in staff (unchanged)
--   insert/update: Admin, Pastor or class leader
--   delete: Admin only
drop policy if exists baptism_events_write on public.baptism_events;

create policy baptism_events_insert on public.baptism_events
  for insert to authenticated
  with check (public.get_my_role() in ('Admin', 'Pastor'));

create policy baptism_events_update on public.baptism_events
  for update to authenticated
  using (public.is_class_leader())
  with check (public.is_class_leader());

create policy baptism_events_delete on public.baptism_events
  for delete to authenticated
  using (public.get_my_role() = 'Admin');

-- Permanent delete of a service. Admin only. People are never deleted;
-- registered people who were not baptized go back to "Needs baptism".
create or replace function public.delete_baptism_event(p_event uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_people uuid[];
begin
  if public.get_my_role() is distinct from 'Admin' then
    raise exception 'Only an Admin can delete a baptism service';
  end if;

  select array_agg(distinct person_id) into v_people
    from public.baptism_registrations
   where event_id = p_event and status <> 'Baptized';

  delete from public.baptism_registrations where event_id = p_event;
  delete from public.baptism_events where id = p_event;

  update public.people p
     set needs_baptism = true,
         baptism_status = 'Not yet'
   where p.id = any(coalesce(v_people, '{}'::uuid[]))
     and p.baptism_status is distinct from 'Baptized';
end;
$$;

revoke all on function public.delete_baptism_event(uuid) from public;
grant execute on function public.delete_baptism_event(uuid) to authenticated;
