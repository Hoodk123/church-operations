// Phase 3, foundation: validated environment. The API refuses to start when
// anything is missing or weak (docs/09 "Config": validated env at startup).
// Personal-data rule: values here are never logged.
import { createHash } from "node:crypto";
import "dotenv/config";
import { z } from "zod";

const DEV_FILE_SECRET = createHash("sha256").update("dev secret").digest("base64url");

const envSchema = z
  .object({
    CHURCH_ENV: z.enum(["dev", "production"]).default("dev"),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3100),
    // Runtime database role. church_app is a limited account (Phase 1/2 rules):
    // not superuser, connection-capped, and the API must never connect as
    // church_owner or a superuser.
    CHURCH_APP_PASSWORD: z.string().min(8),
    POSTGRES_DB: z.string().default("church"),
    PG_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
    DB_HOST: z.string().default("127.0.0.1"),
    // Where browser traffic comes from; used for the CSRF origin check.
    // In production this is the LAN HTTPS origin of the machine itself.
    APP_ORIGIN: z.string().url().default("http://localhost:5173"),
    SESSION_IDLE_HOURS: z.coerce.number().int().min(1).max(48).default(8),
    SESSION_ABSOLUTE_HOURS: z.coerce.number().int().min(1).max(72).default(24),
    UPLOAD_DIR: z.string().default("./data/uploads"),
    // Dev gets a fixed default; production must supply its own (checked in loadEnv).
    FILE_SIGNING_SECRET: z.string().min(24).default(DEV_FILE_SECRET),
  })
  .refine((v) => v.SESSION_IDLE_HOURS < v.SESSION_ABSOLUTE_HOURS, {
    message: "SESSION_IDLE_HOURS must be smaller than SESSION_ABSOLUTE_HOURS",
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // Print field names only; never the values (secrets could end up in logs).
    const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`API environment invalid. Fix these variables: ${fields}`);
  }
  const env = parsed.data;
  if (env.CHURCH_ENV === "production" && env.CHURCH_APP_PASSWORD.length < 24) {
    throw new Error("CHURCH_APP_PASSWORD looks too weak for production (min 24 chars).");
  }
  if (env.CHURCH_ENV === "production" && env.FILE_SIGNING_SECRET === DEV_FILE_SECRET) {
    throw new Error("FILE_SIGNING_SECRET must be set to a unique random value in production.");
  }
  return env;
}

export function databaseUrl(env: Env): string {
  return `postgresql://church_app:${encodeURIComponent(
    env.CHURCH_APP_PASSWORD,
  )}@${env.DB_HOST}:${env.PG_PORT}/${env.POSTGRES_DB}?connection_limit=10`;
}
