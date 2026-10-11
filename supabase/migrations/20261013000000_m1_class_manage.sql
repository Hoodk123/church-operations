-- M1 classes: edit, archive and permanent delete.
-- Additive only: one new column, one update policy, one replaced stable function
-- and one new security-definer function. No column is dropped or renamed.

alter table public.m1_classes add column if not exists archived_at timestamptz;

-- Class leaders (Admin/Pastor/FC) may edit and archive. Admin already has full
-- access through m1_classes_admin; this is a permissive policy so the two OR.
create policy m1_classes_update on public.m1_classes
  for update to authenticated
  using (public.is_class_leader())
  with check (public.is_class_leader());

-- An archived class must not count as "an open class" on the waiting list.
create or replace function public.m1_waiting_list()
returns setof public.people
language sql stable security invoker set search_path = public as $$
  select p.* from public.people p
   where p.needs_m1
     and p.m1_status is distinct from 'Completed'
     and not exists (
       select 1 from public.m1_enrollments e
         join public.m1_classes c on c.id = e.class_id
        where e.person_id = p.id and e.status = 'Enrolled'
          and c.status = 'Open' and c.archived_at is null)
$$;

-- Delete one class and everything that belongs to it, in one transaction.
-- Admin only. Never deletes people; people who were enrolled but never finished
-- return to "Needs M1". Issued certificate numbers are never reused (the
-- sequence is untouched).
create or replace function public.delete_m1_class(p_class uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sessions uuid[];
  v_people   uuid[];
begin
  if public.get_my_role() is distinct from 'Admin' then
    raise exception 'Only an Admin can delete a class';
  end if;

  select array_agg(id) into v_sessions
    from public.m1_sessions where class_id = p_class;
  select array_agg(distinct person_id) into v_people
    from public.m1_enrollments where class_id = p_class;

  delete from storage.objects
   where bucket_id = 'm1-materials'
     and (storage.foldername(name))[1] = p_class::text;

  delete from public.m1_absence_replies where session_id = any(coalesce(v_sessions, '{}'::uuid[]));
  delete from public.m1_reply_links    where session_id = any(coalesce(v_sessions, '{}'::uuid[]));
  delete from public.m1_attendance     where session_id = any(coalesce(v_sessions, '{}'::uuid[]));
  delete from public.m1_message_log    where class_id = p_class;
  delete from public.m1_materials      where class_id = p_class;
  delete from public.m1_enrollments    where class_id = p_class;
  delete from public.m1_sessions       where class_id = p_class;
  delete from public.m1_classes        where id = p_class;

  update public.people p
     set needs_m1 = true
   where p.id = any(coalesce(v_people, '{}'::uuid[]))
     and p.m1_status is distinct from 'Completed';
end;
$$;

revoke all on function public.delete_m1_class(uuid) from public;
grant execute on function public.delete_m1_class(uuid) to authenticated;
