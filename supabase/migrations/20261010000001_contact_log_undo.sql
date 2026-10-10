-- Follow-up "Undo last log" support (docs/05 Part 3.3).
-- Additive: a volunteer may delete a same-day log they created, and the
-- derived contact fields on people are recomputed from the remaining logs.
-- Apply once, after 20261010000000_admin_control.sql.

create policy "contact_log_delete_own_today" on public.contact_log
  for delete to authenticated
  using (
    contacted_by = public.my_team_member_id()
    and contacted_at::date = current_date
  );

create or replace function public.revert_contact_log()
returns trigger
language plpgsql
security definer
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
           when v_finished then 'Completed'
           when follow_up_status in ('Completed', 'Contacted') then
             case when v_last is null then 'Not Started' else 'Contacted' end
           else follow_up_status
         end
   where id = old.person_id;

  return old;
end;
$$;

drop trigger if exists contact_log_revert on public.contact_log;
create trigger contact_log_revert
  after delete on public.contact_log
  for each row execute function public.revert_contact_log();
