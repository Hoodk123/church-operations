# 08 · Welcome form (QR), one Classes screen for M1 / M2 / Siloam, Check-in queue

Read first: docs 04 to 07 and 06b. Same safety rules as docs/05 Parts 0 and 1: new branch `feat/welcome-and-classes` from main (after the open PRs are merged, or stacked on the latest feature branch if they are not; say which), tag `pre-welcome-classes`, additive migrations with rollback files, one shared Supabase project, never push to main, open a PR and stop.

**Before any SQL, read the real schema** (`people`, `attendance`, `m1_classes`, `m1_sessions`, `m1_enrollments`, `m1_attendance`, `team_members`) and adapt names. Column names below are assumptions. Report every name you changed.

The data is still seed data. Seed a few **clearly labelled test welcome submissions** (source `seed`) so the screens can be demonstrated, and make them easy to delete.

---

## 0 · What the church already does (from omegaministries site and its forms)

The church is **Omega Ministries** ("Start well, Keep the faith, Finish well"). Its public site lists: **M1 Membership**, **M2 Maturity**, **M3 Ministries**, **Siloam class**, **Appointment**, **Offerings and tithe**. Each opens a Google Form. The forms are very small:

| Form | Fields |
|---|---|
| Membership class (M1) | Full name (required), HBF / Aho utuye (optional), Phone number (required) |
| Maturity class (M2) | Full name, HBF / Aho utuye, Phone number (same three) |
| Ministries class (M3) | Full name, HBF / Aho utuye, Phone number (same three) |
| Siloam class | Full name (required), Location, Phone number (required) |
| Pastor appointment | Full name, Department (GABO, GORE, URUBYIRUKO), Phone, HBF, Reason (IMPAMVU), Pastor (Sr Pastor, Pastor Tayi, Pastor Eddy, Elder Moses, Elder Jean Louis, Other) |

Site descriptions: M1 "Become an official member of our church family and start your journey of faith, fellowship, and service." M2 "Grow deeper in God's Word through our discipleship and spiritual growth program." M3 "Find your place to serve by joining one of our church ministries and using your gifts." Siloam "Experience spiritual renewal and biblical teaching that equips you for a stronger walk with Christ."

What we learn:
- The printed QR code opens the site home page. A first-time visitor lands on a list of classes and nothing welcomes them. The welcome form (Part 1) fixes that.
- Class sign-ups need only name, phone and HBF / location. Our class screens must accept exactly that, so existing Google Form sign-ups can be entered or imported quickly.
- GABO, GORE and URUBYIRUKO are the church's own groups (men, women, youth). Add them as an optional **Group** on a person (see 1.4). Do not guess the mapping to age group or gender.
- **M3 Ministries is serving in a ministry**, which matches the Departments in docs/07 Part D (Technique, Ushers, Worship Team, Intercessors, Moderators, Volunteers). Do not build M3 as a class screen. In the class dropdown, M3 is shown as "Ministries" and links to People filtered by department. The welcome form may later ask "Would you like to serve?".
- Appointment with a pastor is a later feature. Do not build it now.

---

## Part 1 · The public Welcome form `/welcome`

### 1.1 Purpose and tone
A first-time visitor scans the QR code and lands on a **warm, short, mobile-first page**. It must feel like being welcomed, not like paperwork. The goal is to know who they are and how to reach them later, without pressure about classes.

Top of the page:
- "Welcome to Omega Ministries" and one line: "We are so glad you are here. Tell us a little about yourself so we can say hello properly. It takes about two minutes."
- A note: "You are not required to join anything today."
- The church name, logo area (empty placeholder if no logo).

### 1.2 Questions (in this order, one short step per screen group, a progress bar, big touch targets)

Step 1, About you
1. **Full name** (required)
2. **Phone number** (required; +250 default; validate with libphonenumber-js; normalise to +2507…)
3. **Where do you live?** (required, free text, for example "Kagugu, Rukingu")
4. **How would you like us to reach you?** WhatsApp / SMS / Phone call (required, default WhatsApp)

