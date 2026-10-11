<p align="center">
  <img src="https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=white" alt="React"/>
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite"/>
  <img src="https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind CSS"/>
  <img src="https://img.shields.io/badge/Supabase-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase"/>
  <img src="https://img.shields.io/badge/shadcn/ui-000000?style=for-the-badge&logo=shadcnui&logoColor=white" alt="shadcn/ui"/>
  <img src="https://img.shields.io/badge/React_Router-CA4245?style=for-the-badge&logo=reactrouter&logoColor=white" alt="React Router"/>
</p>

<h1 align="center">Church Operations — Internal Tool</h1>

<p align="center">
  Internal management tool for church <strong>Info Desk</strong> and <strong>Follow-up</strong> teams.
  Tracks people (visitors, new converts, members), manages follow-up workflows, and gives
  the team a single source of truth for contact information and engagement status.
</p>

---

## About

This is an internal-use application built for a church's Info Desk and Follow-up Coordinator teams. It solves a real operational problem: keeping track of visitors, new converts, M1 class attendees, and members — who they are, who's following up with them, and where they are in their church journey.

The tool allows the team to:
- **Register new people** as they visit or connect with the church
- **Track follow-up status** (Not Started → Contacted → Met → Ongoing → Completed)
- **Assign people** to specific team members for personalized outreach
- **Monitor baptism status** for new converts and M1 class participants
- **Search and filter** the entire people database with real-time column visibility controls

All data is stored in **Supabase** (PostgreSQL) with **Row Level Security (RLS)** ensuring only authenticated team members can access and modify records.

## Tech stack

| Layer | Tool | Why we picked it |
| :--- | :--- | :--- |
| Framework | **React 19** | Component-based UI with hooks for state management and side effects. |
| Language | **TypeScript** | End-to-end type safety for data models, props, and Supabase queries. |
| Build tool | **Vite 8** | Fast dev server and optimized production builds with Rolldown. |
| Styling | **Tailwind CSS 4** (`@tailwindcss/vite`) | Utility-first CSS with CSS variables for theming and dark mode support. |
| UI components | **shadcn/ui** (`base-nova` style + `@base-ui/react`) | Copy-paste, owned component code — no black-box dependency to upgrade. |
| Data table | **TanStack Table v8** (`@tanstack/react-table`) | Headless table library for sorting, filtering, column visibility, and global search. |
| Database | **Supabase** (PostgreSQL + Auth + RLS) | Managed PostgreSQL with built-in authentication, real-time, and row-level security. |
| Auth | **Supabase Auth** (`@supabase/ssr`) | Email/password authentication with SSR-ready session handling. |
| Routing | **React Router v7** | Client-side routing with protected routes and redirect logic. |
| Icons | **Lucide React** | Clean, consistent icon set for UI controls and status indicators. |
| Linting | **OxLint** | Fast Rust-based linter for catching common React and TypeScript issues. |

## Project structure

```text
/
├── docs/
│   ├── 01-layout-and-navbar.md        # Layout & Navbar task spec
│   └── 02-people-table.md             # People Data Table task spec
├── public/
│   ├── favicon.svg
│   └── icons.svg
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Navbar.tsx             # Top bar: avatar, role badge, activity toggle, logout
│   │   │   ├── Sidebar.tsx            # Collapsible sidebar with nav items
│   │   │   ├── PageHeader.tsx         # Bible verse header
│   │   │   └── RecentActivityDrawer.tsx
│   │   ├── people/
│   │   │   ├── columns.tsx            # TanStack Table column definitions (6 default + 7 optional)
│   │   │   ├── constants.ts           # Category & status color maps, enum arrays
│   │   │   ├── PeopleTable.tsx        # Main data table with search, sort, filter, visibility
│   │   │   ├── PeopleTableToolbar.tsx # Toolbar: Sort, Filter, Group by, Search, Columns, Add
│   │   │   ├── PersonDetailDrawer.tsx # Right-side sheet with 3-card detail + inline editing
│   │   │   └── AddPersonForm.tsx      # Sheet form to register a new person
│   │   ├── ui/                        # shadcn primitives (avatar, badge, button, card, etc.)
│   │   ├── Dashboard.tsx              # Main layout shell (Navbar + Sidebar + PeopleTable)
│   │   └── LoginForm.tsx              # Supabase email/password login form
│   ├── lib/
│   │   ├── supabase/client.ts         # Supabase browser client (createBrowserClient)
│   │   ├── time-ago.ts                # Relative time formatter ("3 hours ago")
│   │   └── utils.ts                   # cn() utility (clsx + tailwind-merge)
│   ├── App.tsx                        # Router: /login, /dashboard (protected), * redirect
│   ├── main.tsx                       # Entry with TooltipProvider
│   └── index.css                      # Tailwind theme tokens, CSS variables
├── .env                               # VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY
├── components.json                    # shadcn config (style: base-nova)
├── tsconfig.json                      # Path aliases (@/* → src/*)
└── package.json
```

