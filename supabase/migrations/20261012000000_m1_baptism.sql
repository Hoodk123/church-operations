-- Task 6 M1 Class and Baptism (docs/06-m1-and-baptism.md).
-- Additive only: new columns, tables, functions, policies. Applied once through
-- the Supabase MCP server. Adapted to the live schema in two places:
--   * `people.contact_preference` already exists (WhatsApp/SMS/Both) from an
--     earlier task, so we widen it instead of adding a parallel
--     `preferred_contact` column.
--   * the templates table is `message_templates` (not `follow_up_templates`).
--   * absence reasons gain `Evening` because the class meets in the evening.

-- A. People: email, address detail, the two "needs" flags, and a wider
--    contact preference that now also allows Email and Call.
alter table public.people
  add column if not exists email text,
  add column if not exists address_details text,
  add column if not exists needs_m1 boolean not null default false,
  add column if not exists needs_baptism boolean not null default false;

alter table public.people
  drop constraint if exists people_contact_preference_check;
alter table public.people
  add constraint people_contact_preference_check
  check (contact_preference in ('WhatsApp','Email','SMS','Call','Both'));

-- one-time backfill; Kevin reviews the counts before relying on them
update public.people
   set needs_m1 = true
 where category = 'M1 Class' and m1_status is distinct from 'Completed';

update public.people
   set needs_baptism = true
 where category in ('New Convert','M1 Class')
   and baptism_status in ('Not yet','Scheduled');

-- B. Role helpers
create or replace function public.is_class_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select public.get_my_role() in ('Admin','Pastor','Follow-up Coordinator','Info Desk')
$$;

create or replace function public.is_class_leader()
returns boolean language sql stable security definer set search_path = public as $$
  select public.get_my_role() in ('Admin','Pastor','Follow-up Coordinator')
$$;

-- C. Classes, days, enrolments, attendance
create table if not exists public.m1_classes (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  venue         text,
  required_days int  not null default 3 check (required_days between 1 and 10),
  status        text not null default 'Open' check (status in ('Open','Closed')),
  created_by    uuid references public.team_members(id),
  created_at    timestamptz not null default now()
);

create table if not exists public.m1_sessions (
  id           uuid primary key default gen_random_uuid(),
  class_id     uuid not null references public.m1_classes(id) on delete cascade,
  day_number   int  not null check (day_number >= 1),
  session_date date not null,
  start_time   time,
  topic        text,
  summary      text,
  closed       boolean not null default false,
  unique (class_id, day_number)
);

create table if not exists public.m1_enrollments (
  id                        uuid primary key default gen_random_uuid(),
  class_id                  uuid not null references public.m1_classes(id) on delete cascade,
  person_id                 uuid not null references public.people(id) on delete cascade,
  enrolled_at               timestamptz not null default now(),
  enrolled_by               uuid references public.team_members(id),
  walk_in                   boolean not null default false,
  status                    text not null default 'Enrolled'
    check (status in ('Enrolled','Completed','Dropped')),
  certificate_no            text unique,
  certificate_issued_at     timestamptz,
  certificate_override_note text,
  unique (class_id, person_id)
);

create table if not exists public.m1_attendance (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.m1_sessions(id) on delete cascade,
  person_id  uuid not null references public.people(id) on delete cascade,
  status     text not null check (status in ('Present','Absent','Excused')),
  marked_by  uuid references public.team_members(id),
  marked_at  timestamptz not null default now(),
  unique (session_id, person_id)
);
create index if not exists m1_attendance_person_idx on public.m1_attendance (person_id);

-- D. Messages sent (reminders, catch-up, materials) so the UI can show "Sent"
create table if not exists public.m1_message_log (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid references public.m1_classes(id) on delete cascade,
  session_id uuid references public.m1_sessions(id) on delete set null,
  person_id  uuid not null references public.people(id) on delete cascade,
  purpose    text not null
    check (purpose in ('reminder','catch_up','materials','certificate','baptism','other')),
  channel    text not null check (channel in ('WhatsApp','Email','SMS','Call')),
  sent_by    uuid references public.team_members(id),
  sent_at    timestamptz not null default now()
);
create index if not exists m1_message_log_person_idx on public.m1_message_log (person_id, sent_at desc);

