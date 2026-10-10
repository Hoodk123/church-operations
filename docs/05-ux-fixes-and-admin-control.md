# Task 5 — UX Fixes, Admin Control, and Safe Branch Workflow

Read `04-roadmap-and-database.md` first. Its ground rules still apply (shadcn
`base-nova` style, Base UI so `onClick` not Radix `onSelect`, confirm real
column names through the Supabase MCP server before writing queries, reuse the
colour maps in `constants.ts`, tooltips on icon-only buttons, no star icon).

No images are provided to you. Everything needed is written below. If
something is not covered, stop and ask instead of inventing it.

## Why this task exists

The first versions of Check-in, Follow-ups, Board, Attention, and Today work,
but testing showed problems: Check-in feels bare and confusing, the Board
shakes and hides the card you are dragging, Follow-ups does not let a volunteer
finish with someone, and the admin cannot see or direct the volunteers. The
admin is also the person who should land on a page with numbers, not the
volunteers.

The mental model for every screen:

- **The door** (Info Desk): records who came today.
- **Care** (volunteers): contact people and finish with them.
- **Control** (Admin): see the numbers, see each volunteer, hand out people.

---

## Part 0 — Work safely: branch, tag, rollback

Do this before changing any code.

1. Run `git status` and `git branch --show-current`.
2. If there is uncommitted or unpushed work on `main`, do not push it to
   `main`. Create a branch, commit it there, and push the branch:
   - `git switch -c feat/checkin-followups-board` (only if such work exists)
   - commit, then `git push -u origin feat/checkin-followups-board`
3. Put a restore point on the last known-good `main`:
   `git tag pre-admin-control origin/main` then `git push origin pre-admin-control`.
4. Create the branch for this task from the branch above (or from `main` if
   the previous work was already merged):
   `git switch -c feat/admin-control-and-checkin-fixes`
5. Commit in small steps, one per item in Part 3, with messages like
   `fix(board): float dragged card in DragOverlay`. Push the branch often.
6. Never push to `main` and never force-push. When everything passes, open a
   pull request into `main` and stop. Kevin merges it after testing on his phone.

### Rolling back code

| Situation | Command |
|-----------|---------|
| One bad commit on the branch | `git revert <commit>` |
| Abandon the whole branch | `git switch main` (main is untouched) |
| A merged PR broke main | `git revert -m 1 <merge-commit>` or reset to the tag `pre-admin-control` |

---

## Part 1 — The database is shared by every branch

All git branches talk to the **same** Supabase project. A migration applied
for this branch is live for `main` and for every other branch immediately. So:

1. **Additive only.** New tables, new columns with defaults or nullable, new
   functions and policies. No renames, no drops, no type changes, no tightening
   of existing policies. Code on `main` must keep working after the migration.
2. **Migrations live in the repo.** There is no `supabase/` folder yet. Create:
   - `supabase/migrations/20261010000000_admin_control.sql` (the SQL in Part 2)
   - `supabase/rollbacks/20261010000000_admin_control.down.sql` (the undo SQL)
   Also add the two migrations from `04-roadmap-and-database.md` as
   `supabase/migrations/20261007000000_attendance_contact_log.sql` if they
   are not tracked yet. Check the live database first (`list_tables`,
   `list_migrations`) so nothing is applied twice.
3. **Apply once, to the shared database,** through the Supabase MCP server,
   after confirming column names. Report exactly what ran.
4. **Other branches** receive the migration files when they merge `main` after
   this PR lands (`git merge origin/main`). Until then they still work because
   of rule 1. Regenerate the TypeScript types after applying and commit them.
5. **If Kevin has a separate Supabase development project or Supabase
   branching enabled,** apply there first and ask before touching production.
6. Never run the rollback file unless Kevin asks. It deletes data in the new
   tables and columns.

---

## Part 2 — Database changes (all additive)

```sql
-- A. Who assigned a person, and when
alter table public.people
  add column if not exists assigned_at timestamptz,
  add column if not exists assigned_by uuid references public.team_members(id);

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
```

