# Task 4 — Roadmap, Database Changes, and the First Three Sunday Screens

Do this after Tasks 1–3 (`01-layout-and-navbar.md`, `02-people-table.md`,
`03-sort-filter-group-and-drawer.md`) are complete and working.

As with the earlier tasks: no images are provided. Everything needed is
written in words below. If something is not covered here, stop and ask
instead of inventing it.

The visual plan lives on the Miro board "Church Operations Roadmap"
(kanban of every task, the Sunday flow, and the database diagram). This file
is the written version of that board. Keep both in sync: when a task is
finished, tell the user so they can move its card to Done.

## Why we are doing this

Today the app has one screen: the People table. It is a good database, but a
Sunday volunteer needs a tool that tells them what to do next. We are building
around the Sunday flow:

1. **During service** (Info Desk and ushers, on a phone): check people in fast.
2. **After service** (Follow-up Coordinators and Pastors): call, log, and move
   people forward so nobody is forgotten.
3. **Later**: M1/baptism tracking, HBF groups, leader dashboard, weekly report.

## Ground rules (same as earlier tasks)

- Stack stays as is: Vite, React 19, TypeScript, Tailwind v4, shadcn
  (`base-nova` on Base UI, so use `onClick`, not Radix's `onSelect`),
  TanStack Table, Supabase, react-router-dom.
- Before writing any query, use the Supabase MCP server to confirm the real
  column names, types, constraints, and the existing RLS policies. Do not
  assume. The README schema may be out of date (for example the
  "How Found Church" column name).
- Reuse `src/components/people/constants.ts` for category and status colors and
  value lists. Do not create a second copy of them.
- Reuse the same icon per field everywhere (see the Task 2 icon mapping).
- Every icon-only button gets a `Tooltip` with `side="top"`.
- No star or favorite icon anywhere.
- Mobile first for the Check-in and My Follow-ups screens: they are used on
  phones, mostly iOS Safari. Tap targets at least 44px high, no hover-only
  interactions, inputs at 16px font size so iOS does not zoom.
- Surface RLS failures as a clear error message, never fail silently.

## Part A — Database changes (do this first)

Run these as one migration through the Supabase MCP server. Use
`get_my_role()` (already exists) and `auth.uid()`. First list the current
policies on `people` and `team_members` and mirror their style.

```sql
-- 1. Small change to people: flag people the pastor should know about
alter table public.people
  add column if not exists needs_pastor boolean not null default false;

-- 2. Attendance: one row per person per service per date
create table if not exists public.attendance (
  id            uuid primary key default gen_random_uuid(),
  person_id     uuid not null references public.people(id) on delete cascade,
  service_date  date not null default current_date,
  service_name  text not null default 'Sunday Service',
  checked_in_by uuid references public.team_members(id),
  checked_in_at timestamptz not null default now(),
  unique (person_id, service_date, service_name)
);
create index if not exists attendance_service_date_idx
  on public.attendance (service_date);

-- 3. Contact log: every call, message, or visit
create table if not exists public.contact_log (
  id           uuid primary key default gen_random_uuid(),
  person_id    uuid not null references public.people(id) on delete cascade,
  contacted_by uuid not null references public.team_members(id),
  contacted_at timestamptz not null default now(),
  method  text not null
    check (method in ('Call','WhatsApp','SMS','Visit','Other')),
  outcome text not null
    check (outcome in ('Reached','No answer','Scheduled visit','Needs pastor','Wrong number')),
  note    text
);
create index if not exists contact_log_person_idx
  on public.contact_log (person_id, contacted_at desc);

-- 4. Keep people.last_contact_date and status in step with the log
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
           when follow_up_status = 'Not Started' and new.outcome = 'Reached'
             then 'Contacted'
           else follow_up_status
         end,
         needs_pastor = needs_pastor or new.outcome = 'Needs pastor'
   where id = new.person_id;
  return new;
end;
$$;

drop trigger if exists contact_log_apply on public.contact_log;
create trigger contact_log_apply
  after insert on public.contact_log
  for each row execute function public.apply_contact_log();

-- 5. RLS
alter table public.attendance  enable row level security;
alter table public.contact_log enable row level security;

-- helper: the signed-in user's team_members.id
create or replace function public.my_team_member_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select id from public.team_members where auth_user_id = auth.uid()
$$;

-- attendance: you can see a row only if you can already see that person
create policy "attendance_select" on public.attendance
  for select to authenticated
  using (exists (select 1 from public.people p where p.id = attendance.person_id));

create policy "attendance_insert" on public.attendance
  for insert to authenticated
  with check (
    public.get_my_role() in ('Admin','Info Desk','Follow-up Coordinator')
    and checked_in_by = public.my_team_member_id()
  );

create policy "attendance_delete" on public.attendance
  for delete to authenticated
  using (public.get_my_role() = 'Admin');

-- contact_log: same visibility rule as attendance
create policy "contact_log_select" on public.contact_log
  for select to authenticated
  using (exists (select 1 from public.people p where p.id = contact_log.person_id));

create policy "contact_log_insert" on public.contact_log
  for insert to authenticated
  with check (
    public.get_my_role() in ('Admin','Follow-up Coordinator','Pastor','Info Desk')
    and contacted_by = public.my_team_member_id()
    and exists (select 1 from public.people p where p.id = contact_log.person_id)
  );

create policy "contact_log_modify_admin" on public.contact_log
  for update to authenticated
  using (public.get_my_role() = 'Admin')
  with check (public.get_my_role() = 'Admin');

create policy "contact_log_delete_admin" on public.contact_log
  for delete to authenticated
  using (public.get_my_role() = 'Admin');
```

After the migration:

- Regenerate or hand-write the TypeScript types: `Attendance`, `ContactLog`,
  and add `needs_pastor: boolean` to the `Person` type.
- Add to `constants.ts`:
  - `CONTACT_METHODS = ["Call","WhatsApp","SMS","Visit","Other"]`
  - `CONTACT_OUTCOMES = ["Reached","No answer","Scheduled visit","Needs pastor","Wrong number"]`
- Verify with two test accounts (one Info Desk, one Pastor) that RLS behaves
  as described. Report the results.

## Part B — Build order

Build in this order. Each item is one task on the Miro kanban.

| # | Task | Phase | Priority |
|---|------|-------|----------|
| 1 | Database changes (Part A) | During service | P1 |
| 2 | Quick Check-in screen | During service | P1 |
| 3 | My Follow-ups screen | After service | P1 |
| 4 | Follow-up Board | After service | P1 |
| 5 | Contact History inside the person drawer | After service | P1 |
| 6 | Needs Attention screen | After service | P1 |
| 7 | Today's Attendance + New Convert quick action | During service | P2 |
| 8 | Sidebar items and routes | After service | P2 |

Items 9 onward (M1/Baptism tracker, HBF Groups, Dashboard home, Team
workload, Weekly report) are **not part of this task**. Do not start them.

## Part C — Screens

### Screen 1 — Quick Check-in (`/check-in`)

Purpose: a volunteer at the door registers or finds a person in under
20 seconds, on a phone.

Layout (single column on phone):

1. Large search input at the top, autofocus, placeholder "Search name or
   phone". Search starts at 2 characters, debounced about 250ms, matches
   `first_name`, `last_name`, and `phone` (case-insensitive).
2. Results list below: each row shows name, category badge, and location.
   Tapping a row inserts an `attendance` row for today and shows a confirming
   message "Name checked in". If the unique constraint fires, show "Already
   checked in today" instead of an error.
3. Under the results, a full-width button "+ New visitor". It opens a `Sheet`
   (full width on phone) with the form below.
4. A small line at the bottom: "Checked in today: N" (count of today's
   attendance rows).

New visitor form fields:

- First name, last name (required)
- Phone (required): default country Rwanda (+250), validate and format with
  `libphonenumber-js` (already installed)
- Gender (Male / Female), Age group (Child / Youth / Adult / Elderly)
- Location (optional)
- How they found the church (use the existing column; confirm its name)
- Toggle: "Gave their life to Christ today". When on, set
  `category = 'New Convert'` and `needs_pastor = true`. When off,
  `category = 'Visitor'`.

On save, in order:

1. Insert the `people` row with `follow_up_status = 'Not Started'`,
   `date_registered = today`, `registered_by = my team member id`.
2. Insert the `attendance` row for today for that person.
3. Reset the form and keep the sheet open with a "Register another" button
   plus a "Done" button.

Duplicate guard: before inserting, search for the same phone number. If a
match exists, show "This phone is already registered as Name" with a button
to check that person in instead.

Roles: Admin, Info Desk, Follow-up Coordinator can use this screen. Pastor
does not see it in the sidebar.

Acceptance: a new visitor can be registered and checked in with one thumb on a
375px wide screen; an existing person can be checked in with search plus one
tap; checking in twice does not create two rows.

### Screen 2 — My Follow-ups (`/my-followups`)

Purpose: each team member sees exactly who to contact next.

Query: `people` where `assigned_to = my team member id` and
`follow_up_status != 'Completed'`.

Order (top to bottom):

1. `needs_pastor = true` first
2. never contacted (`last_contact_date is null`)
3. oldest `last_contact_date` first

Each person is a card (same rounded, subtle-shadow style as the drawer
cards) showing:

- Name, category badge, location
- "Never contacted" in the warning color, or "Last contacted N days ago"
- A small red/amber/green dot: green under 4 days, amber 4 to 10 days,
  red over 10 days or never
- Buttons: **Call** (`tel:` link), **WhatsApp**
  (`https://wa.me/<digits only, no plus sign>`), **Log contact**

**Log contact** opens a `Sheet` with: method, outcome, optional note. Save
inserts one `contact_log` row (the database trigger updates
`last_contact_date` and status, so do not duplicate that logic in the
frontend). After saving, refetch and show a short success message.

Header shows a count: "12 people to follow up". Empty state: "Nobody is
waiting on you. Thank you for serving."

Acceptance: logging a contact removes the red dot, updates the "days ago"
text, and a `Reached` outcome on a `Not Started` person moves them to
`Contacted`.

### Screen 3 — Follow-up Board (`/board`)

Purpose: see everyone by stage and move people forward.

- Five columns in this order: Not Started, Contacted, Met, Ongoing, Completed.
  Column header shows the status badge (same color map as the table) and a
  count.
- Each card shows name, category badge, assigned-to avatar, and "days since
  last contact". Clicking a card opens the existing `PersonDetailDrawer`.
- Moving a card changes `follow_up_status` in Supabase:
  - Desktop: drag and drop. Use `@dnd-kit/core` (new dependency, tell the user
    when you add it).
  - Phone and keyboard: a "Move to" menu (`DropdownMenu`) on each card. This
    must work without drag and drop.
  - Optimistic update with rollback and a clear error message if RLS rejects
    the change.
- A filter row above the board: "Assigned to" (default: everyone for Admin,
  me for others) and Category. Reuse the filter value lists from Task 3.
- Completed column shows only the last 30 days by default to stay short.

Acceptance: moving a card persists after refresh; an RLS failure puts the card
back and shows why.

### Screen 4 — Contact History (inside `PersonDetailDrawer`)

Add a section below the Record Info card titled "Contact history": a vertical
list of `contact_log` rows for that person, newest first. Each row shows
method, outcome badge, who logged it (join `team_members.full_name`), date,
and the note. Add a "Log contact" button using the same sheet as Screen 2.

### Screen 5 — Needs Attention (`/needs-attention`)

Three stacked lists, each with a count in its header:

1. **Unassigned**: `assigned_to is null`
2. **Not started for more than 3 days**:
   `follow_up_status = 'Not Started'` and `date_registered < today - 3 days`
3. **Gone quiet**: status `Contacted`, `Met`, or `Ongoing` and
   `last_contact_date < today - 14 days`

Admin only: row checkboxes and a "Assign selected to…" button using a select
of team members, which updates `assigned_to` for all selected rows. Other
roles see the lists read-only.

### Screen 6 — Today's Attendance and New Convert action

- Today's Attendance (`/today`): list of today's `attendance` rows joined to
  `people`, with counts at the top: total, visitors, new converts, members.
  Admin can remove a mistaken check-in.
- New Convert quick action: on the Quick Check-in results and in the person
  drawer, a "Mark as New Convert" action sets `category = 'New Convert'` and
  `needs_pastor = true` (confirm with an `AlertDialog`).

### Sidebar and routes

Add to the existing collapsible `Sidebar.tsx` with the same icon style:
Check-in, Today, My Follow-ups, Board, Needs Attention, People. Keep
`/dashboard` as the People table for now. Hide items a role cannot use.

## Deliverables

- Supabase migration for Part A, applied and verified.
- `src/components/checkin/` (`QuickCheckIn.tsx`, `NewVisitorSheet.tsx`)
- `src/components/followups/` (`MyFollowUps.tsx`, `LogContactSheet.tsx`)
- `src/components/board/` (`FollowUpBoard.tsx`, `BoardCard.tsx`)
- `src/components/attention/NeedsAttention.tsx`
- `src/components/attendance/TodayAttendance.tsx`
- Updated `PersonDetailDrawer.tsx`, `Sidebar.tsx`, `App.tsx` routes,
  `constants.ts`, and types.
- Update `README.md`: describe the two-card drawer, list docs 01 to 04, and
  document the new tables and screens.

## Definition of done

For each screen, state which acceptance line you tested and how. Run
`npm run lint` and `npm run build` and report any errors. Do not mark a screen
done if it only works for the Admin role.
