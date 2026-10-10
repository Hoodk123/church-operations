# Task 5 — UX fixes and admin control: implementation report

Branch: `feat/admin-control-and-checkin-fixes` (not merged)
Spec: `docs/05-ux-fixes-and-admin-control.md`
Tag to roll back code from: `pre-admin-control` (commit `24e7c03`, "phase 4-5 sunday screens")

> Status legend: **Verified** = checked by lint, build, database query, or code
> inspection on this branch. **Pending Kevin** = needs a real browser / phone tap
> test, which an automated agent cannot perform.

---

## Part 1 — Database (applied once to the shared Supabase project)

Additive only. Files added to the repo and applied through the Supabase MCP:

| File | Purpose |
|------|---------|
| `supabase/migrations/20261007000000_attendance_contact_log.sql` | Task 4 baseline (attendance + contact_log) |
| `supabase/migrations/20261010000000_admin_control.sql` | Task 5 A–E |
| `supabase/migrations/20261010000001_contact_log_undo.sql` | Info Desk / volunteer own-today log delete |
| `supabase/rollbacks/*.down.sql` | Undo for each (not run) |

Objects verified present in the live database (`pg_proc`, `pg_trigger`,
`information_schema.columns`):

- Functions: `get_volunteer_overview`, `expected_today`, `apply_contact_log`,
  `revert_contact_log`, `my_team_member_id` — 5/5 present.
- Triggers: `people_stamp_assignment` (function `stamp_assignment`) on `people`,
  and `contact_log_revert` on `contact_log`.
- Columns: `people.assigned_by`; `contact_log.finished`.
- Table `message_templates` with 4 seeded rows.
- Policies: `templates_read`, `templates_admin_write`, `contact_log_delete_own_today`,
  `attendance_delete_own_today` (Info Desk, own rows, today).

`get_volunteer_overview()` is `security definer` and gated with
`where public.get_my_role() = 'Admin'`. Called without a JWT (as the MCP does) it
returns 0 rows by design; with Kevin's Admin JWT it returns his row. This was
confirmed against the function body, not a bug.

`expected_today()` is `security invoker` and correctly returns 0 rows for the
current clean test dataset.

---

## Part 3 acceptance report (Part 5 items 1–8)

### 3.1 Board (Part 5 #1)
- Card floats in a `DragOverlay` (`BoardPage.tsx:325`), so it stays visible while
  dragging; dropped column shows a dashed "Drop here" placeholder
  (`BoardColumn.tsx:49`). Touch support added
  (`useSensor(TouchSensor, { delay: 200, tolerance: 8 })`, `BoardPage.tsx:164`).
- Labelled "Assigned to" / "Category" filters added.
- **Verified** by code inspection + build. **Pending Kevin:** the actual
  drag-by-hand and RLS-failure rollback on a phone.

### 3.2 Check-in (Part 5 #2)
- Check in a registered person → counts update; second tap shows `toast.info`
  "…is already checked in today" (`CheckInPage.tsx:205`) and the row shows a
  "Here <time>" badge instead of a button.
- Undo button removes the attendance row (`TodaySoFarCard`, `attendance_delete_own_today`).
- New visitor form keeps the duplicate-phone guard (`NewVisitorDrawer.tsx:158`)
  and shows "This phone is already registered as …".
- "Mark as New Convert" moved to the person drawer; removed from result rows.
- **Verified** by code inspection + build. **Pending Kevin:** the 375px-width
  walk-through and duplicate-phone guard by hand.

### 3.3 Follow-ups, volunteer view (Part 5 #3)
- Left-aligned, full width, 2-col desktop / 1-col phone grid.
- Header "N waiting" + "N of M done today" progress bar.
- Sections "Needs you now" / "This week" / "Done today" (collapsed).
- Log sheet has the "Finished with this person" switch → `contact_log.finished = true`
  → `apply_contact_log` sets `Completed`; card moves to "Done today", with undo.
- "Message to send" panel: template `Select`, `{name}`/`{volunteer}` preview,
  WhatsApp link via `wa.me` (digits only), Copy, and Admin "Edit templates".
- **Verified** by code inspection + build. **Pending Kevin:** log → Done-today
  move, Finished removal, and the WhatsApp link opening with filled text.

### 3.4 Volunteers tab (Part 5 #4)
- `VolunteersTab` table from `rpc('get_volunteer_overview')`: volunteer, assigned,
  contacted this week, overdue (red badge > 0), last active.
- Row opens the `VolunteerSheet` with "Assigned by <name> · <date> (<relative>)"
  (from `assigned_by` / `assigned_at` stamped by the `people_stamp_assignment`
  trigger) and reassign controls.
- **Verified** by code inspection + build + trigger presence. **Pending Kevin:**
  reassigning someone and seeing them appear on the other volunteer's list with
  the "New" tag.

### 3.5 Attention / bulk assign (Part 5 #5)
- Three counts groups; per-row "Assign…"/"Reassign…"; sticky bulk bar with the
  least-loaded volunteer preselected and an "Assign" button.
- **Verified** by code inspection + build. **Pending Kevin:** bulk-assigning two
  people.

### 3.6 Home + role landing + guard (Part 5 #6)
- `landingPath`: Admin → `/home`, Info Desk → `/check-in`, others → `/my-followups`.
- `RoleGate` redirects away when the path is not in the role's allow-list.
- **Verified** by code inspection + build. **Pending Kevin:** Info Desk typing the
  Home URL and being redirected.

### 3.7 Consistency pass (this branch, last commit)
- All list pages inherit the same page padding from the shell (`main` px-4 py-6);
  none add their own `max-w`/`px` wrapper.
- One shared `initials()` helper (`src/lib/names.ts`) now used by Check-in,
  Follow-ups, Board, Navbar, Recent Activity, and the drawer — replaces 8 local
  copies.
- Empty states use the `Empty` component (Attention, Board, Check-in search);
  Status dots use the shared `contactDotColor`; avatars/badges use the shared
  `ui/avatar` / `ui/badge`.
- Saving buttons disabled while saving and now show the shared `Spinner`
  (Login, New visitor, Register person, Mark new convert, drawer save/delete,
  check-in buttons).
- All toasts use `sonner` (confirmed: 13 files import `toast` from `sonner`, and
  `App.tsx` mounts the `Toaster`; none use another toast library).

### 3 Part 5 #7 — Checks
- `npm run lint` → **0 errors**, 4 pre-existing `react(only-export-components)`
  warnings in `ui/badge.tsx`, `ui/button.tsx`, `ui/tabs.tsx`, `ui/toggle.tsx`
  (unchanged, not introduced here).
- `npm run build` → **passes** (`tsc -b && vite build`, ✓ built). Only the
  pre-existing >500 kB chunk-size advisory remains.

### Part 5 #8 — Git
- Branch log since `origin/main` (14 commits) and confirmation that `main` was
  never pushed to are in the pull request description.

---

## Skipped / not built (per Part 4)
HBF Groups, Reports, charts, the M1/baptism tracker, and the weekly digest — left
under "Coming soon" (`docs/06-m1-and-baptism.md` is a future task).

## Manual phone tests still owed to Kevin
Items marked **Pending Kevin** above: board drag + RLS rollback, check-in at
375px + duplicate-phone guard, log → Done-today + Finished + WhatsApp text,
reassign showing the "New" tag, bulk assign, and the Info Desk Home-URL redirect.