Rollback file (`supabase/rollbacks/20261010000000_admin_control.down.sql`):

```sql
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
alter table public.people drop column if exists assigned_by;
alter table public.people drop column if exists assigned_at;
```

Checks after applying: (1) an Admin can call `get_volunteer_overview()` and an
Info Desk user gets zero rows; (2) a non-admin cannot insert into
`message_templates`; (3) reassigning a person fills `assigned_at` and
`assigned_by`; (4) a `contact_log` insert with `finished = true` sets the
person to Completed. Report the result of each.

---

## Part 3 — Fixes and features (build in this order, one commit each)

### 3.1 Board: drag, shake, and scrollbars (fix first)

Symptoms seen in testing: while dragging, the card is cut off at the column
edge and cannot be seen moving; a small scrollbar appears inside the column
and the layout shakes; the filter dropdowns show "Everyone" and "All" with no
label. The pushed repo does not contain this code yet, so find the cause in
the local `FollowUpBoard.tsx` and `BoardCard.tsx`. Likely causes: columns have
their own `overflow` (x or y) which clips the dragged card and toggles a
scrollbar, and the dragged card is moved inside its column instead of being
rendered in a drag overlay.

Required behaviour:

- Use `@dnd-kit/core` `DragOverlay` for the dragged card. The overlay card is
  a visual copy that follows the pointer above everything (portal, high
  z-index), with a stronger shadow and a small tilt. Use `CSS.Translate`, not
  top/left animation.
- While dragging, the original card stays in its column as a dashed
  placeholder (same height) so columns do not jump.
- Each column is a droppable that fills its height, including empty columns
  (minimum height). The column under the pointer shows an outline.
- `PointerSensor` with `activationConstraint: { distance: 6 }` so a click still
  opens the person drawer. `TouchSensor` with a short delay (about 200 ms) and
  a tolerance, so phones can scroll and still drag.
- Use `closestCorners` or `pointerWithin` collision detection. Keep the
  default auto-scroll so dragging near the edge scrolls the board.
