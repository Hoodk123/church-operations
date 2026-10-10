# Task 6 — M1 Class and Baptism

Do this **after** `05-ux-fixes-and-admin-control.md` is finished and its pull
request is merged into `main`. The ground rules of `04` and `05` still apply
(shadcn `base-nova` on Base UI, so `onClick` not Radix `onSelect`; confirm real
column names through the Supabase MCP server before writing queries; reuse
`constants.ts` colour maps; tooltips on icon-only buttons; one toast
component; only the page scrolls vertically; additive-only database changes;
branch, tag, migration file and rollback file for every change).

No images are provided. Everything needed is written below. If something is
not covered, stop and ask instead of inventing it. In particular do not invent
the church's name, the signatories on certificates, or message wording beyond
what is written here.

## Why this exists

The church runs an M1 class over three days and holds baptisms. Today the
`people` table only has two status fields (`m1_status`, `baptism_status`).
Leaders need to:

- keep **people who need M1** and **people who need baptism** in separate lists,
  each on its own page;
- see enrolled M1 people with phone and address, and tick who attended on each
  of the three days;
- register people who show up on class day without being registered before;
- remind people before class, and reach out to people who missed a day with a
  warm catch-up message, the notes, and a private link where they can tell us
  why they missed (the answer must come back into the system);
- attach and share study files with each person on the channel they prefer
  (WhatsApp or email);
- print certificates for everyone who attended all days;
- plan baptism dates and record who was baptized.

## Definitions (use these exactly)

- **Needs M1:** `people.needs_m1 = true`, `m1_status` is not `Completed`, and
  the person is not enrolled in an open class.
- **Enrolled:** has an `m1_enrollments` row in an open class with status `Enrolled`.
- **Day:** one `m1_sessions` row. A class normally has 3. A day is **open**
  until a leader closes it; closing it turns everyone not ticked into **Absent**.
- **Eligible for a certificate:** number of `Present` days is at least
  `m1_classes.required_days` (default 3), or a leader recorded an override note.
- **Needs baptism:** `people.needs_baptism = true`, `baptism_status` is not
  `Baptized`, and the person is not registered on a scheduled baptism date.
- "Sent" for any message means the volunteer opened the WhatsApp chat or email
  with the message ready. A web page cannot confirm delivery. Say "Sent" in the
  UI but never "Delivered".

---

## Part 0 — Safety

Follow Part 0 and Part 1 of `05` again: new branch `feat/m1-baptism` from
`main` (after the `05` PR is merged; if Kevin asks to start earlier, branch
from `feat/admin-control-and-checkin-fixes` and say so in the PR), tag
`pre-m1-baptism` on the current `main`, migration file in
`supabase/migrations/`, rollback file in `supabase/rollbacks/`, apply once
through the Supabase MCP server, report exactly what ran, then regenerate
types. Never push to `main`. Open a PR and stop.

## Part 1 — Database (all additive)

Migration file: `supabase/migrations/20261012000000_m1_baptism.sql`.
Rollback file: `supabase/rollbacks/20261012000000_m1_baptism.down.sql`.

```sql
-- A. People: contact preference, address detail, and the two "needs" flags
alter table public.people
  add column if not exists email text,
  add column if not exists preferred_contact text
    check (preferred_contact in ('WhatsApp','Email','SMS','Call')),
  add column if not exists address_details text,
  add column if not exists needs_m1 boolean not null default false,
  add column if not exists needs_baptism boolean not null default false;

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
    check (reason in ('Work','Sick','Transport','Family','Forgot','Other')),
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
  if p_reason not in ('Work','Sick','Transport','Family','Forgot','Other') then
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

-- M. Row level security
alter table public.m1_classes           enable row level security;
alter table public.m1_sessions          enable row level security;
alter table public.m1_enrollments       enable row level security;
alter table public.m1_attendance        enable row level security;
alter table public.m1_message_log       enable row level security;
alter table public.m1_reply_links       enable row level security;
alter table public.m1_absence_replies   enable row level security;
alter table public.m1_materials         enable row level security;
alter table public.baptism_events       enable row level security;
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
```

Message templates. The `05` migration created a templates table (the agent
named it `follow_up_templates`; the spec called it `message_templates`). Use
whatever name exists in the live database (check with `list_tables`). Add a
purpose column and seed the rows below with a second statement, using that real
table name:

