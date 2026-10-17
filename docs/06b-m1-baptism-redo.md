# 06b · M1 Class and Baptism: redo the screens to match the design

**Read first, in this order:** `docs/06-m1-and-baptism.md` (the rules and database), then open `docs/mockups/m1-baptism-screens.html` in a browser. That HTML file is the design. The screens you built do not match it. Keep what is correct (database, RPCs, RLS, the Home tiles, the "Missed M1 Day N" tag, README). **Redo the M1 and Baptism UI so it looks and works like the mockup.**

Stay on branch `feat/m1-baptism` (PR #2). Do not touch main. Put new work in new commits. If any database change is needed, it is additive, with a rollback file, applied once, and types regenerated, exactly as in docs/05 Part 1.

---

## 0 · What is wrong right now (from screenshots of the built app)

1. **The M1 table is missing.** The Enrolled tab shows three small Day cards with unlabeled icon buttons, then one day's attendance with a single checkbox. The design is **one table, one row per person, with three tick columns (Day 1, Day 2, Day 3)** next to name, phone and address. Fix this first.
2. **A UUID is shown to users.** The class selector displays `c21664dd-6948-4c2b-9227-8…`. A Base UI `Select` shows the raw `value` unless you pass it the label. The same bug showed template ids earlier. Fix every select in the app (see section 1).
3. **A scrollbar and arrows appear on the tab row** (Enrolled, Needs M1, Missed a day, Materials, Certificates). There must be no scrollbar anywhere on the tabs.
4. **The Add form is a side drawer with broken layout.** "Age group" and "Prefers contact by" buttons overlap and overflow the panel. It must be a **centered dialog** with a proper grid.
5. **Classes cannot be deleted or edited.** Kevin already has two test classes and cannot remove one.
6. **Icon-only buttons with no labels** on the day cards (Add, Announce, Close). Every button gets a text label.
7. **The Baptism page** sits in a narrow centered column unlike every other page, has no tabs, and the form for a new service and Register must also be centered dialogs.
8. Walk-in, Missed, Materials, Certificates, the reply page and the person sheet: check each against the mockup section by section below and fix any difference.

---

## 1 · Rules for the whole app (apply to every screen you touch)

**No scrollbars, ever, unless it is the page itself.**
- Tab lists, filter rows, day cards and toolbars must **wrap or shrink**, never scroll. Remove `overflow-x-auto`, `overflow-auto`, `overflow-x-scroll` from them. Use `flex flex-wrap gap-2` and let items wrap onto a second row.
- Tables fit their container: columns shrink with `min-w-0`, long text uses `truncate`. On phones, hide the Address column and let the name cell show the phone under the name. Do not scroll the table sideways.
- Dialogs: content is sized so it fits. If a dialog is taller than the screen, the **dialog body** may scroll quietly (hidden scrollbar: `scrollbar-width: none`), never the buttons row.
- After the change, search the codebase for `overflow-x-auto`, `overflow-auto` and `overflow-y-auto` in `src/components/m1`, `src/components/baptism` and their pages. List what you removed and what you kept and why.

**Forms are centered dialogs, not drawers.**
- Use shadcn `Dialog` (centered, max width `max-w-lg`, `max-h-[90vh]`). Do not use `Sheet` for forms. The only side panel allowed is the **person details** panel (read and act), because the mockup shows it beside the list.
- Form layout: a two column grid on desktop (`grid grid-cols-1 sm:grid-cols-2 gap-4`), single column on phones. Segmented choices (Gender, Age group, Prefers contact) use `ToggleGroup` with `flex-wrap` and equal button width, one row each, with their label above. Nothing may overlap or overflow. Check at 360px width and at 1280px.
- Footer: Cancel on the left, the primary button on the right, both inside the dialog, never wrapping off screen.

**Selects show names, not ids.** (This is a display bug, not a leak. Ids are not secrets. Security comes from RLS, see section 7.)
- Base UI `Select.Root` needs an `items` prop (array of `{ value, label }`) or a `SelectValue` that renders the label of the selected item. Create one small helper `labelFor(items, value)` and use it for: class selector, template selector, volunteer selector, day selector, anything that selects a record by id.
- Test: no UUID, no `2ac7b95f-…`, no raw enum string (`not_started`) is visible anywhere in the UI. Grep the UI for places where an id is rendered as text.

**Every button has a text label.** Icons may sit beside the label. Icon-only buttons are allowed only for close (X) and row menus (…), and they must have an `aria-label`.

**Everything keeps the existing shadcn look** (neutral tokens, the same type scale as People and Follow-ups). Page header = title, one line of subtitle, actions on the right. Pages use the same full width as People, not a narrow centered column.

---

## 2 · M1 Class page `/m1` (rebuild to the mockup)

**Header row.** Title "M1 Class", subtitle "New-member classes, attendance and certificates". Right side: **New class** button (opens a centered dialog).

**Class bar** (under the header, one row that wraps):
- Class selector showing the **class name** (for example "October class"), then a small badge (Open / Ended / Archived), then "3 days · Kagugu hall" (venue from the class).
- Right side: **Send reminders**, **Add**, and a **⋯ menu** with Edit class, Archive class, Delete class (section 3).

**Four stat tiles** in one row that wraps: Enrolled · Here today (Day N) · Waiting for a class · Missed a day. Numbers come from the database, not guessed.

**Tabs** (wrap, no scroll): `Enrolled 14` · `Needs M1 9` · `Missed 3` · `Materials 4` · `Certificates`. Counts are small badges. The tab "Missed a day" is just "Missed".

### 2.1 Enrolled tab: the table with three ticks
One row per enrolled person. Columns:

| Name (with a small chip: "Missed Day 1" or "Walk-in today" when true) | Phone | Address | Day 1 | Day 2 | Day 3 | Progress |
|---|---|---|---|---|---|---|

- **Day columns** show the session date under the title: `Day 1`, `12 Oct · closed`; `Day 2`, `Today`; `Day 3`, `26 Oct`.
- **Cell behaviour:** today's open day is a checkbox the volunteer ticks. A **closed** day shows a locked tick or an absent mark and cannot be changed except by Admin (with a confirm). A **future** day shows an empty dash and is disabled. Today's column has a light highlight.
- **Progress** is "2/3" with a thin bar.
- **Tick saves immediately** (optimistic, with undo toast), through the existing attendance table. No separate save button.
- **Clicking a name** opens the **person details** side panel (2.2). Do not navigate away.
- **Close Day**: a button in the table header above today's column: "Close Day 2". It asks one confirmation: "Everyone not ticked will be marked absent and appear under Missed. Close Day 2?" It calls `close_m1_session`.
- **Day summary**: under the table, a collapsed section "Day 2 summary" with the text area and Save summary (this is what the catch-up message uses). Do not show it above the table.
- The three Day cards you built are removed. Their information (date, venue, present count) lives in the column headers and the stat tiles.
- Empty state: "Nobody is enrolled yet. Press Add to enrol people from the waiting list or register a walk-in."
- Search box and a filter "All / Missed a day / Complete" above the table.

### 2.2 Person details panel (side, read and act)
Opens beside the table. Content, top to bottom:
- Name, line "Enrolled · October class · 1 of 3 days".
- Phone, address with landmark (`address_details`), "Prefers WhatsApp", email or "No email".
- Buttons with labels: **Call**, **WhatsApp**, and Email or SMS if that is their preference.
- Attendance: Day 1 · here, Day 2 · not ticked, Day 3.
- **Send a message**: template picker (class reminder, missed catch-up, notes, certificate ready), the filled message, and a send button. Under it "Last message: Rahman reminded you on 11 Oct (WhatsApp)".
- Edit person link.
Every open of WhatsApp, SMS, Email or Call writes an `m1_message_log` row. "Sent" means the chat was opened.

### 2.3 Add dialog (centered)
Title "Add to M1 Class". Two tabs inside: **Find existing** and **New person**.
- **Find existing:** search people by name or phone, with the waiting list ("Needs M1") shown first. Press "Enrol" next to a person.
- **New person (walk-in):** grid with First name, Last name, Phone (+250 default, validated with libphonenumber-js), Where do they live (Location), Address details (optional), Email (optional), Gender (Male, Female), Age group (Child, Youth, Adult, Elderly), How should we contact them (WhatsApp, Email, SMS, Call). A checkbox at the bottom "Mark present for Day 2 now" (the label shows the real open day, and is hidden if no day is open).
- Duplicate check by phone: "This number belongs to <name>. Enrol them instead?".
- Buttons: Cancel, **Save and enrol**.
- A walk-in is created in `people` (category M1 Class, `needs_m1` true), enrolled, ticked if the box is on, with the "Walk-in today" chip.

### 2.4 Send reminders dialog (centered)
Title "Send reminders", subtitle with the day and date (for example "Day 3 · Sun 26 Oct, 9:00"). Template selector (names, not ids). List of enrolled people with their preferred channel and a state: **Send**, **Sent** (opened). Press Send: the chat or email opens with the message ready, state becomes Sent, a log row is written. Helper text: "WhatsApp opens one chat at a time with the message ready. Press send there, then come back and tap the next name."

### 2.5 Missed tab
Table: Name, Missed (Day 1), Phone, Status. Status is one of: **Not contacted** (action **Send catch-up**), **Message sent 10:12** (action **Resend**), **Replied: Work** (action **View reply**).
- **Send catch-up** opens the channel with the message: the day summary, the notes link, the next class date, and the private reply link. Creates the reply token (single use, expires in 7 days) through the existing function.
- Beside or under the table, a card **Why people missed**: counts by reason (Work, Sick, Transport, Family, Forgot, Other) and the latest reply with the person's name.
- Button **Record a reason I heard by phone** (centered dialog: pick person, pick reason, note).
- The reply is saved in `m1_absence_replies` and appears here immediately.

### 2.6 Materials tab
Drop zone "Drop files here or choose files" (PDF, Word, PowerPoint, images, up to 25 MB each, type and size checked before upload). List of files with the day tag, size, who and when, and a delete button (Admin and class leader). **Share files** card: choose who (everyone or those who missed Day N), choose files, show the split "By WhatsApp 2 · By email 1", then **Open share list**, which goes through each person with the message ready. Links are signed, valid 7 days. Text under it: "A web page cannot attach files to a WhatsApp chat, so the message carries the link."

### 2.7 Certificates tab
Header "N ready" with **Print certificates** and **Mark as issued**. Ready list: name, "3 of 3 days", Not issued or "Issued · M1-2026-0003". "Not ready · N" list: "2 of 3 days, missed Day 2" with **Allow make-up**. A preview of one certificate: church name placeholder, "Certificate of Completion", "This certifies that <name> attended all three days of the M1 Class, held in <month year> at <venue>.", certificate number, two signature lines labelled Pastor and Class leader. **Do not invent the church name or signatory names.** Read them from a small settings record (Admin can edit) and show a visible warning while they are empty. Print stylesheet: A4 landscape, one certificate per page.

### 2.8 Needs M1 tab
People with `needs_m1` and not enrolled in this class: Name, Phone, Address, button **Enrol** and a **Remind** shortcut. Bulk: checkboxes and "Enrol selected".

### 2.9 Public reply page `/reply/:token`
Phone-first, no sidebar, no login. "We missed you", "M1 Class · Day 1", greeting with first name only, "What we studied" (the day summary), **Download the notes**, "Next class" date, venue, then "Is there something that kept you away? Only if you would like to share." with reason buttons (Work, Sick, Transport, Family, Forgot, Other), a text box, **Send**, then a thank-you state. Expired or used link shows "This link has finished". Never show surnames, phone numbers or other people.

---

## 3 · Classes: edit, archive, delete (new)

Menu on the class bar. All three need Admin or class leader; Delete is Admin only.

- **Edit class**: centered dialog with name, venue, the three dates and times, status. Changing dates must not lose attendance.
- **Archive class** (default, safe): sets `archived_at`. The class disappears from the selector and Home counts but stays in a "Show archived" toggle. People return to "Needs M1" only if they never completed it. Archive is reversible ("Restore").
- **Delete class** (permanent): centered confirmation dialog.
  - It first shows what will be removed: "October class has 14 enrolled people, 23 attendance ticks, 4 files, 5 replies."
  - If the class has **any attendance ticks, issued certificates or replies**, offer **Archive instead** as the primary button, and require typing the class name to enable Delete.
  - If the class is empty (no ticks, no certificates), a normal confirm is enough.
  - Deleting a class never deletes the people. It deletes enrolments, sessions, attendance, messages log, materials (and the stored files), reply links and replies for that class in one transaction through a function `delete_m1_class(p_class uuid)` that checks the role. Recompute `needs_m1` for people who were enrolled but never completed.
  - Issued certificate numbers are never reused.
- Migration (additive): `alter table public.m1_classes add column if not exists archived_at timestamptz;`, the `delete_m1_class` function, a rollback file, and RLS so only Admin can delete.
- Same two actions (Archive, Delete) for **baptism services** on the Baptism page, with the same warning.
- Deleting Kevin's two test classes is an acceptable first test. Do it on the app, not by SQL.

---

## 4 · Baptism page `/baptism` (rebuild to the mockup)

Same width and header as other pages (not a narrow column). Title "Baptism", subtitle "Who needs baptism, and when". Actions: **New service** (centered dialog: date, time, venue, notes).

Tabs (wrap, no scroll): `Needs baptism` · `Scheduled` · `Baptized`, each with a count.
- **Needs baptism** table: Name, Phone, Address, "M1 completed on <date>" or "Not in M1", Prefers contact, actions **Remind** and **Register** (Register opens a centered dialog to choose the service and note, then moves them to Scheduled).
- **Scheduled** grouped by service: service header (date, venue, count) and its people, with **Send reminder to all**, **Mark attended**, **Unregister**.
- **Baptized**: name, date, service, link to the person.
- **Services** (a small list above or beside the tabs): upcoming and past, with **Mark done** (asks to confirm, marks registered people Baptized, sets `baptism_status`), Edit, Archive, Delete.
Reminder template "Baptism reminder" is used by Remind and Send reminder to all, through the same send queue.

---

## 5 · Home and other connections
Keep the Home tiles ("Waiting for M1", "Need baptism") and make each tile a link to its page. Keep the "Missed M1 Day N" tag on follow-up cards. People table keeps a small M1 chip. Sidebar section "Classes" with M1 Class and Baptism stays.

---

## 6 · Order of work (one commit each, lint and build before each)
1. Select label helper, applied app-wide. Remove the UUID display. (Section 1)
2. Remove all tab and table scrollbars in the M1 and Baptism pages. Tabs wrap. (Section 1)
3. Enrolled table with three tick columns, stat tiles, class bar. Remove the Day cards. (2.1)
4. Person details panel. (2.2)
5. Add dialog (centered). Send reminders dialog (centered). (2.3, 2.4)
6. Missed tab, Materials, Certificates, Needs M1. (2.5 to 2.8)
7. Classes: edit, archive, delete, with the migration and rollback. (3)
8. Baptism rebuild with centered dialogs. (4)
9. Public reply page check. (2.9)
10. README update, then final checks.

## 7 · Security check (do this before the final report)
The raw-id display is a UI bug. Still, do a real review of the new tables:
- For every table added in 06 (`m1_*`, `baptism_*`) run `select tablename, rowsecurity from pg_tables where schemaname='public'` and confirm RLS is on. List each policy and the role it allows.
- Confirm `m1_reply_links` and token tables have no policy for `anon`. Only the two RPCs are callable by anon.
- Confirm the public RPCs return only first name, summary, next date, notes link, and never an id, a phone number or a surname.
- Confirm the storage bucket `m1-materials` is private and files are shared only by signed links with an expiry.
- Confirm Info Desk and Pastor cannot delete classes, and that `delete_m1_class` rejects them.
- Confirm Pastors can see class members (or tell Kevin they cannot and why).
Put the results in the PR as a short table.

## 8 · Verification you must do and show
Run the app and take screenshots (desktop 1280 and phone 390 wide) of: Enrolled table with ticks, person panel, Add dialog (New person), Send reminders dialog, Missed tab, Materials, Certificates, Baptism tabs, delete class dialog, public reply page. Check by eye: no scrollbar on tabs, no overlapping controls, no ids visible, forms centered. Describe what you saw for each in the PR, and say clearly which item you could not verify.
`tsc -b`, `oxlint` (no new warnings), `npm run build` must pass.

## 9 · Do not
Do not invent the church name or signatory names. Do not auto-send anything. Do not say "delivered". Do not change main. Do not merge the PR. Do not drop or rename existing columns. Do not remove the 06 database work.
After this, update the PR description, say what changed, and stop. Note that PR #2 is stacked on the unmerged Task 5 PR: merge Task 5 first, then retarget #2 to main.
