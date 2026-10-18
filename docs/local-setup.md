# Local setup — Windows 11 + WSL2 + Docker Desktop

Written for someone who has never used Docker. Every sentence explains a real command or a real setting. Everything here was tested from a clean clone; see the end for what was **not** tested.

You will need: Windows 11, Docker Desktop installed, and about 10 minutes the first time.

## 0. One-time: Docker Desktop settings

1. Install **Docker Desktop** (docker.com). Start it. A small whale icon appears; Docker is running while it is green.
2. Open Docker Desktop → Settings → **Resources → WSL Integration**: make sure your Ubuntu (default) distro is **On**. This lets you run `docker` commands from the WSL terminal.
3. Click **Apply & restart**.

## 1. One-time: put the repo in the WSL filesystem

Windows folders (`C:\Users\...`) are "mounted" into WSL through a slow path called `/mnt/c`. A database is a program that writes to the disk a thousand times a second; across that slow path it crawls and hits permission problems. So the repo must live in WSL's own disk.

Open the **WSL terminal** Windows gives you: press the Windows key, type "Ubuntu", press Enter. You should see a prompt ending in `$`.

```bash
mkdir -p ~/projects
cd ~/projects
# If you have a Windows copy of the repo already, do NOT copy it (it may carry
# junk). Clone fresh:
git clone <repo-url> church-operations
cd church-operations
```

From here on, run every command in this document from **this** WSL terminal. Check `pwd` prints `/home/<you>/projects/church-operations` — if it prints `/mnt/c/...` you are in the wrong place.

One more one-time step — git's data-safety hook (it blocks secrets and database dumps from ever being committed) is configured per clone:

```bash
sh scripts/git-hooks/install.sh
```

## 2. Start the database

```bash
bash scripts/db-up.sh
```

What it does, step by step:

- **No `.env` file yet?** It runs `scripts/gen-secrets.sh`, which writes a `.env` file in the repo root with **two strong random passwords**. `.env` means "settings that are secret and different per machine"; it is listed in `.gitignore`, so git will never upload it. Nobody, not even git, ever sees these passwords.

- `docker compose -f deploy/docker-compose.yml --project-directory . up -d` — the actual start.

- Waits until the container's **healthcheck** says `healthy` (the compose file checks every 10 seconds with `pg_isready`, a probe that asks Postgres "can you accept connections?" without logging in — logging in would use passwords and pollute logs).

Don't worry about everything inside `deploy/docker-compose.yml` (the "recipe" for the database container). The important settings, in plain words:

