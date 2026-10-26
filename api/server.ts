// The API server (docs/09 Phase 3 "Foundations"). Everything routeside hangs
// off buildServer; index.ts only starts/stops the process.
//
// Security posture in one place:
// - strict CSP + helmet headers, no external origins anywhere
// - no CORS plugin: same origin only (the proxy in dev, the machine in prod)
// - origin + CSRF-token check on every state-changing request
// - sessions resolved only from the hashed-lookup table, both timeouts
// - rate limiting per route; login strict with account lockout on top
// - 100 KB default body limit + a JSON depth cap
// - Cache-Control: no-store for authenticated responses
// - logs carry no headers with tokens, no URLs with query strings, no bodies
// - a route without { access, action } refuses to boot
import "./fastify-augment.d.js";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyError, type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { audit } from "./audit.js";
import { createPrisma, type ApiPrisma } from "./db.js";
import { type Env, loadEnv } from "./env.js";
import { addStandardRoutes } from "./routes/index.js";
import { CSRF_COOKIE, SESSION_COOKIE, csrfMatches, resolveSession } from "./auth/session.js";
import { can, roleName, ACTIONS } from "./policy.js";

const MAX_JSON_DEPTH = 12;

export interface BuildOptions {
  env?: Env;
  prisma?: ApiPrisma;
  logger?: boolean;
}

function jsonDepth(value: unknown, depth = 0): number {
  if (depth > MAX_JSON_DEPTH) return depth;
  if (Array.isArray(value)) {
    if (value.length === 0) return depth;
    let max = depth;
    for (const item of value) max = Math.max(max, jsonDepth(item, depth + 1));
    return max;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.values(value as Record<string, unknown>);
    if (entries.length === 0) return depth;
    let max = depth;
    for (const item of entries) max = Math.max(max, jsonDepth(item, depth + 1));
    return max;
  }
  return depth;
}

function originAllowed(origin: string, env: Env): boolean {
  try {
    const url = new URL(origin);
    const clean = `${url.protocol}//${url.host}`;
    if (clean === env.APP_ORIGIN) return true;
    const devLocal = `http://localhost:${env.API_PORT}`;
    const devLoopback = `http://127.0.0.1:${env.API_PORT}`;
    if (env.CHURCH_ENV === "dev" && (clean === devLocal || clean === devLoopback)) return true;
    return false;
  } catch {
    return false;
  }
}

function requestOrigin(req: FastifyRequest): string | null {
  const origin = req.headers.origin;
  if (origin) return origin;
  const referer = req.headers.referer;
  if (referer) {
    try {
      const url = new URL(referer);
      return `${url.protocol}//${url.host}`;
    } catch {
      return null;
    }
  }
  return null;
}

function isUnsafeMethod(method: string): boolean {
  return method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
}

function deny(reply: FastifyReply, status: number, body: Record<string, string> = { error: "forbidden" }) {
  return reply.code(status).send(body);
}

function statusError(status: number, message: string): Error & { statusCode?: number } {
  const error = new Error(message) as Error & { statusCode?: number };
  error.statusCode = status;
  return error;
}