-- E. Missed-day replies: private link per person and day, plus the answers
create table if not exists public.m1_reply_links (
  token      text primary key default replace(gen_random_uuid()::text, '-', ''),
  session_id uuid not null references public.m1_sessions(id) on delete cascade,
  person_id  uuid not null references public.people(id) on delete cascade,
  created_by uuid references public.team_members(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '21 days',
  used_at    timestamptz,
  unique (session_id, person_id)
);

create table if not exists public.m1_absence_replies (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.m1_sessions(id) on delete cascade,
  person_id   uuid not null references public.people(id) on delete cascade,
  reason      text not null
    check (reason in ('Work','Sick','Transport','Family','Forgot','Evening','Other')),
  note        text,
  source      text not null default 'Link' check (source in ('Link','Volunteer')),
  recorded_by uuid references public.team_members(id),
  created_at  timestamptz not null default now()
);

-- F. Study materials (files live in Storage; this table points to them)
create table if not exists public.m1_materials (
  id           uuid primary key default gen_random_uuid(),
  class_id     uuid not null references public.m1_classes(id) on delete cascade,
  session_id   uuid references public.m1_sessions(id) on delete set null,
  title        text not null,
  storage_path text not null,
  mime_type    text,
  size_bytes   bigint,
  uploaded_by  uuid references public.team_members(id),
  created_at   timestamptz not null default now()
);

insert into storage.buckets (id, name, public)
values ('m1-materials', 'm1-materials', false)
on conflict (id) do nothing;

-- G. Baptism dates and who is registered on them
create table if not exists public.baptism_events (
  id         uuid primary key default gen_random_uuid(),
  event_date date not null,
  event_time time,
  venue      text,
  officiant  text,
  status     text not null default 'Scheduled'
    check (status in ('Scheduled','Done','Cancelled')),
  notes      text,
  created_by uuid references public.team_members(id),
  created_at timestamptz not null default now()
);

create table if not exists public.baptism_registrations (
  id                    uuid primary key default gen_random_uuid(),
  event_id              uuid not null references public.baptism_events(id) on delete cascade,
  person_id             uuid not null references public.people(id) on delete cascade,
  status                text not null default 'Registered'
    check (status in ('Registered','Baptized','Postponed')),
  baptized_at           timestamptz,
  certificate_no        text unique,
  certificate_issued_at timestamptz,
  created_by            uuid references public.team_members(id),
  created_at            timestamptz not null default now(),
  unique (event_id, person_id)
);

-- H. Keep the existing People columns in step
create or replace function public.m1_attendance_touch_person()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'Present' then
    update public.people set m1_status = 'In Progress'
     where id = new.person_id and m1_status = 'Not Started';
  end if;
  return new;
end;
$$;

drop trigger if exists m1_attendance_touch on public.m1_attendance;
create trigger m1_attendance_touch
  after insert or update of status on public.m1_attendance
  for each row execute function public.m1_attendance_touch_person();

create or replace function public.baptism_registration_sync()
returns trigger language plpgsql security definer set search_path = public as $$
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

drop trigger if exists baptism_registration_sync on public.baptism_registrations;
create trigger baptism_registration_sync
  before insert or update of status on public.baptism_registrations
  for each row execute function public.baptism_registration_sync();

-- I. Close a day: unticked people become Absent, finished people become Completed
create or replace function public.close_m1_session(p_session_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_class uuid;
  v_required int;
begin
  if not public.is_class_leader() then
    raise exception 'not allowed';
  end if;

  select s.class_id, c.required_days into v_class, v_required
    from public.m1_sessions s
    join public.m1_classes c on c.id = s.class_id
   where s.id = p_session_id;
  if v_class is null then
    raise exception 'session not found';
  end if;

  update public.m1_sessions set closed = true where id = p_session_id;

  insert into public.m1_attendance (session_id, person_id, status, marked_by)
  select p_session_id, e.person_id, 'Absent', public.my_team_member_id()
    from public.m1_enrollments e
   where e.class_id = v_class and e.status = 'Enrolled'
     and not exists (select 1 from public.m1_attendance a
                      where a.session_id = p_session_id
                        and a.person_id = e.person_id);

  update public.m1_enrollments e
     set status = 'Completed'
   where e.class_id = v_class and e.status = 'Enrolled'
     and (select count(*) from public.m1_attendance a
            join public.m1_sessions s on s.id = a.session_id
           where s.class_id = v_class and a.person_id = e.person_id
             and a.status = 'Present') >= v_required;

  update public.people p
     set m1_status = 'Completed', needs_m1 = false
   where p.id in (select person_id from public.m1_enrollments
                   where class_id = v_class and status = 'Completed');
end;
$$;

-- J. Certificates: numbered, Admin and Pastor only
create sequence if not exists public.m1_certificate_seq;

create or replace function public.issue_m1_certificates(p_enrollment_ids uuid[])
returns setof public.m1_enrollments
language plpgsql security definer set search_path = public as $$
begin
  if public.get_my_role() not in ('Admin','Pastor') then
    raise exception 'not allowed';
  end if;

  return query
  update public.m1_enrollments e
     set certificate_no = 'M1-' || to_char(now(), 'YYYY') || '-'
                          || lpad(nextval('public.m1_certificate_seq')::text, 4, '0'),
         certificate_issued_at = now(),
         status = 'Completed'
   where e.id = any(p_enrollment_ids)
     and e.certificate_issued_at is null
     and (
       (select count(*) from public.m1_attendance a
          join public.m1_sessions s on s.id = a.session_id
         where s.class_id = e.class_id and a.person_id = e.person_id
           and a.status = 'Present')
       >= (select c.required_days from public.m1_classes c where c.id = e.class_id)
       or e.certificate_override_note is not null)
   returning e.*;

  update public.people p
     set m1_status = 'Completed', needs_m1 = false
   where p.id in (select person_id from public.m1_enrollments
                   where id = any(p_enrollment_ids)
                     and certificate_issued_at is not null);
end;
$$;

-- K. The two separate lists
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

create or replace function public.baptism_candidates()
returns setof public.people
language sql stable security invoker set search_path = public as $$
  select p.* from public.people p
   where p.needs_baptism
     and p.baptism_status is distinct from 'Baptized'
     and not exists (
       select 1 from public.baptism_registrations r
         join public.baptism_events e on e.id = r.event_id
        where r.person_id = p.id and r.status = 'Registered' and e.status = 'Scheduled')
$$;

-- L. Public reply page: the only things the anonymous role may call
create or replace function public.get_reply_context(p_token text)
returns table (
  first_name text, day_number int, session_date date, summary text,
  next_session_date date, already_replied boolean
)
language sql stable security definer set search_path = public as $$
  select p.first_name, s.day_number, s.session_date, s.summary,
         (select min(s2.session_date) from public.m1_sessions s2
           where s2.class_id = s.class_id and s2.session_date >= current_date),
         (l.used_at is not null)
    from public.m1_reply_links l
    join public.people p on p.id = l.person_id
    join public.m1_sessions s on s.id = l.session_id
   where l.token = p_token and l.expires_at > now()
$$;

create or replace function public.submit_absence_reply(p_token text, p_reason text, p_note text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  l public.m1_reply_links;
begin
  select * into l from public.m1_reply_links
   where token = p_token and expires_at > now() and used_at is null;
  if not found then
    return false;
  end if;
  if p_reason not in ('Work','Sick','Transport','Family','Forgot','Evening','Other') then
    return false;
  end if;

  insert into public.m1_absence_replies (session_id, person_id, reason, note, source)
  values (l.session_id, l.person_id, p_reason, left(p_note, 1000), 'Link');

  update public.m1_reply_links set used_at = now() where token = p_token;
  return true;
end;
$$;

revoke all on function public.get_reply_context(text) from public;
revoke all on function public.submit_absence_reply(text, text, text) from public;
grant execute on function public.get_reply_context(text) to anon, authenticated;
grant execute on function public.submit_absence_reply(text, text, text) to anon, authenticated;

-- M. Templates: add purpose and seed the M1/baptism wording
alter table public.message_templates
  add column if not exists purpose text not null default 'follow_up';

alter table public.message_templates
  drop constraint if exists message_templates_purpose_check;
alter table public.message_templates
  add constraint message_templates_purpose_check
  check (purpose in ('follow_up','m1_reminder','m1_catch_up','m1_materials',
                     'm1_certificate','baptism_reminder'));

insert into public.message_templates (name, body, purpose, sort_order) values
 ('M1 class reminder',
  'Hello {name}, a reminder that {class} Day {day} is on {date} at {time}, {venue}. We look forward to seeing you. From {volunteer}.',
  'm1_reminder', 10),
 ('M1 missed class',
  'Hello {name}, we missed you at {class} Day {day} and we are thinking of you. This is what we studied: {summary} The notes are here: {materials_link} You are welcome at the next class on {next_date}. If something kept you away and you would like to share, you can tell us here: {reply_link} From {volunteer}.',
  'm1_catch_up', 11),
 ('M1 notes',
  'Hello {name}, here are the notes from {class}: {materials_link} The link works for 7 days. From {volunteer}.',
  'm1_materials', 12),
 ('M1 certificate ready',
  'Hello {name}, congratulations on completing {class}. Your certificate is ready to collect. From {volunteer}.',
  'm1_certificate', 13),
 ('Baptism reminder',
  'Hello {name}, your baptism is on {date} at {time}, {venue}. We are praying with you. From {volunteer}.',
  'baptism_reminder', 14)
on conflict (name) do nothing;

-- N. Row level security
alter table public.m1_classes            enable row level security;
alter table public.m1_sessions           enable row level security;
alter table public.m1_enrollments        enable row level security;
alter table public.m1_attendance         enable row level security;
alter table public.m1_message_log        enable row level security;
alter table public.m1_reply_links        enable row level security;
alter table public.m1_absence_replies    enable row level security;
alter table public.m1_materials          enable row level security;
alter table public.baptism_events        enable row level security;
alter table public.baptism_registrations enable row level security;

-- classes and days: everyone signed in can read; Admin manages; leaders edit day summaries
create policy m1_classes_select on public.m1_classes
  for select to authenticated using (true);
create policy m1_classes_admin on public.m1_classes
  for all to authenticated
  using (public.get_my_role() = 'Admin') with check (public.get_my_role() = 'Admin');

create policy m1_sessions_select on public.m1_sessions
  for select to authenticated using (true);
create policy m1_sessions_admin on public.m1_sessions
  for all to authenticated
  using (public.get_my_role() = 'Admin') with check (public.get_my_role() = 'Admin');
create policy m1_sessions_leader_update on public.m1_sessions
  for update to authenticated
  using (public.is_class_leader()) with check (public.is_class_leader());

-- enrolments
create policy m1_enrollments_select on public.m1_enrollments
  for select to authenticated
  using (exists (select 1 from public.people p where p.id = m1_enrollments.person_id));
create policy m1_enrollments_insert on public.m1_enrollments
  for insert to authenticated
  with check (public.is_class_staff() and enrolled_by = public.my_team_member_id());
create policy m1_enrollments_update on public.m1_enrollments
  for update to authenticated
  using (public.is_class_leader()) with check (public.is_class_leader());
create policy m1_enrollments_delete on public.m1_enrollments
  for delete to authenticated using (public.get_my_role() = 'Admin');

-- attendance: staff may tick while the day is open; Admin may always (make-ups)
create policy m1_attendance_select on public.m1_attendance
  for select to authenticated
  using (exists (select 1 from public.people p where p.id = m1_attendance.person_id));
create policy m1_attendance_insert on public.m1_attendance
  for insert to authenticated
  with check (
    public.is_class_staff()
    and marked_by = public.my_team_member_id()
    and (public.get_my_role() = 'Admin'
         or exists (select 1 from public.m1_sessions s
                     where s.id = m1_attendance.session_id and not s.closed)));
create policy m1_attendance_update on public.m1_attendance
  for update to authenticated
  using (
    public.is_class_staff()
    and (public.get_my_role() = 'Admin'
         or exists (select 1 from public.m1_sessions s
                     where s.id = m1_attendance.session_id and not s.closed)))
  with check (public.is_class_staff());
create policy m1_attendance_delete on public.m1_attendance
  for delete to authenticated
  using (
    public.is_class_staff()
    and (public.get_my_role() = 'Admin'
         or exists (select 1 from public.m1_sessions s
                     where s.id = m1_attendance.session_id and not s.closed)));

-- message log
create policy m1_message_log_select on public.m1_message_log
  for select to authenticated using (public.is_class_staff());
create policy m1_message_log_insert on public.m1_message_log
  for insert to authenticated
  with check (public.is_class_staff() and sent_by = public.my_team_member_id());

-- reply links and replies: staff side only; the public page uses the two functions above
create policy m1_reply_links_select on public.m1_reply_links
  for select to authenticated using (public.is_class_leader());
create policy m1_reply_links_insert on public.m1_reply_links
  for insert to authenticated
  with check (public.is_class_leader() and created_by = public.my_team_member_id());

create policy m1_absence_replies_select on public.m1_absence_replies
  for select to authenticated
  using (public.is_class_leader()
         and exists (select 1 from public.people p where p.id = m1_absence_replies.person_id));
create policy m1_absence_replies_insert on public.m1_absence_replies
  for insert to authenticated
  with check (public.is_class_leader() and source = 'Volunteer'
              and recorded_by = public.my_team_member_id());

-- materials
create policy m1_materials_select on public.m1_materials
  for select to authenticated using (public.is_class_leader());
create policy m1_materials_insert on public.m1_materials
  for insert to authenticated
  with check (public.is_class_leader() and uploaded_by = public.my_team_member_id());
create policy m1_materials_delete on public.m1_materials
  for delete to authenticated using (public.get_my_role() = 'Admin');

create policy m1_materials_files_read on storage.objects
  for select to authenticated
  using (bucket_id = 'm1-materials' and public.is_class_leader());
create policy m1_materials_files_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'm1-materials' and public.is_class_leader());
create policy m1_materials_files_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'm1-materials' and public.get_my_role() = 'Admin');

-- baptism
create policy baptism_events_select on public.baptism_events
  for select to authenticated using (public.is_class_leader());
create policy baptism_events_write on public.baptism_events
  for all to authenticated
  using (public.get_my_role() in ('Admin','Pastor'))
  with check (public.get_my_role() in ('Admin','Pastor'));

create policy baptism_registrations_select on public.baptism_registrations
  for select to authenticated
  using (public.is_class_leader()
         and exists (select 1 from public.people p where p.id = baptism_registrations.person_id));
create policy baptism_registrations_insert on public.baptism_registrations
  for insert to authenticated
  with check (public.is_class_leader() and created_by = public.my_team_member_id());
create policy baptism_registrations_update on public.baptism_registrations
  for update to authenticated
  using (public.is_class_leader()) with check (public.is_class_leader());
create policy baptism_registrations_delete on public.baptism_registrations
  for delete to authenticated using (public.get_my_role() = 'Admin');