Step 2, Your visit
5. **Is this your first time with us?** Yes, first time / No, I have been here before.
6. If "No": **How long have you been fellowshipping with us?** Less than a month / 1 to 6 months / 6 to 12 months / More than a year.
7. **How did you find us?** Invited by someone / Social media / Passing by / Website / Event / Other. If "Invited by someone": **Who invited you?** (text, optional). Keep the answer as written; staff will link a real person later (docs/07 host flow).

Step 3, Your family
8. **Are you with family here?** Just me / With my spouse / With my family (children) / Prefer not to say.
9. If with family: **How many adults and how many children?** (two small number fields, optional).
10. **Would you like us to register your family with us?** Yes / Not now. Say: "We would love to know your family and celebrate with you, for example for baby dedication." Only the answer and the counts are stored. Do **not** ask for children's names or birth dates on this public form (see Part 4).

Step 4, Classes (optional, never pressured)
11. Intro text: "We offer classes to help you grow. They are an option. Tell us if you are ready, and if not, that is completely fine."
12. **Are you ready for a class?** Yes, I am ready / Not yet / Tell me more.
13. If "Yes" or "Tell me more": **Which class?** (checkboxes, from the database, active types only) M1 Membership, M2 Maturity, Siloam, "Not sure, please advise". Each option shows its one-line description from the site.

Step 5, Tell us more
14. **Anything you would like to tell us or ask? Any feedback about your visit?** (large text box, optional, 1000 characters).
15. **Consent** (required checkbox): "I agree that Omega Ministries may contact me using the details above." Link "How we use your details" to a short plain-language page.

Thank you screen: "Thank you, <first name>. Welcome to the family. Someone will reach out to you on <their chosen channel> this week." Then a button to "See our classes" (the church site). Show nothing about other people.

**Return visitor shortcut:** at the very top, a small link "I have been here before". It asks only the phone number and, if it matches a person, records today's attendance and shows "Welcome back! We are glad you are here." It never shows a name, phone, history or any detail. If the number is not found: "We could not find you. Please fill the short form." This way the same QR code also works as self check-in.

### 1.3 How the QR works
The new QR points to `https://church-operations.netlify.app/welcome?s=door` (the app domain). The `s` value is a **source tag** (`door`, `hall`, `flyer`, `website`) so the church can print different QR codes and see which one works. Store it. The old QR (site home) keeps working; the Google Site should get a prominent top button "New here? Start here" that links to `/welcome?s=website`. Provide a small admin page or note giving the exact link and a downloadable QR PNG (use the `qrcode` npm package, generate in the browser, no external service).

### 1.4 Data (additive SQL)

```sql
-- Group (church's own groups: GABO, GORE, URUBYIRUKO) and source
alter table public.people add column if not exists church_group text
  check (church_group in ('GABO','GORE','URUBYIRUKO'));
alter table public.people add column if not exists source text;
alter table public.people add column if not exists first_visit_date date;

create table if not exists public.welcome_submissions (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references public.people(id) on delete set null,
  qr_source text,
  full_name text not null,
  phone text not null,
  location text not null,
  preferred_contact text not null check (preferred_contact in ('whatsapp','sms','call')),
  first_time boolean not null,
  fellowship_duration text check (fellowship_duration in
    ('under_1_month','1_to_6_months','6_to_12_months','over_1_year')),
  found_via text,
  invited_by_text text,
  family_status text check (family_status in ('alone','spouse','family','private')),
  adults_count int check (adults_count between 0 and 20),
  children_count int check (children_count between 0 and 20),
  wants_family_registration boolean not null default false,
  class_readiness text check (class_readiness in ('ready','not_yet','tell_me_more')),
  feedback text,
  consent boolean not null,
  status text not null default 'new' check (status in ('new','checked_in','reviewed','archived')),
  submitted_at timestamptz not null default now(),
  checked_in_at timestamptz,
  reviewed_by uuid references public.team_members(id)
);
create index if not exists welcome_submissions_status_idx
  on public.welcome_submissions (status, submitted_at desc);

create table if not exists public.welcome_class_interest (
  submission_id uuid not null references public.welcome_submissions(id) on delete cascade,
  class_type_id uuid not null,
  primary key (submission_id, class_type_id)
);

create table if not exists public.welcome_rate (
  key text primary key,
  window_start timestamptz not null default now(),
  hits int not null default 1
);

alter table public.welcome_submissions enable row level security;
alter table public.welcome_class_interest enable row level security;
alter table public.welcome_rate enable row level security;
-- No anon policies on purpose. Only the functions below write.
create policy ws_staff_read on public.welcome_submissions for select to authenticated
  using (public.get_my_role() in ('Admin','Info Desk','Follow-up Coordinator','Pastor'));
create policy ws_staff_update on public.welcome_submissions for update to authenticated
  using (public.get_my_role() in ('Admin','Info Desk','Follow-up Coordinator'))
  with check (public.get_my_role() in ('Admin','Info Desk','Follow-up Coordinator'));
create policy wci_staff_read on public.welcome_class_interest for select to authenticated
  using (public.get_my_role() in ('Admin','Info Desk','Follow-up Coordinator','Pastor'));
```