```text
alter table public.<templates table>
  add column if not exists purpose text not null default 'follow_up'
  check (purpose in ('follow_up','m1_reminder','m1_catch_up','m1_materials',
                     'm1_certificate','baptism_reminder'));
```

| Name | Purpose | Body |
|------|---------|------|
| M1 class reminder | m1_reminder | Hello {name}, a reminder that {class} Day {day} is on {date} at {time}, {venue}. We look forward to seeing you. From {volunteer}. |
| M1 missed class | m1_catch_up | Hello {name}, we missed you at {class} Day {day} and we are thinking of you. This is what we studied: {summary} The notes are here: {materials_link} You are welcome at the next class on {next_date}. If something kept you away and you would like to share, you can tell us here: {reply_link} From {volunteer}. |
| M1 notes | m1_materials | Hello {name}, here are the notes from {class}: {materials_link} The link works for 7 days. From {volunteer}. |
| M1 certificate ready | m1_certificate | Hello {name}, congratulations on completing {class}. Your certificate is ready to collect. From {volunteer}. |
| Baptism reminder | baptism_reminder | Hello {name}, your baptism is on {date} at {time}, {venue}. We are praying with you. From {volunteer}. |

Placeholders: `{name}` first name, `{class}` class title, `{day}` day number,
`{date}` and `{time}` of the relevant day or event, `{next_date}` next class
day, `{venue}`, `{summary}` the day's summary, `{reply_link}` the private reply
page, `{materials_link}` the files link, `{volunteer}` the signed-in person's
full name. If a placeholder has no value, remove it and its sentence rather than
sending braces.

Rollback file:

```sql
drop function if exists public.submit_absence_reply(text, text, text);
drop function if exists public.get_reply_context(text);
drop function if exists public.baptism_candidates();
drop function if exists public.m1_waiting_list();
drop function if exists public.issue_m1_certificates(uuid[]);
drop function if exists public.close_m1_session(uuid);
drop trigger  if exists baptism_registration_sync on public.baptism_registrations;
drop function if exists public.baptism_registration_sync();
drop trigger  if exists m1_attendance_touch on public.m1_attendance;
drop function if exists public.m1_attendance_touch_person();

drop policy if exists m1_materials_files_read   on storage.objects;
drop policy if exists m1_materials_files_write  on storage.objects;
drop policy if exists m1_materials_files_delete on storage.objects;

drop table if exists public.baptism_registrations;
drop table if exists public.baptism_events;
drop table if exists public.m1_materials;
drop table if exists public.m1_absence_replies;
drop table if exists public.m1_reply_links;
drop table if exists public.m1_message_log;
drop table if exists public.m1_attendance;
drop table if exists public.m1_enrollments;
drop table if exists public.m1_sessions;
drop table if exists public.m1_classes;
drop sequence if exists public.m1_certificate_seq;

drop function if exists public.is_class_leader();
drop function if exists public.is_class_staff();

alter table public.people
  drop column if exists needs_baptism,
  drop column if exists needs_m1,
  drop column if exists address_details,
  drop column if exists preferred_contact,
  drop column if exists email;
-- the m1-materials Storage bucket must be emptied and removed from the dashboard
-- (or with the Storage API); SQL cannot delete a bucket that still holds files.
-- also: alter table public.<templates table> drop column if exists purpose;
```

Checks after applying (report each):

1. An Info Desk user can tick attendance on an open day, cannot tick on a
   closed day, cannot read `m1_materials`, and cannot call
   `issue_m1_certificates`.
2. `close_m1_session` as a Coordinator makes unticked enrolled people Absent
   and sets people with 3 Present days to Completed (and their
   `people.m1_status` to Completed).
3. `get_reply_context` and `submit_absence_reply` work with the anon key and a
   valid token, return nothing or false for a wrong, used, or expired token,
   and the anon role cannot select from any table directly.
4. Adding a `baptism_registrations` row sets `people.baptism_status` to
   Scheduled; setting it to Baptized sets Baptized and `needs_baptism = false`.
5. If the existing `people` select policy limits Pastors to people assigned to
   them, tell Kevin: M1 and Baptism lists will then show a Pastor only those
   people. Do not change the people policy without asking.