## Features

### People Data Table
- **6 default columns**: Name, Category, Follow-up Status, Assigned To, Location, Registered
- **7 optional columns**: Gender, M1 Status, Phone, Age Group, HBF Group, Baptism Status, How Found Church
- **Toolbar controls**: Global search, Sort, Filter, Group by, Column visibility toggle, Add person
- **Row click** opens a detail drawer with inline editing

### Person Detail Drawer
- **Identity card**: Name, gender, age group, phone, location
- **Church Journey card**: Category (editable), M1 status, HBF group, baptism status (conditional)
- **Follow-up card**: Follow-up status (editable), assigned to, last contact date, notes
- Inline editing via Select dropdowns — changes save immediately to Supabase

### Authentication
- Email/password login via Supabase Auth
- Protected routes with `onAuthStateChange` listener
- Role-based team member records (Admin, Info Desk, Follow-up Coordinator, Pastor)

### Layout
- Collapsible sidebar (w-56 ↔ w-14) with nav items
- Navbar with avatar (initials + role badge), last updated text, activity drawer toggle, logout
- Responsive design — table collapses to 3 essential columns on narrow viewports

### M1 Class & Baptism (Task 06)
- **M1 Class** (`/m1`): class selector, four stat tiles, and tabs for Enrolled,
  Needs M1, Missed, Materials, and Certificates (Info Desk sees only Enrolled and
  Needs M1). Per-day attendance with present/absent marking, day closing, and
  progress bars; a person sheet with contact actions, attendance strip, and a
  message template picker.
- **Add to class**: enrol from the waiting list or register a walk-in (with
  duplicate-phone guard and optional "present today").
- **Send reminders** and **catch-up** messages log to `m1_message_log`; missed-day
  replies use a private `/reply/:token` link (no login) backed by
  `get_reply_context` / `submit_absence_reply`.
- **Materials**: upload to the `m1-materials` storage bucket and share signed links.
- **Certificates**: issue numbers to eligible people and print them at
  `/m1/certificates/print`.
- **Baptism** (`/baptism`): upcoming services, candidate list from
  `baptism_candidates()`, registration, and reminders.
- **People**: new email, address details, preferred-contact, and "needs M1 /
  needs baptism" fields, plus filters and an enrolled-class badge.
- **Home**: "Waiting for M1" and "Need baptism" tiles for admins.

Role gating follows `is_class_staff()` / `is_class_leader()` in the database;
sidebar items a role cannot use are hidden, not disabled.

## Database schema

### `team_members`
| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | uuid (PK) | Auto-generated |
| `full_name` | text | Team member's full name |
| `role` | text | Admin, Info Desk, Follow-up Coordinator, Pastor |
| `auth_user_id` | uuid (FK → auth.users) | Links to Supabase auth |

### `people`
| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | uuid (PK) | Auto-generated |
| `first_name`, `last_name` | text | Required |
| `gender` | text | Male / Female |
| `age_group` | text | Child / Youth / Adult / Elderly |
| `phone` | text | Contact number |
| `location` | text | Optional |
| `category` | text | Visitor / New Convert / M1 Class / Member / Returning / Counseling |
| `follow_up_status` | text | Not Started / Contacted / Met / Ongoing / Completed |
| `assigned_to` | uuid (FK → team_members) | Follow-up assignee |
| `baptism_status` | text | Not yet / Scheduled / Baptized |
| `m1_status` | text | Not Started / In Progress / Completed |
| `hbf_group` | text | Home Bible Fellowship group |
| `date_registered` | date | Defaults to today |
| `last_contact_date` | date | Last follow-up touchpoint |
| `notes` | text | Free-form notes |
| `registered_by` | uuid (FK → team_members) | Who registered this person |

Both tables have **RLS enabled**. A `get_my_role()` SECURITY DEFINER function returns the current user's role from `team_members`.

## Commands

All commands run from the project root:

| Command | Action |
| :--- | :--- |
| `npm install` | Install dependencies |
| `npm run dev` | Start the dev server at `localhost:5173` |
| `npm run build` | Type-check + build the production bundle to `./dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run OxLint |

## Environment variables

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-or-publishable-key
```

> These are prefixed with `VITE_` so they're exposed to the client bundle — this is expected for Supabase's anon/public key which is designed to be client-accessible behind RLS.

## License

Licensed under [PolyForm Noncommercial 1.0.0](./LICENSE).
Copyright Church Operations / Kevin Shyaka. Free for personal, educational,
and noncommercial use. Commercial use requires a separate license —
contact kevinshyaka27@gmail.com to discuss.
