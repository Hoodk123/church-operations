-- Roll back the class manage migration (20261013000000_m1_class_manage.sql).

drop function if exists public.delete_m1_class(uuid);

drop policy if exists m1_classes_update on public.m1_classes;

-- Restore the waiting-list function exactly as it was in 20261012000000.
create or replace function public.m1_waiting_list()
returns setof public.people
language sql stable security invoker set search_path = public as $$
  select p.* from public.people p
   where p.needs_m1
     and p.m1_status is distinct from 'Completed'
     and not exists (
       select 1 from public.m1_enrollments e
         join public.m1_classes c on c.id = e.class_id
        where e.person_id = p.id and e.status = 'Enrolled' and c.status = 'Open')
$$;

alter table public.m1_classes drop column if exists archived_at;