### 1.5 The public RPCs (SECURITY DEFINER, callable by anon)

`submit_welcome(p jsonb) returns jsonb`:
1. **Rate limit.** Key = md5 of the first IP in `current_setting('request.headers', true)::json->>'x-forwarded-for'`. Allow 5 submissions per hour per key and 1 per phone per 10 minutes. Over the limit returns `{ok:false, reason:'slow_down'}`. Delete `welcome_rate` rows older than a day on each call.
2. **Honeypot.** The form has a hidden field `website` that humans never fill. If it has any text, return `{ok:true}` and store nothing, so bots learn nothing.
3. **Validate on the server** (never trust the browser): name 2 to 120 chars; phone matches `^\+[1-9][0-9]{7,14}$`; location 2 to 120; counts 0 to 20; feedback at most 1000 chars; enums in the allowed lists; `consent` must be true. Strip control characters. Anything wrong returns `{ok:false, reason:'invalid'}`.
4. **Match or create the person.** Look up `people` by phone. If found, **do not overwrite anything**: link the submission, fill only fields that are empty (location, preferred contact), set nothing else. If not found, create a person: category `Visitor`, source `welcome_form`, `first_visit_date` today, `date_registered` today, preferred contact, location, needs flags from class readiness.
5. Insert the submission and its class interests. If the person already attended today, set submission `checked_in`.
6. Return only `{ok:true, first_name:'…'}`. Never return an id, a status, or anything about an existing person.

`welcome_returning(p_phone text) returns jsonb`: normalise the phone, rate limit as above, find the person, insert today's `attendance` row if none exists (checked in by `null`, source `self`), return `{ok:true}` or `{ok:false}` only. No names.

Grants: `revoke all … from public; grant execute … to anon, authenticated`. Both set `search_path`.

### 1.6 Staff side of the data
- A person created here shows source "Welcome form" and a chip in People.
- Class interest appears in the person drawer: "Interested in: M1, Siloam" with the readiness answer, and feeds the Needs list of each class (Part 2).
- Feedback and "how found us" appear under a "Welcome form" card in the drawer. Feedback is read-only text.
- Family answers appear as "With family: 2 adults, 3 children. Wants family registration: yes".
- Staff can mark a submission **reviewed** once the feedback is read.

---

## Part 2 · One Classes screen for M1, M2, Siloam

### 2.1 Navigation
Replace the two sidebar items with a collapsible **Classes** group: `M1 Membership`, `M2 Maturity`, `Siloam`, then `Baptism`. Selecting one opens `/classes/m1`, `/classes/m2`, `/classes/siloam`. Old `/m1` redirects to `/classes/m1`. The page header also has a **type dropdown** (names, not ids) so the person can switch without the sidebar. The chosen type is remembered per user.

M3 Ministries is not a class (see 0). In the dropdown it appears as a link "Ministries (People by department)".

### 2.2 Same screen, different configuration
All class types share **one page component** driven by a `class_types` record and a small config object in code. Do not copy the M1 page.

