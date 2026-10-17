-- Rollback for 20261013010000_baptism_manage.sql

drop function if exists public.delete_baptism_event(uuid);

drop policy if exists baptism_events_delete on public.baptism_events;
drop policy if exists baptism_events_update on public.baptism_events;
drop policy if exists baptism_events_insert on public.baptism_events;

create policy baptism_events_write on public.baptism_events
  for all to authenticated
  using (public.get_my_role() in ('Admin', 'Pastor'))
  with check (public.get_my_role() in ('Admin', 'Pastor'));

alter table public.baptism_events drop column if exists archived_at;