---

## Part 2 — Screens

Add a sidebar group "Classes" (below the main items) with **M1 Class** and
**Baptism**. Visibility: Admin, Pastor, Follow-up Coordinator see both. Info
Desk sees M1 Class only, limited to the Enrolled and Needs M1 tabs. Hide, do
not disable, what a role cannot use.

### 2.1 People form and drawer

- Add to the Add Person form and the Person drawer: email, preferred contact
  (toggle group WhatsApp / Email / SMS / Call), address details (landmark or
  street, free text, under the existing Location), and two switches "Needs M1
  class" and "Needs baptism".
- Disable the Email channel when there is no email, and WhatsApp, SMS and Call
  when there is no phone.

### 2.2 M1 Class page (`/m1`)

Header: title, a class `Select` (open classes first), meta line (days count and
venue), and buttons **Send reminders** (outline) and **Add** (primary). Admin
also gets "New class" (dialog: title, venue, required days, one row per day with
date, start time, topic).

Four stat tiles: Enrolled, Here today (for the day whose date is today),
Waiting for a class, Missed a day.

Tabs (segmented control, with counts): **Enrolled**, **Needs M1**, **Missed**,
**Materials**, **Certificates**. Info Desk sees only the first two.

**Enrolled tab.** A shadcn/TanStack table. Columns: Name, Phone, Address
(Location, with address details in a tooltip), then one checkbox column per
day, then Progress ("2/3" and a small bar).

- Day column header: "Day 2" and a small date underneath. State is by date and
  by `closed`: a closed day is locked (Admin can still change it, for
  make-ups); today's day is highlighted and editable; a future day is disabled.
  A day that falls on a past date but is not closed is still editable.
- Ticking inserts an `m1_attendance` row with `Present`; unticking deletes it.
  Optimistic update, roll back with a message if the database refuses.
  A closed day shows a red cross for `Absent`, a check for `Present`, an empty
  box for nothing yet.
- Leaders see "Close Day N" in the column header menu. A confirm dialog says
  "People who are not ticked will be marked Absent and will appear under
  Missed." It calls `rpc('close_m1_session')`.
- A badge "Missed Day N" beside the name for anyone Absent on a closed day, and
  a blue "Walk-in today" badge when `walk_in` is true and enrolled today.
- Clicking a row (not the checkboxes) opens the **person sheet**.

**Person sheet** (right `Sheet`): name, class and progress; phone, address,
address details, preferred contact; Call (`tel:`), WhatsApp, and Email buttons,
the first two reusing the Follow-ups link builder, Email as a `mailto:` link
with the message in the body; an attendance strip (one chip per day); a
"Send a message" select of templates by purpose with the filled preview and a
Send button; the last 3 entries from `m1_message_log`.

**Add sheet** (right `Sheet` on desktop, bottom `Drawer` on phones) with two
tabs:

- "Find existing": search people by name or phone (2 characters, debounced);
  rows with an Enrol button. A person already enrolled shows "Enrolled".
- "New person": first name, last name, phone (Rwanda default, same validation
  and duplicate-phone guard as Check-in), where they live (Location), address
  details, gender, age group, preferred contact, and a switch "Mark present for
  Day N now" (default on when a day is dated today). On save, in order:
  insert `people` (category `M1 Class`, follow_up_status `Not Started`,
  `needs_m1 = true`, `registered_by`), insert `m1_enrollments` with
  `walk_in = true`, and if the switch is on insert an `m1_attendance` `Present`
  row. If any step fails, tell the user exactly what saved and what did not.

**Send reminders** (right `Sheet`): shows the next upcoming day. A template
`Select` (purpose `m1_reminder`). A list of enrolled people who are not yet
Present for that day, each with their channel (their preferred contact, falling
back to WhatsApp then Email then SMS depending on what data exists) and a Send
button. Send opens `https://wa.me/<digits>?text=...` (WhatsApp), `mailto:` with
subject and body (Email), or `sms:<number>?body=...` (SMS), writes an
`m1_message_log` row (`purpose = 'reminder'`) and turns the button into a green
"Sent" badge. Explain on screen: "WhatsApp opens one chat at a time. Press send
there, then come back and tap the next name." Phone links on desktop may not
open anything; show the copy-message button too.

