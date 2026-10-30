// The one place that talks to our API (docs/09 Phase 4). Components never
// call fetch directly. Same-origin only: cookies flow automatically and the
// CSRF token in the `ch_csrf` cookie is echoed on every state-changing call.
// [local-first]
export class ApiError extends Error {
  status: number;
  body: unknown;
  retryAfter?: number;

  constructor(status: number, body: unknown, retryAfter?: number) {
    super(
      typeof body === "object" && body !== null && "error" in body && typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : `HTTP ${status}`
    );
    this.name = "ApiError";
    this.status = status;
    this.body = body;
    this.retryAfter = retryAfter;
  }
}

const CSRF_COOKIE = "ch_csrf";

export function readCookie(name: string): string | null {
  const match = document.cookie.split("; ").find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export interface ApiOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** JSON body; omitted means no body (and no content-type header). */
  json?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}

/** Typed, same-origin API call; parses and returns the response body. */
export async function api<T>(path: string, { method = "GET", json, query, signal }: ApiOptions = {}): Promise<T> {
  const url = new URL(path, window.location.origin);
  url.search = query
    ? new URLSearchParams(
        Object.entries(query)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)])
      ).toString()
    : url.search;

  const headers: Record<string, string> = {};
  if (json !== undefined) headers["content-type"] = "application/json";
  if (method !== "GET") {
    const csrf = readCookie(CSRF_COOKIE);
    if (csrf) headers["x-csrf-token"] = csrf;
  }

  const res = await fetch(url, {
    method,
    headers,
    credentials: "same-origin",
    body: json === undefined ? undefined : JSON.stringify(json),
    signal,
  });

  let body: unknown = undefined;
  const isJson = res.headers.get("content-type")?.includes("application/json");
  if (isJson) {
    try {
      body = await res.json();
    } catch {
      body = undefined;
    }
  } else {
    body = await res.text().catch(() => undefined);
  }

  if (!res.ok) {
    const retryHeader = res.headers.get("retry-after");
    const retryAfter = retryHeader === null ? undefined : Number.isFinite(Number(retryHeader)) ? Number(retryHeader) : undefined;
    throw new ApiError(res.status, body, retryAfter);
  }
  return body as T;
}

/** True when the error means "session is gone"; page handles by going to login. */
export function isUnauthorized(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 401;
}