- Add a drop animation (dnd-kit's `dropAnimation`) so the card settles into
  place, then update status optimistically. Roll back and show a message if the
  database refuses.
- **Scrollbar rule for the whole app:** only the page scrolls vertically, and
  the board has exactly one horizontal scroll container around all columns.
  No column has its own scrollbar (`overflow: visible`, columns grow with
  their cards). If a long column is unavoidable, use `scrollbar-gutter: stable`
  so nothing shifts. Search the app for any other nested scroll areas and
  remove them.
- Keep the "Move to" menu on every card for phones and keyboards.
- Give the filter selects visible labels: "Assigned to" and "Category".

### 3.2 Check-in page

Purpose (write this as the page subtitle logic and keep it in mind): it records
who is **present at today's service**. It searches all registered people and
adds an `attendance` row. It is used by Info Desk volunteers (and Admin). It
is not for volunteers' own attendance when serving.

Layout on desktop (two columns, left wider, right fixed about 270px):

- Page header: title "Check-in", subtitle "Sunday Service · <date>", and on the
  right a normal-sized primary button "New visitor" with a plus icon. Do not
  stretch this button across the page on desktop. On phones (below 768px) it
  becomes a full-width button fixed at the bottom of the screen.
- Left column:
  - Search box (Input Group with search icon), autofocus, starts at 2 characters.
  - "N matches" line, then result rows (Item): avatar, name, category badge,
    location, and one button "Check in".
  - If the person already has an attendance row today, replace the button with a
    green badge "Here 09:42" (time from `checked_in_at`). Never allow a second
    check-in.
  - Section "Came last Sunday, not here yet", shown when the search box is
    empty or always below results: chips with the person's name and a plus icon.
    Tapping a chip checks the person in. Source: `rpc('expected_today')`,
    limited to 12, with a "Show all" link that opens a Sheet.
- Right column card "Today so far":
  - Large number: total checked in today.
  - Four counts: Visitors, New converts, Members, Returning (by `people.category`).
  - "Just checked in": the last 8 check-ins with avatar, name, time, and an
    undo icon button (tooltip "Undo check-in") that deletes that attendance row.
    Undo is allowed for Admin and Info Desk. Add a delete policy for Info Desk
    on rows they created today if the existing policy only allows Admin, and
    report this.
  - Counts and list refresh right after each check-in without a page reload.
- Remove the "New Convert" button from the result rows. Instead, in the person
  drawer add "Mark as New Convert" (confirmation `AlertDialog`) that sets
  `category = 'New Convert'` and `needs_pastor = true`.
- The New visitor form is a right-side `Sheet` on desktop and a bottom
  `Drawer` on phones. Keep every rule from `04` (duplicate phone guard, Rwanda
  phone format, "Gave their life to Christ today" switch).

### 3.3 Follow-ups page (volunteer view)

- Left-align the content and use the full width. Remove any centred narrow
  container. Cards sit in a responsive grid: 2 columns on desktop, 1 on phone.
- Header: title, "N waiting", and a small progress bar "3 of 8 done today"
  (done = contact_log rows by me today, over done plus waiting).
- Sections, in this order:
  1. "Needs you now": `needs_pastor`, newly assigned and never contacted,
     or never contacted. Show a blue tag "New · assigned 2 days ago by Kevin"
     when `assigned_at` is within 7 days and the person has no contact yet.
  2. "This week": the rest, oldest contact first, as compact Items.
  3. "Done today": collapsed by default. People I logged today. Each has
     "Undo last log" (Admin and the volunteer who logged it).
- Cards: name, category badge, location, dot (green under 4 days, amber 4 to 10,
  red over 10 or never), then Call, WhatsApp, Log. Show "Last contacted today"
  when the gap is 0 days, "yesterday" for 1, otherwise "N days ago".
- Log sheet (Drawer on phone, Sheet on desktop): method, outcome, note, and a
  switch "Finished with this person". When on, insert the `contact_log` row
  with `finished = true` (the database trigger sets Completed), then the person
  leaves "My list" and shows in "Done today". The log row is the permanent
  record. After any log, move the card to "Done today" immediately.
- Right-hand panel "Message to send" (sticky on desktop, collapsible Accordion
  above the list on phone):
  - A `Select` of active `message_templates`, defaulting to the template whose
    `suggested_category` matches the first person, otherwise the first one.
  - A preview with `{name}` replaced by the person's first name and
    `{volunteer}` by my full name. Show the placeholders filled for the
    currently hovered or focused person, or the first card.
  - The WhatsApp button opens `https://wa.me/<digits>?text=<encoded message>`
    for that person using the selected template. Digits only, no plus sign,
    use `libphonenumber-js` with default country RW.
  - A "Copy" button for the message.
  - Admin only: "Edit templates" opens a Dialog to add, edit, deactivate and
    reorder templates (writes to `message_templates`).
- Empty state (Empty component): "Nobody is waiting on you. Thank you for serving."
- Admin sees a segmented control at the top: "My list | Volunteers" (3.4).

### 3.4 Volunteers (Admin only, inside Follow-ups)

- Segment "Volunteers" shows a table from `rpc('get_volunteer_overview')`:
  volunteer, assigned, contacted this week, overdue (red badge when above 0),
  last active (relative time). Header line: "N volunteers · M people assigned".
- Clicking a row opens a right-hand `Sheet` on the same page (no navigation).
  Title: volunteer name, subtitle: "N people · M overdue · role".
  The body lists their people (not Completed), each as a bordered row with:
  name, follow-up status badge, "Assigned by <name> · <date> (<relative>)" from
  `assigned_by` and `assigned_at` joined to `team_members`, and last contact
  with the red/amber/green dot. Rows have checkboxes.
- Footer buttons: "Reassign selected" (choose another volunteer, updates
  `assigned_to`) and "Assign more" (opens a picker of unassigned people).
- Clicking a person's name opens the existing `PersonDetailDrawer`.
- If the person has no `assigned_at` (old data), show "Assigned earlier".

### 3.5 Attention (Admin triage)

- Admin only in the sidebar. Volunteers do not get this page: their overdue
  people already show first in "My Follow-ups".
- Three groups with counts, as in `04`: "No volunteer yet", "Not started for
  more than 3 days", "Gone quiet, no contact in 14 days".
- Each row: checkbox, name, category badge, reason line (for example
  "Rahman Mahfuj · 6 days, not started"), and an "Assign…" or "Reassign…"
  button.
- Top bulk bar when rows are selected: "N selected", a `Select` of volunteers
  that shows each volunteer's current count ("Sandrine (8 people)") with the
  volunteer who has the fewest people preselected, and an "Assign" button.
- After assigning, the person disappears from the group and appears at the top
  of that volunteer's "Needs you now" with the "New" tag (that comes from
  `assigned_at`, so no extra code is needed on their side).

