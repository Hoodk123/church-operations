# Task 1 — App Shell, Navbar, and Page Header

## Context
This is "church-operations," a Vite + React + TypeScript app using shadcn/ui
(Base UI primitives), Tailwind v4, Supabase, and react-router-dom. Login and a
placeholder dashboard already work. This task replaces the placeholder
dashboard with the real app shell.

Do not guess at visual details — everything needed is specified below in
words. Do not attempt to read any image files; none are provided as visual
input to you. If something genuinely isn't covered here, stop and ask rather
than inventing it.

## Top navbar — left to right

1. **App identity** — small square logo mark (placeholder is fine, a simple
   monogram or icon) followed by the app name "Church Operations" in medium
   weight text. Clicking it navigates to `/dashboard`.
2. **Breadcrumb** — use shadcn's `Breadcrumb` component
   (`npx shadcn@latest add breadcrumb` if not already installed). Shows the
   current location, e.g. `Home / People`. This breadcrumb sits roughly
   centered in the navbar — there is empty flexible space on both sides of it
   so it visually sits in the middle of the bar, between the app identity on
   the far left and the cluster of right-side items on the far right.
3. **Right-side cluster**, in this order:
   - Small muted text showing when the people list was last updated, e.g.
     "Updated 3 min ago" — computed from the most recent `updated_at` value
     across all `people` rows. Recompute this at query time, formatted as a
     relative time string (use a small utility, no need for a heavy date
     library — a simple minutes/hours/days-ago formatter is enough).
   - The signed-in user's avatar (initials fallback, e.g. "SK" for Shyaka
     Kevin) with their role shown as a small `Badge` next to or below the
     avatar.
   - An icon button using the Lucide `Info` icon, wrapped in a shadcn
     `Tooltip` that reads "Recent activity" on hover, tooltip positioned
     **above** the icon. Clicking it opens a `Sheet` (drawer) sliding in
     from the right — see "Recent Activity Drawer" below.
   - There is intentionally **no star/favorite icon** anywhere in this UI.
     Do not add one.

## Page header (below the navbar, above the table)

- **Title**: a single Bible verse about serving, styled as the large page
  title (this replaces a literal app title like "People" or "Dashboard").
  Use: "Whoever wants to become great among you must be your servant —
  Matthew 20:26" as the title text, rendered as the main heading.
- **Subtitle**: one line of plain muted text underneath describing the
  page's purpose, e.g. "Every visitor, new convert, and member — tracked
  faithfully, so no one is lost to a forgotten thread."

## Recent Activity Drawer (opens from the Info icon)

- A `Sheet` component, opening from the right edge of the screen.
- `SheetHeader` with title "Recent Activity" and a close (X) button.
- Below the header, a vertical list of activity cards. Each card:
  - Rounded border, subtle shadow, comfortable internal padding (roughly
    `p-4`), rounded corners (`rounded-lg` or larger to match the Nova style
    already initialized).
  - A small colored status dot on the left of the first line (green if the
    action happened today, gray otherwise).
  - Bold first line describing the action, e.g. "Aline Uwase registered as
    a new visitor."
  - A muted second line with the exact date/time and a relative time in
    parentheses, e.g. "Aug 25, 2026, 2:13pm (4 hours ago)."
  - A small labeled row below showing who performed the action (avatar +
    name) — pull this from `registered_by` or the person who last updated
    the row, joined against `team_members`.
  - Query source: the 15 most recently changed `people` rows, ordered by
    `updated_at desc`. For each row, determine whether it's a new
    registration (created_at ≈ updated_at) or an update (updated_at is
    meaningfully later than created_at) and word the card accordingly.

## Deliverables for this task
- `src/components/layout/Navbar.tsx`
- `src/components/layout/PageHeader.tsx`
- `src/components/layout/RecentActivityDrawer.tsx`
- Wire all three into `src/components/Dashboard.tsx`, replacing the current
  placeholder content, keeping the existing auth/session-check logic intact.
- Use the Supabase MCP server connection to confirm actual column names on
  `people` and `team_members` before writing queries — do not assume.
