# Task 2 — People Data Table, Toolbar, and Detail Drawer

Do this after Task 1 (`01-layout-and-navbar.md`) is complete and working.
As with Task 1, no images are provided to you — every visual detail needed
is written out below.

## Data source

Query the `people` table via Supabase, joined to `team_members` for the
assigned person's name:

```
supabase
  .from("people")
  .select("*, assigned_to_name:team_members(full_name)")
```

Confirm exact column names and types against the real schema using the
connected Supabase MCP server before writing this query — do not assume.

## Table columns (visible in the compact table)

In this exact order, left to right:

1. **Name** — first_name + last_name combined, medium weight text.
2. **Category** — a `Badge` component. Give each category a distinct color
   variant so they're visually scannable at a glance (e.g. Visitor = blue,
   New Convert = teal, M1 Class = amber, Member = gray/neutral,
   Returning = purple, Counseling = coral/pink). Reuse this same color
   mapping everywhere categories appear in the app, including the detail
   drawer.
3. **Follow-up Status** — a `Badge`, separate color mapping from category
   (e.g. Not Started = red, Contacted = amber, Met = blue, Ongoing =
   purple, Completed = green).
4. **Assigned To** — the joined `team_members.full_name`, or "Unassigned"
   in muted text if null.
5. **Location** — plain text, or an em dash "—" if null.
6. **Registered** — `date_registered`, formatted as "Aug 25, 2026" (no
   time component needed here).

At the far right of the header row, include a small icon button (Lucide
`Columns3` or similar) that opens a `DropdownMenu` with checkboxes for
every available column (including ones not shown by default, like Gender
or M1 Status) — this lets a user add a column to the compact view if they
want it, backed by TanStack Table's column visibility state.

## Toolbar (sits directly above the table, right-aligned)

Icons appear in this order, left to right, each as a plain icon button
(no visible border until hovered), evenly spaced with small gaps between
them (~`gap-1` to `gap-2`):

1. **Sort** — Lucide `ArrowUpDown` icon.
2. **Filter** — Lucide `ListFilter` icon.
3. **Group by** — Lucide `Rows3` or `LayoutGrid` icon (pick whichever
   Lucide icon best suggests "group items together"; consistency matters
   more than the exact glyph).
4. **Search** — Lucide `Search` icon.
5. **View options** — Lucide `SlidersHorizontal` icon.

Then, separated by a bit more space, a solid **Add** button: dark/filled
background, rounded, a `Plus` icon followed by the text "Add". Clicking it
opens a form (a `Sheet` or `Dialog`, your choice) to register a new person
— all required fields from the `people` table, matching the categories and
constraints already defined in the schema.

### Tooltip behavior (applies to all 5 toolbar icons)
Wrap every one of the 5 icons above in a shadcn `Tooltip`. The tooltip must
appear **above** the icon (`side="top"` on the Tooltip content), not below.
Tooltip text: "Sort", "Filter", "Group by", "Search", "View options"
respectively. Tooltips should have fully rounded corners
(`rounded-full` or a large `rounded-lg`, matching whatever the Nova preset's
default Tooltip radius already renders — do not override it lower).

### Dropdown/popover behavior for Sort, Filter, Group by

Each of these three icons opens a `DropdownMenu` (or `Popover` — prefer
`DropdownMenu` for consistency since it already matches the installed
shadcn Nova style) positioned below the icon, left- or right-aligned so it
doesn't overflow the viewport.

- **Filter dropdown**: a vertical list, one row per filterable column
  (Category, Follow-up Status, Location, Assigned To). Each row shows a
  small leading icon representing that field (reuse a consistent icon per
  field: e.g. a tag icon for Category, a circle-check icon for Status, a
  map-pin icon for Location, a user icon for Assigned To) followed by the
  field's label. Clicking a row expands it (or opens a nested menu) to
  choose the specific value to filter by.
- **Group by dropdown**: a small panel with the label "Group by" at the
  top, a dropdown/select labeled "Property" underneath (choices: Category,
  Follow-up Status, Assigned To, Location), and a toggle for ascending vs
  descending order. Include a small trash/clear icon in the top-right of
  this panel to reset grouping.
- **Sort dropdown**: same shape as Group by, but sets TanStack Table's
  sorting state on the chosen column instead of grouping.

Use the same icon per field consistently across the table headers, the
filter dropdown, and the detail drawer (see below) — e.g. if Location uses
a map-pin icon here, use the same map-pin icon in the drawer next to the
Location value.

## Row click → Detail Drawer

Clicking anywhere on a table row (except directly on an interactive
element like a checkbox) opens a `Sheet` from the right showing full
detail for that person. Structure the drawer content as a series of
distinct rounded cards (not one long flat list) — group related fields
together:

- **Card 1 — Identity**: Name, Gender, Age group, Phone, Location (each
  with its consistent leading icon from above).
- **Card 2 — Church Journey**: Category badge, M1 status, HBF group
  (or "Not yet assigned" in muted text if null), Baptism status (only
  render this card's baptism row if category is "New Convert" or "M1
  Class" — hide it otherwise rather than showing an empty dash).
- **Card 3 — Follow-up**: Follow-up status badge, Assigned To (with
  avatar), Last contact date (or "Never contacted" in a warning color if
  null and the person isn't newly registered), Notes (multi-line text).
- Each card uses the same visual language as the Recent Activity cards
  from Task 1: rounded border, subtle shadow, comfortable padding,
  consistent internal spacing between rows.
- Below the cards, allow inline editing: clicking a value (e.g. the
  Follow-up Status badge) should let an authorized user change it directly
  from the drawer via a small `Select`, and save it back to Supabase on
  change. Respect existing RLS — if the update fails due to a policy
  (e.g. a Pastor trying to edit someone not assigned to them), surface a
  clear error message rather than failing silently.

## Responsiveness

- On narrow viewports (below roughly 768px), collapse the table to show
  only Name, Category, and Follow-up Status columns by default; all other
  columns move into the column-visibility dropdown mentioned above rather
  than disappearing entirely.
- The toolbar icons should wrap to a second row on narrow viewports rather
  than overflow or get clipped.
- The detail drawer should take up close to full width on narrow
  viewports instead of a fixed side-panel width.

## Deliverables for this task
- `src/components/people/columns.tsx`
- `src/components/people/PeopleTable.tsx`
- `src/components/people/PeopleTableToolbar.tsx`
- `src/components/people/PersonDetailDrawer.tsx`
- `src/components/people/AddPersonForm.tsx`
- Wire `PeopleTable` into the `/dashboard` route built in Task 1.