```sql
create table if not exists public.class_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,            -- 'M1','M2','SILOAM'
  name text not null,                   -- 'M1 Membership'
  description text,
  default_days int not null default 3 check (default_days between 1 and 12),
  prerequisite_type_id uuid references public.class_types(id),
  prerequisite_required boolean not null default false,
  certificate_title text,
  active boolean not null default true,
  sort_order int not null default 0
);
insert into public.class_types (code, name, description, default_days, sort_order, certificate_title) values
 ('M1','M1 Membership','Become an official member of our church family and start your journey of faith, fellowship, and service.',3,1,'Certificate of Completion'),
 ('M2','M2 Maturity','Grow deeper in God''s Word through our discipleship and spiritual growth program.',3,2,'Certificate of Completion'),
 ('SILOAM','Siloam','Experience spiritual renewal and biblical teaching that equips you for a stronger walk with Christ.',3,3,'Certificate of Completion')
on conflict (code) do nothing;
update public.class_types set prerequisite_type_id =
  (select id from public.class_types where code='M1'), prerequisite_required = false
 where code = 'M2';

alter table public.m1_classes add column if not exists class_type_id uuid references public.class_types(id);
update public.m1_classes set class_type_id = (select id from public.class_types where code='M1')
 where class_type_id is null;

create table if not exists public.person_class_interest (
  person_id uuid not null references public.people(id) on delete cascade,
  class_type_id uuid not null references public.class_types(id) on delete cascade,
  status text not null default 'interested' check (status in ('interested','ready','not_yet')),
  source text,
  created_at timestamptz not null default now(),
  primary key (person_id, class_type_id)
);
alter table public.welcome_class_interest
  add constraint welcome_class_interest_type_fk
  foreign key (class_type_id) references public.class_types(id) on delete cascade;
alter table public.class_types enable row level security;
alter table public.person_class_interest enable row level security;
create policy ct_read on public.class_types for select to authenticated using (true);
create policy ct_admin on public.class_types for all to authenticated
  using (public.get_my_role() = 'Admin') with check (public.get_my_role() = 'Admin');
create policy pci_staff on public.person_class_interest for all to authenticated
  using (public.get_my_role() in ('Admin','Info Desk','Follow-up Coordinator','Pastor'))
  with check (public.get_my_role() in ('Admin','Info Desk','Follow-up Coordinator'));
```
Keep the table names `m1_*` (renaming would break other branches). Treat them as "class" tables in code and add a comment in the migration.

**Number of days.** M1 is 3 days. M2 and Siloam default to 3 here but **are not known**: the number of session columns is generated from the class's sessions (1 to 12), not hard coded to three. A "New class" dialog asks how many days.

**Per type differences** (a config in code, same components):

| | M1 Membership | M2 Maturity | Siloam |
|---|---|---|---|
| Stat tiles | Enrolled · Here today · Waiting for M1 · Missed a day | Enrolled · Here today · **Ready for M2** (finished M1, not in M2) · Missed a day | Enrolled · Here today · Waiting list · Missed a day |
| "Needs" tab means | `needs_m1` or interested in M1 and not enrolled | Completed M1 (certificate issued) and not enrolled in M2, plus anyone who asked for M2 | Anyone interested in Siloam and not enrolled |
| Prerequisite | none | M1 recommended: a person without M1 can be enrolled, with a visible note "M1 not completed" | **none**: anyone may study it |
| Certificate | on completion | on completion | on completion (wording from `certificate_title`) |

Rules:
- Prerequisite is a **warning, never a block**, unless `prerequisite_required` is true. For M2 the default is false.
- A person can be in several types over time. Completed M1 does not remove them from People.
- All tabs, the Add dialog (find existing / new person), reminders, Missed tab and reply page, Materials, Certificates, Close Day, Archive and Delete work exactly as in docs/06b, for every type. Message templates get `{class}` filled with the type name.
- Only the Needs-tab query, the stat tiles and the certificate title come from the type config.
- Admin can add or deactivate a class type in a small settings dialog later; not now.

### 2.3 Simple sign-up like the Google Forms
In the Add dialog's **New person** tab keep **Name, Phone, Where do they live (HBF / location)** at the top and mark everything else "More details (optional)", collapsed by default. A volunteer entering a Google Form sign-up must be able to finish in three fields.

### 2.4 Class interest from the welcome form
When a welcome submission says ready for M1, M2 or Siloam, create `person_class_interest` (status `ready`, or `interested` for "tell me more", none for "not yet"). The person then appears in the matching Needs tab and in Follow-ups for a friendly call ("Would you like to start M1?").

---

## Part 3 · Check-in shows who came from the form