### 3.6 Home page (Admin) and role landing

- Replace the separate "Today" page. Rename the route to Home. Admin lands on
  Home after login. Other roles land on: Info Desk → Check-in, Follow-up
  Coordinator and Pastor → Follow-ups.
- Home content: keep the Bible verse header. Below it, six stat tiles:
  Checked in today (with "N more than last Sunday"), New visitors (with new
  converts), Waiting for first contact (with "N have no volunteer"), Overdue
  follow-ups (red border when above 0, links to Attention), M1 class in progress
  (with baptisms scheduled), Contacted this week. Then two cards: "Needs you"
  (top 5 items: unassigned people, long-overdue people, people who asked for
  the pastor, each with an Open button) and "Volunteers this week" (name and
  contacts, from `get_volunteer_overview`). No charts in this task.
- Sidebar per role (hide items a role cannot use, do not just disable them):
  - Admin: Home, Check-in, People, Follow-ups, Board, Attention
  - Info Desk: Check-in, People
  - Follow-up Coordinator: Follow-ups, Board, People
  - Pastor: Follow-ups, Board
  Direct URL access to a hidden page must redirect to the role's landing page.
- Keep "HBF Groups" and "Reports" under "Coming soon" as they are.

### 3.7 Small consistency fixes

- Every list page left-aligns with the same page padding as People.
- Use the same avatar, badge, and dot components everywhere.
- Loading states use Skeleton, empty states use Empty, saving buttons show a
  Spinner and are disabled while saving.
- All toasts use one toast component. If the CLI offers both `sonner` and
  `toast`, choose whichever it installs for the `base-nova` style and use it
  everywhere.

---

## Part 4 — Out of scope

Do not build HBF Groups, Reports, charts, M1 or baptism tracker, or the weekly
report in this task. Do not change People table behaviour.

## Part 5 — Done means

Report, for each item in Part 3, which acceptance line you tested and how.

1. Board: drag a card between all five columns on desktop; the card is visible
   the whole time, nothing shakes, no column scrollbar appears. Move a card on a
   phone with the "Move to" menu. An RLS failure rolls the card back with a message.
2. Check-in: check in a registered person (counts update), try again (shows
   "Here <time>", no second row), undo it, register a new visitor on a 375px
   wide screen, and check the duplicate phone guard.
3. Follow-ups as a coordinator: log a contact, see the card move to "Done today",
   mark one "Finished" and see it leave the list, send a WhatsApp message built
   from a template (link opens with the text filled in).
4. Admin: open Volunteers, open a volunteer, see "Assigned by" and the date,
   reassign someone, and see them appear on the other volunteer's list with "New".
5. Attention: bulk assign two people.
6. Home: opens for Admin; Info Desk lands on Check-in; typing the Home URL as an
   Info Desk user redirects away.
7. `npm run lint` and `npm run build` pass. List anything skipped.
8. Show the final `git log --oneline` for the branch and confirm `main` is
   untouched.