**Needs M1 tab.** `rpc('m1_waiting_list')`. Columns: Name, Phone, Address,
Category, Registered. Row checkboxes and "Enrol selected in <class>". Row click
opens the person sheet. A person here is not in the class table. This is the
list of people who need M1, kept apart from people who need baptism.

**Missed tab.** People with an `Absent` attendance row on a closed day, with
columns: Name, Missed (Day N, or "Day 1, Day 3"), Phone, Status, action.
Status is derived: `Replied: <reason>` (latest `m1_absence_replies` for that
person and day), `Message sent <time>` (latest `m1_message_log` with purpose
`catch_up`), or `Not contacted`.

- **Send catch-up:** find or create the `m1_reply_links` row for that person and
  day, build the `m1_catch_up` template, fill `{summary}` from
  `m1_sessions.summary` (if empty, warn the leader and let them type one first,
  saved to the day), `{materials_link}` as a signed Storage link or a link list
  for that day's files (7 days), `{next_date}` from the next open day, and
  `{reply_link}` as `<app origin>/reply/<token>`. Open WhatsApp, email or SMS by
  preferred contact, then log it in `m1_message_log` as `catch_up`.
- A card on the right "Why people missed": counts per reason, the latest few
  notes with names, and a button "Record a reason I heard by phone" (insert with
  `source = 'Volunteer'`).
- A missed person who comes to a later day stays in the class; leaders can use
  "Allow make-up" in the Certificates tab.

**Materials tab** (leaders only).

- Drag-and-drop or choose files (pdf, doc, docx, ppt, pptx, jpg, png; max 25 MB
  each). Upload to the private bucket `m1-materials` at
  `<class_id>/<uuid>-<filename>`, then insert an `m1_materials` row with title
  (editable), optional day, size, uploader.
- List: file icon, title, day badge, size, uploader, date, and a menu (rename,
  download, delete for Admin).
- **Share** card: recipients select ("Everyone enrolled", "Those who missed
  Day N", or "Pick people"), file checkboxes, and a count by channel from
  preferred contact. "Open share list" opens a list like the reminders one:
  per person, a Send button that builds `m1_materials` template text with
  signed links (`createSignedUrl`, 7 days) and opens WhatsApp or email, then
  logs `materials`. State on screen: "People get a private link to the files,
  valid for 7 days. WhatsApp cannot receive an attached file from a web page, so
  the message carries the link."

**Certificates tab** (Admin and Pastor can issue; Coordinators can view).

- "Ready" list: enrolled people with Present days at least `required_days`, or
  an override note, with checkboxes, "3 of 3 days", and an issued badge with
  the number when issued.
- "Not ready" list: name, "2 of 3 days, missed Day 2", and "Allow make-up"
  (Admin only). Make-up means ticking the missed day Present for that person on
  the closed day, which Admin is allowed to do, or recording an override note.
- Buttons: **Print certificates** (opens `/m1/certificates/print?ids=...` in a
  new tab, one A4 landscape page per person using `@media print` and
  `@page { size: A4 landscape; margin: 0 }`, then calls `window.print()`) and
  **Mark as issued** (calls `rpc('issue_m1_certificates')`, which assigns
  numbers like `M1-2026-0004`).
- Certificate content: church name, "Certificate of Completion", "This
  certifies that <Full name> attended all <n> days of the M1 Class held <month
  year> at <venue>.", the certificate number, and two signature lines labelled
  "Pastor" and "Class leader". **Do not invent the church name or signatories.**
  Put them in `src/lib/church.ts` as `CHURCH_NAME` and `CERTIFICATE_SIGNATORIES`
  with an obvious placeholder, and tell Kevin to fill them in.

### 2.3 Public reply page (`/reply/:token`)

Outside the protected routes, no login, mobile first, same shadcn styling.

- On load call `rpc('get_reply_context', { p_token })` with the anon client.
  If it returns nothing show: "This link is no longer active." and nothing else.
- Show: "Hello <first name>, we were thinking of you on Sunday. You are welcome
  at the next class." The day's summary text, the next class date, and (if the
  day has materials) a "Download the notes" link.
- Question: "Is there something that kept you away? Only if you would like to
  share." Chips: Work, Sick, Transport, Family, Forgot, Other. An optional text
  area (max 1000 characters). Send button calls `rpc('submit_absence_reply')`.
