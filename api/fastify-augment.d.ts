// Fastify type augmentations for the API (Phase 3).
import type { ApiPrisma } from "./db.js";
import type { Env } from "./env.js";
import type { SessionUser } from "./auth/session.js";
import type { Action } from "./policy.js";

declare module "fastify" {
  interface FastifyRequest {
    prisma: ApiPrisma;
    env: Env;
    user?: SessionUser;
    sessionToken?: string;
  }
  interface FastifyContextConfig {
    // Every route MUST declare one of these (startup check in server.ts).
    access?: "public" | "auth";
    action?: Action;
    // @fastify/rate-limit per-route overrides.
    rateLimit?: {
      max?: number;
      timeWindow?: string | number;
    };
  }
}

export {};