Check-in stays a normal Sunday page. Add, above the search results, a section **From the welcome form** with a count:
- Lists submissions with status `new` from today, and older `new` ones from earlier days under "Earlier, not yet checked in".
- Each row: name, time, chips (First time / Been here 6 to 12 months, Wants M1, With family, Feedback), phone with a copy and WhatsApp button, and two actions: **Check in** (writes today's attendance for the person, sets status `checked_in`) and **Open** (the person drawer on the Welcome form card).
- If the person already has attendance today (they used the return shortcut), the row shows "Here" and no button.
- Empty state: "Nobody has used the welcome form yet today."
- A visitor who scanned but is not at church today still becomes a person and a follow-up lead. Staff may check them in later or leave them unchecked.
- Keep the "New visitor" dialog from docs/07 Part C for people with no phone to scan with. It writes the same person and the same source tag `walk_in`.
- Show a small counter on the Home page (Admin) "New from welcome form this week".

Follow-up: a person created from the form with no volunteer appears in Attention under "No volunteer yet" (docs/05 rules), with the chips above. The message template "Welcome" ("Hello {name}, thank you for visiting Omega Ministries. We are glad you came. How can we pray with you this week?") is the default for these people.

---

## Part 4 · Families and baby dedication (plan now, build later)

Not built in this task. The welcome form only records family answers (1.2). Reasons to wait: children's information is sensitive and must be added by staff, with consent, not through a public page.

When built (a separate spec): `households` (name, head person, address note) and `household_members` (person or child record, relation), child records with first name, birth month and year, parent link, consent date. **Access: Admin, Pastor and Follow-up Coordinator only.** Baby dedication is the first event type: a family registers a child, the church sees the date, parents and a reminder list. Needs (support for poor families) is a later, opt-in, pastoral-care-only field, with a clear purpose line, never shown to ordinary volunteers.
Do not create these tables now.

---

## Part 5 · Order of work
1. Migration and rollback: people columns, `class_types`, `m1_classes.class_type_id`, `person_class_interest`, welcome tables, both RPCs (separate migration files). Apply once, regenerate types.
2. Public `/welcome` page with all steps, validation, thank-you, return shortcut. No sidebar, no login, no app chrome. Works at 360 px.
3. QR helper: link plus downloadable PNG.
4. Staff views: person drawer Welcome card, source chip, People filter by source.
5. Check-in "From the welcome form" section.
6. Class types: dropdown, sidebar group, per-type config, Needs tab queries, tiles.
7. Class sign-up dialog with three required fields up front.
8. Seed test data (labelled, deletable). README update. Lint, build, report.

## Part 6 · Security checklist (put results in the PR)
- Anon can call exactly `submit_welcome`, `welcome_returning` and the existing reply RPCs. List all anon grants.
- No table has an anon policy. RLS is on for every new table.
- Server-side validation exists for every field; the form's checks are only for convenience.
- Rate limit and honeypot tested: submit six times quickly and show the sixth is refused.
- A phone that already exists never returns data and never overwrites a field.
- Welcome page renders all text as text (no `dangerouslySetInnerHTML`). Feedback is displayed as plain text.
- The page sets `noindex` and does not log phone numbers to the console.
- Pastor can read submissions; only Admin, Info Desk and Coordinator can change them.

## Part 7 · Acceptance
- Opening `/welcome` on a phone feels welcoming, takes about two minutes, and classes are clearly optional.
- Submitting creates one person (or links an existing one), one submission, and the person appears in Check-in under "From the welcome form" and in Attention if unassigned.
- "I have been here before" with a known number records attendance and reveals nothing.
- The class dropdown switches between M1, M2 and Siloam on one layout; M2 shows "Ready for M2"; Siloam accepts anyone.
- Entering a class sign-up needs only name, phone and location.
- No UUID or raw enum is visible anywhere. No scrollbar on tabs. Forms are centered dialogs (staff side).
- `tsc -b`, `oxlint` (no new warnings) and `npm run build` pass; the PR lists what could not be verified.

## Part 8 · Out of scope
Appointments with the pastor, Offerings and tithe, M3 as a class, families and baby dedication tables, automatic sending, Kinyarwanda translation (keep all text in one strings file so it can be added; ask Kevin for the text), online payments.