- After sending: "Thank you. We received your reply." If `already_replied` is
  true, show that thank-you directly and no form.
- Never show phone, address, surname, or other people's data on this page.

### 2.4 Baptism page (`/baptism`)

Header: title, counts line, and **New baptism date** (Admin and Pastor):
dialog with date, time, venue, officiant, notes.

Tabs: **Needs baptism**, **Scheduled**, **Baptized**.

- **Needs baptism:** `rpc('baptism_candidates')`. Columns: checkbox, Name,
  Phone, Address, M1 badge (Completed green, In progress amber, Not started
  red; a heads-up only, never a block), and "Add to date". Bulk "Add selected
  to date" with a `Select` of scheduled dates. This inserts
  `baptism_registrations` rows with `Registered`.
- **Scheduled:** one card per scheduled event (date, time, venue, count) listing
  registered people with checkboxes and buttons "Send reminders" (same pattern
  as M1 reminders, template `baptism_reminder`, logs purpose `baptism`),
  "Mark baptized" (updates the selected registrations to `Baptized`), and a menu
  to postpone or remove a person. When all registrations are Baptized or
  Postponed, allow marking the event Done.
- **Baptized:** table of Name, Date baptized, Event, and certificate number (empty
  until a later task adds baptism certificates). Search box.

### 2.5 Connect to existing screens

- People table: add filters "Needs M1" and "Needs baptism"; show the enrolled
  class as a small badge in the drawer.
- Follow-ups: a person marked Absent on a closed M1 day shows a "Missed M1
  Day N" tag on their card, so volunteers can see why to call them.
- Home (Admin): add two tiles, "Waiting for M1" and "Need baptism", when the
  Home page exists.

## Part 3 — Build order (one small commit each)

1. Safety: branch, tag, migration and rollback files.
2. Apply migration; regenerate types; seed the templates; report the checks.
3. People fields and flags (2.1).
4. Classes shell: sidebar group, routes, role guards, empty M1 and Baptism pages.
5. M1 Enrolled tab: class selector, tiles, table, ticking, close day, "New class".
6. Add sheet and walk-in registration.
7. Person sheet and reminders (with `m1_message_log`).
8. Needs M1 tab.
9. Missed tab, catch-up message, reply links, and the public `/reply/:token` page.
10. Materials tab and sharing.
11. Certificates tab and print page.
12. Baptism page.
13. Connect to existing screens (2.5), README, final lint and build.

## Part 4 — Out of scope

No automatic sending (no WhatsApp Business API, no email or SMS service), no
QR code check-in, no baptism certificates, no HBF groups, no reports page, no
charts. Message sending is always a person pressing send in their own app.

## Part 5 — Done means

For each acceptance line, say how you tested it.

1. As Admin, create a class with 3 days. Enrol 3 people, tick Day 1 for two,
   close Day 1, and see the third appear under Missed as Absent.
2. As Info Desk, add a walk-in on class day with "Mark present now"; the person
   appears in Enrolled, ticked for today, and in People with category M1 Class.
3. Needs M1 lists only people with `needs_m1` who are not enrolled; Needs
   baptism lists only people with `needs_baptism` who are not on a date. A
   person in one list is not forced into the other.
4. Send a catch-up from Missed: the WhatsApp message contains the summary, a
   files link and a reply link. Open the reply link in a private window without
   logging in, submit a reason, and see it appear on the Missed tab and the
   "Why people missed" card. The same link cannot be used twice.
5. Upload a file, share it to two people with different preferred contacts, and
   see WhatsApp and email open correctly with the signed link.
6. Close all 3 days; people with 3 of 3 appear as ready; print two certificates
   (one per page, A4 landscape); mark as issued and see numbers assigned; a
   person with 2 of 3 is not ready until an Admin allows a make-up.
7. Create a baptism date, add two people, mark one Baptized: People shows
   `Scheduled` then `Baptized` in the Baptism Status column.
8. Roles: Info Desk cannot open Materials, Certificates, or Baptism by URL;
   Coordinator cannot issue certificates; direct URLs redirect to the landing page.
9. `npm run lint` and `npm run build` pass. Show `git log --oneline`, confirm
   `main` is untouched, open the PR into `main`, and stop. Do not merge.