export async function buildServer(options: BuildOptions = {}): Promise<FastifyInstance> {
  const env = options.env ?? loadEnv();
  const prisma = options.prisma ?? (await createPrisma(env));

  const app = Fastify({
    bodyLimit: 100 * 1024,
    trustProxy: false,
    logger: {
      level: env.CHURCH_ENV === "production" ? "warn" : "info",
      redact: {
        paths: ["req.headers.cookie", "req.headers.authorization"],
        censor: "[redacted]",
      },
      serializers: {
        req: (req) => {
          let path = "";
          try {
            path = new URL(req.url, "http://localhost").pathname;
          } catch {
            path = "<unparsable>";
          }
          return { method: req.method, url: path, requestId: req.id };
        },
        res: (res) => ({ statusCode: res.statusCode }),
      },
    },
  });

  // JSON body parser with a depth cap (docs/09: "JSON depth limit").
  app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
    let parsed: unknown;
    try {
      parsed = body === "" ? {} : (JSON.parse(body as string) as unknown);
    } catch {
      return done(statusError(400, "body must be valid JSON"), undefined);
    }
    if (jsonDepth(parsed) > MAX_JSON_DEPTH) {
      return done(statusError(400, "body nesting too deep"), undefined);
    }
    return done(null, parsed);
  });

  await app.register(cookie, {});

  await app.register(helmet, {
    // Self-hosted app: no third-party origins are allowed anywhere (Phase 0
    // sovereignty rule). Very strict CSP; the frontend is a same-origin bundle.
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        baseUri: ["'self'"],
      },
    },
    referrerPolicy: { policy: "no-referrer" },
  });

  // Multipart for the M1 materials upload (docs/09: "upload route up to
  // 25 MB with MIME and extension allow-list"). The global JSON body limit
  // stays 100 KB; only the upload route raises it.
  await app.register(multipart, {
    limits: { fileSize: 25 * 1024 * 1024, files: 5, fields: 10 },
  });

  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
    errorResponseBuilder: (_req, context) => {
      const error = new Error(`Rate limit exceeded, retry in ${context.after}`) as Error & {
        statusCode?: number;
        headers?: Record<string, string>;
      };
      error.statusCode = 429;
      error.headers = { "Retry-After": String(context.after) };
      return error;
    },
    addHeaders: {
      "retry-after": true,
    },
  });

  // Shared context for hooks and handlers.
  app.addHook("onRequest", async (req) => {
    req.prisma = prisma;
    req.env = env;
  });

  // ---- CSRF / origin gate -------------------------------------------------
  // Runs before session resolution; every state-changing request must come
  // from an allowed origin, and signed-in requests must also carry the
  // double-submit CSRF header that matches the CSRF cookie.
  app.addHook("onRequest", async (req, reply) => {
    const access = req.routeOptions.config?.access;
    if (access === undefined) return; // startup check will fail the boot
    if (!isUnsafeMethod(req.method)) return;
    // The browser always sends Origin on unsafe methods; server-to-server
    // integrations must state an allowed origin too (there are none planned
    // beyond the app itself). A missing or foreign origin is denied here.
    const origin = requestOrigin(req);
    if (origin === null || !originAllowed(origin, env)) {
      return deny(reply, 403);
    }
    if (access === "auth") {
      const cookieToken = (req.cookies as Record<string, string | undefined>)[CSRF_COOKIE];
      const headerToken = Array.isArray(req.headers["x-csrf-token"])
        ? req.headers["x-csrf-token"][0]
        : req.headers["x-csrf-token"];
      if (!csrfMatches(cookieToken, headerToken)) {
        return deny(reply, 403);
      }
    }
  });

  // ---- Session resolution + authorization ---------------------------------
  app.addHook("preHandler", async (req, reply) => {
    const config = req.routeOptions.config;
    const access = config?.access;
    if (access !== "auth") return;
    const token = (req.cookies as Record<string, string | undefined>)[SESSION_COOKIE];
    if (!token) {
      return deny(reply, 401, { error: "unauthorized" });
    }
    const idleMs = env.SESSION_IDLE_HOURS * 3_600_000;
    const session = await resolveSession(prisma, token, idleMs);
    if (!session) {
      return deny(reply, 401, { error: "unauthorized" });
    }
    req.user = session.user;
    req.sessionToken = session.token;
    // Enforce the action matrix here (docs/09 "Authorization": route without a
    // policy declaration fails startup; routes WITH policies are enforced here).
    const action = config?.action;
    const role = roleName(session.user.role as string);
    if (action && (role === "" || !can(role, action))) {
      await audit(prisma, {
        userId: session.user.id,
        action: "auth.denied",
        entity: "route",
        entityId: null,
        message: `action denied: ${action}`,
      });
      return deny(reply, 403);
    }
    req.roleName = role;
  });

  // ---- Cache headers ------------------------------------------------------
  app.addHook("onSend", async (req, reply, payload) => {
    if (req.routeOptions.config?.access === "auth") {
      reply.header("Cache-Control", "no-store");
    }
    return payload;
  });

  // ---- Errors -------------------------------------------------------------
  app.setErrorHandler((error: FastifyError, req, reply) => {
    const status = typeof error.statusCode === "number" && error.statusCode >= 400 && error.statusCode < 600
      ? error.statusCode
      : 500;
    if (status >= 500) {
      req.log.error({ err: { name: error.name, message: error.message, code: error.code } }, "unhandled error");
      return reply.code(500).send({ error: "internal error" });
    }
    if (status === 400 || status === 413) {
      return reply.code(status).send({ error: status === 413 ? "body too large" : "invalid request" });
    }
    if (status === 401) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    if (status === 429) {
      const headers = (error as FastifyError & { headers?: Record<string, string> }).headers;
      const retryAfter = headers?.["Retry-After"] ?? "60";
      return reply.code(429).header("Retry-After", retryAfter).send({ error: "too many requests" });
    }
    if (status === 403) {
      void audit(prisma, {
        userId: req.user?.id ?? null,
        action: "auth.denied",
        entity: "route",
        entityId: null,
        message: "permission denied",
      });
      return reply.code(403).send({ error: "forbidden" });
    }
    return reply.code(status).send({ error: "request failed" });
  });

  // ---- Startup policy coverage check ----------------------------------------
  // Every route must declare { access, action } (public routes skip action).
  const declaredRoutes: Array<{ url: string; method: string; access?: string; action?: string }> = [];
  app.addHook("onRoute", (routeOptions) => {
    const config = routeOptions.config ?? {};
    const methods = Array.isArray(routeOptions.method) ? routeOptions.method : [routeOptions.method];
    for (const method of methods) {
      if (method === "HEAD" && methods.includes("GET")) continue;
      declaredRoutes.push({
        url: routeOptions.url,
        method,
        access: config.access as string | undefined,
        action: config.action as string | undefined,
      });
    }
  });

  // Registered feature routes land here; each declares its own policy.
  await addStandardRoutes(app);

  // Startup check: no route may exist without an explicit access+action.
  await app.ready();
  const violations = declaredRoutes.filter((route) => {
    if (!route.access) return true;
    if (route.access === "auth" && !route.action) return true;
    if (route.action && !(ACTIONS as readonly string[]).includes(route.action)) return true;
    return false;
  });
  if (violations.length > 0) {
    const summary = violations
      .map((v) => `${v.method} ${v.url} (access=${v.access ?? "missing"}, action=${v.action ?? "missing"})`)
      .join("; ");
    await app.close();
    await prisma.$disconnect();
    throw new Error(`Routes without complete policy declarations: ${summary}`);
  }

  return app;
}
