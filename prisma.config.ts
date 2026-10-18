// Prisma 7 CLI config (docs/09 phase 2). The CLI does NOT read .env by
// itself, so load it here. The connection URL is built from the same .env
// keys the Docker stack already uses (gen-secrets.sh output), plus PG_PORT
// for machines where 5432 is taken:
//   postgresql://<POSTGRES_USER>:<POSTGRES_PASSWORD>@127.0.0.1:<PG_PORT>/<POSTGRES_DB>
// DATABASE_URL overrides everything when set.
// This file configures ONLY Prisma tooling (migrate, seed, studio). The
// Phase 3 API builds its own client with the church_app role.
import "dotenv/config";
import { defineConfig } from "prisma/config";

const user = process.env.POSTGRES_USER ?? "church_owner";
const password = process.env.POSTGRES_PASSWORD ?? "";
const db = process.env.POSTGRES_DB ?? "church";
const port = process.env.PG_PORT ?? "5432";

const url =
  process.env.DATABASE_URL ??
  `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@127.0.0.1:${port}/${db}`;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url,
  },
});
