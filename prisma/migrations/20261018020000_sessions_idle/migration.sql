-- Sessions last_seen_at: idle-timeout support for the API (docs/09 Phase 3,
-- "idle timeout ... and absolute timeout"). Absolute timeout already exists
-- as sessions.expires_at; this column tracks the last authenticated use.
-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
