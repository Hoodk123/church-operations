# Task 3 — Wire Real Sort / Filter / Group-by, and Simplify the Detail Drawer

## Context on what's wrong today

The Sort, Filter, and Group by dropdowns currently render but do nothing —
no actual TanStack Table state is being changed when a user interacts with
them. The Filter dropdown is also too narrow: it only offers Category and
Follow-up Status as filterable fields via two `<select>` elements with an
Apply/Clear button. This task replaces that with a proper per-column
filter/sort/group system, modeled on Notion-style property menus, and
fully wires it to real table state. It also simplifies the detail drawer,
which currently renders too many small cards.

No images are provided to you. Everything needed is written out below.

## Known field values (hardcode these — do not infer from data)

These come directly from the database's `check` constraints. Use these
exact strings, case-sensitive, everywhere a value list is needed:

- `category`: Visitor, New Convert, M1 Class, Member, Returning, Counseling
- `follow_up_status`: Not Started, Contacted, Met, Ongoing, Completed
- `gender`: Male, Female
- `age_group`: Child, Youth, Adult, Elderly
- `m1_status`: Not Started, In Progress, Completed
- `baptism_status`: Not yet, Scheduled, Baptized

## 1. Filter — redesign as a per-column property menu

Replace the current two-dropdown form entirely.

- Clicking the Filter icon opens a `DropdownMenu` (or `Popover`) with a
  search input at the top ("Filter by...") and a vertical list below it,
  one row per filterable column: Category, Follow-up Status, Gender, Age
  Group, M1 Status, Location, Assigned To. Each row shows a small leading
  icon consistent with the icon already used for that field elsewhere in
  the app (reuse the same icon-per-field mapping from the detail drawer).
- Clicking a column row expands into a second-level list showing that
  field's possible values (from the hardcoded lists above; for Location
  and Assigned To, which aren't fixed enums, show the distinct values
  currently present in the loaded data instead).
- Each value row is clickable/toggleable (checkbox-style, multiple values
  selectable per field — e.g. filter to Category = "M1 Class" OR "New
  Convert" at once).
- When a value is selected: mute its row background (subtle gray, not the
  default hover state) and show a checkmark icon (Lucide `Check`) on the
  right side of that row, replacing the earlier "Apply" button pattern
  entirely — selection is immediate, no separate confirm step needed.
- Support multiple active filters across different fields simultaneously
  (e.g. Category = M1 Class AND Age Group = Youth). Show active filters
  as small removable chips/pills directly in the toolbar, next to the
  Filter icon, so it's clear what's currently filtered without having to
  reopen the menu. Each chip has a small "x" to remove that one filter.
- Wire this to TanStack Table's `columnFilters` state — actual row
  filtering must happen, not just UI selection.

## 2. Sort — redesign to match multi-sort pattern

- Clicking the Sort icon opens a panel titled "Sort by".
- Each active sort is one row: a drag handle (Lucide `GripVertical`,
  purely visual is fine for now — full drag-reorder is a nice-to-have,
  not required), a "Property" dropdown (choose which column to sort by),
  a direction toggle showing "A → Z" / "Z → A" for text fields or
  "Oldest first" / "Newest first" for date fields, and a trash icon to
  remove that sort row.
- Below the active sort rows, a "+ Add sort" link/button adds another sort
  row, so multiple sort keys can be active at once (e.g. sort by Category,
  then by Registered date within each category).
- Wire this to TanStack Table's `sorting` state as an array, applied in
  the order the rows appear.

## 3. Group by — redesign and make functional

- Clicking the Group by icon opens a panel titled "Group by" with a trash
  icon (top-right) to clear grouping entirely.
- A single "Property" dropdown to choose the grouping field: Category,
  Follow-up Status, Age Group, M1 Status, or Location.
- A direction toggle (A→Z / Z→A) controlling the order groups appear in.
- Only one active grouping field at a time for this version (not a list
  like Sort).
- When a grouping is active, render the table with a header row above
  each cluster of matching rows, showing the group value and a count,
  e.g. "M1 Class (12)". Rows within a group render normally below their
  header. Groups appear in the table in the chosen sort direction.
- This is the primary way a user finds "everyone in M1 Class" or
  "everyone in the Youth age group" at a glance — prioritize this working
  correctly over visual polish.

## 4. Detail drawer — simplify to two cards, not several

Replace the current multi-card layout (Identity / Church Journey /
Follow-up as three separate boxes) with exactly two cards:

**Card 1 — Person Profile** (the primary card, appears first)
- Name (large, at the top of the card, above the other rows)
- Category badge
- Gender, Age Group, Phone, Location
- M1 Status, HBF Group (or "Not yet assigned" if null)
- Baptism Status — only render this row if category is "New Convert" or
  "M1 Class"; omit entirely otherwise
- Bottom-right corner of this card: two buttons side by side, "Edit" and
  "Delete" (Delete styled in a destructive/red variant).

**Card 2 — Record Info** (appears below Card 1)
- Registered by (name, joined from `team_members` via `registered_by`)
- Date registered
- Assigned to (name, joined via `assigned_to`, or "Unassigned")
- Follow-up status badge
- Last contact date (or "Never contacted" in a warning color if null)
- Notes (multi-line)

### Edit behavior
Clicking "Edit" on Card 1 switches that card's content into an editable
form (inputs/selects matching each field and its valid values from the
hardcoded lists above), replacing the read-only view in place — do not
open a separate dialog on top of the drawer. Below the form, show "Save"
and "Cancel" buttons. Save writes the changes to the `people` row via
Supabase and returns the card to its normal read-only view with fresh
data. Cancel discards changes and reverts to the read-only view.

### Delete behavior
Clicking "Delete" opens a confirmation (`AlertDialog`) asking "Delete
[First] [Last]'s record? This cannot be undone." with Cancel and a
destructive "Delete" confirm button. On confirm, delete the row via
Supabase and close the drawer, refreshing the table.

Respect existing RLS: if the signed-in user's role doesn't have delete
rights (only Admin does per current policy), don't render the Delete
button at all for that user, rather than showing it and letting the
request fail. Same logic applies to Edit if a user's role can't update
that specific row (e.g. a Pastor viewing someone not assigned to them
shouldn't reach this drawer in the first place, per existing RLS select
policy — but double check this holds).

## Deliverables
- Rework `src/components/people/PeopleTableToolbar.tsx` for the new
  Filter/Sort/Group-by menus described above.
- Add active-filter chips to the toolbar.
- Update `src/components/people/PeopleTable.tsx` to render group headers
  when grouping is active.
- Rework `src/components/people/PersonDetailDrawer.tsx` to the two-card
  layout, with working Edit and Delete.
- Confirm all three (sort, filter, group by) visibly change the table's
  rows when used — this is the main acceptance test for this task.