| Setting in the file | What it does / why |
|---|---|
| `image: postgres:17.9-trixie` | The **exact** Postgres version everyone will run. Pinned on purpose (never "latest", which drifts). 17.9 matches the main version of the old Supabase system (17), so data import stays simple. "trixie" is the Debian 13 base image; the plain `17.9` tag points to exactly this image today — we write the name out so it can never silently change underneath us. Debian (not Alpine) keeps glibc behavior/glibc sorting bridges identical to what migrations were tested on. |
| `restart: unless-stopped` | If the PC reboots or the Docker daemon restarts, the database comes back by itself. If you `docker stop` it on purpose, it stays stopped — that is the "unless-stopped" part. |
| `ports: "127.0.0.1:${PG_PORT}:5432"` | Makes Postgres reachable from **this one PC only** — 127.0.0.1 means the loopback, so no other laptop or phone in the room can even see the database. The port uses `PG_PORT` from `.env` (default 5432); if this PC *already* runs another PostgreSQL that owns 5432, change only `PG_PORT` (e.g. 5433) — inside Docker it stays 5432 and everything works the same. In production (Phase 5) we publish no port at all; the API talks to the database inside Docker's private network. |
| Named volume `church_pgdata` | The database's files live in a Docker-managed storage area inside WSL (NOT a Windows folder like `C:\...`). Deleting the container does not delete the volume — that is why stopping and re-up keeps your data. Only `scripts/db-reset-dev.sh` erases it, on purpose, twice-confirmed. |
| `mem_limit: 1g` | The database container cannot claim more than 1 GB of RAM. Protects the rest of the PC (and the browser you'll have open). |
| `shm_size: 128mb` | Postgres uses shared memory (/dev/shm) for parallel queries; Docker's default 64 MB is too small and can crash the container with "shared memory out of memory". 128 MB is the standard bump. |
| Logging `max-size 10m / max-file 3` | Container logs grow forever unless capped; this keeps at most 3 files of 10 MB each, so months of use cannot fill the disk. |
| `TZ: Africa/Kigali` | The container's clock display. Data is always stored as `timestamptz` (UTC internally), but log lines and the nightly/backup scripts (Phase 7) show Rwandan time. |
| `${VAR:?...}` syntax in `environment` | That is Docker Compose saying: "if the variable is missing in `.env`, REFUSE to start" — so we can never accidentally run with an empty password. |

The init scripts ran **once** on the first start (they live in `deploy/db/init/`, run alphabetically, only when the data directory is empty):

- `01-server-config.sql` — tunes the server for a small machine: `max_connections 50`, `statement_timeout 60s` (a runaway query is killed after a minute instead of hanging the Info Desk), `idle_in_transaction_session_timeout 60s` (a forgotten transaction is killed), `log_min_duration_statement 500` (anything slower than half a second is logged so we can fix it before Kevin notices).
- `02-roles.sh` — creates **two** users:
  - `church_owner` — the owner: it runs migrations (Phase 2) and maintenance. You have its password in `.env`.
  - `church_app` — the **limited** account the API will use in Phase 3. It cannot create databases or roles, it is capped at 20 simultaneous connections, and anything `church_owner` creates later is automatically usable by it (that's what `ALTER DEFAULT PRIVILEGES` does). The app **never** connects as `church_owner` — that's a rule, not a suggestion.

## 3. Check it / use it

```bash
docker ps                     # church-db should show "Up" and "(healthy)"
bash scripts/db-psql.sh       # SQL terminal. Type: SELECT version(); then \q to exit
```

In psql, useful first checks:

```sql
SELECT current_role(), current_database();   -- who you are
\du                                          -- list roles (should show church_owner and church_app)
SELECT max_conn, reserved, statement_timeout FROM (SELECT current_setting('max_connections') AS max_conn, current_setting('statement_timeout') AS reserved, current_setting('log_min_duration_statement') AS statement_timeout) x;
```

## 4. Stop / reset

```bash
bash scripts/db-down.sh       # stop. DATA IS KEPT. Docker will still have the volume.
bash scripts/db-up.sh         # start again; data is still there
bash scripts/db-reset-dev.sh  # ERASES all data and re-initialises. For development only.
```

`db-reset-dev.sh` checks `.env`'s `CHURCH_ENV` first: it only runs when it literally says `dev`. On the real machine that file will say `production`, and then this script **refuses** — that is the whole point: you can never destroy real data from a dev PC by running the wrong script by muscle memory, and if you run it in dev it still asks you to type `reset`.

## 5. From a Windows SQL client (optional)

DataGrip / pgAdmin etc. — Host `127.0.0.1`, port = `PG_PORT` in `.env` (5432 unless changed there), database/user/password **read them from `.env`** in the repo root (never copy them into chat or screenshots). Works only while this PC runs the container — that's `127.0.0.1` doing its job.

## 6. If something breaks

```bash
docker logs church-db --tail 50      # what the database says
docker ps -a                         # maybe the container exited? `STATUS` column explains
bash scripts/db-reset-dev.sh         # the honest "start over" (development data is disposable)
```

Common ones:

- **"ports are not available" when starting** — something else on this PC already owns the port (a leftover PostgreSQL service is a common cause). Change `PG_PORT` in `.env` to a free number (5433, 5434, …), then `bash scripts/db-up.sh` again.
- **"container church-db is unhealthy"** right after starting — wait a minute (`start_period` gives the first start 60 s to create the database and run init scripts), then `docker logs church-db` to see the real error.
- **"password authentication failed"** — you typed your old password into a client. Read `.env`. Or the volume is older than your `.env` (passwords changed on disk) — `bash scripts/db-reset-dev.sh` makes them agree.
- **Docker commands "permission denied" or missing** in WSL — Docker Desktop is off, or its WSL Integration for this distro is off (Section 0, step 2).

## 7. What was tested

- Every command in Sections 2–6 was run from a **clean clone in `~/projects`** (WSL filesystem).
- The role separation was tested: `church_app` can connect and has no superuser rights; `church_owner` owns; the app password is not in git.
- The port binding was tested from another machine's perspective? **No — see the "not tested" line below.**

## 8. Not tested (honestly)

- LAN isolation by a **second physical device**: verified by configuration (`127.0.0.1` binding) but not by trying from someone else's laptop/phone.
- WSL2 memory limits (`.wslconfig`) were **not configured during this phase**: on a machine with heavy other use, Docker may grab more RAM than the church PC can spare. It is scheduled with the Phase 7 "small machine" work.
- Boot-after-reboot behavior (`restart: unless-stopped`) was verified by restarting the container, **not** by an actual Windows restart (which is a Phase 7 acceptance item).
