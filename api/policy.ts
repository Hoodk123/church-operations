// Phase 3, foundation: the single authorization module (docs/09 "Authorization").
// One matrix, role by action; every route declares one of these actions and the
// server refuses to start if a route is missing its declaration. Default deny.
// Row-scope rules (volunteer sees only their people etc.) live in the route
// services, referencing these constants.
import type { SessionUser } from "./auth/session.js";

export type Role = "Admin" | "Info Desk" | "Follow-up Coordinator" | "Pastor";

export const ACTIONS = [
  "checkin:read",
  "checkin:create",
  "checkin:undo",
  "attendance:read",
  "attendance:tick",
  "people:read",
  "people:read-notes",
  "people:create",
  "people:edit",
  "people:assign",
  "counseling:read",
  "counseling:write",
  "followup:read",
  "followup:log",
  "board:move",
  "m1:read",
  "m1:tick",
  "m1:enroll",
  "m1:delete",
  "m1:certificates",
  "m1:materials-manage",
  "baptism:read",
  "baptism:write",
  "baptism:delete",
  "metrics:read",
  "metrics:volunteers",
  "templates:read",
  "templates:write",
  "admin:users",
  "admin:settings",
  "admin:audit",
  "admin:health",
  "import:run",
  "export-person",
  "erase-person",
  // Every signed-in role may read its own identity and log out.
  "account:me",
  // Every signed-in role may change its own password.
  "account:password",
] as const;

export type Action = (typeof ACTIONS)[number];

// Starting matrix, straight from docs/09 Phase 8. Adjust with Kevin in Phase 8.
// Info Desk has people:read but not people:read-notes (no notes visible).
const MATRIX: Record<Role, readonly Action[]> = {
  Admin: ACTIONS,
  "Info Desk": [
    "account:me",
    "checkin:read",
    "checkin:create",
    "checkin:undo",
    "attendance:read",
    "attendance:tick",
    "people:read",
    "people:create",
    "people:edit",
    "m1:read",
    "m1:tick",
    "m1:enroll",
    "baptism:read",
    "metrics:read",
    "templates:read",
    "account:password",
  ],
  "Follow-up Coordinator": [
    "account:me",
    "people:read",
    "people:read-notes",
    "people:assign",
    "followup:read",
    "followup:log",
    "board:move",
    // Phase 8 matrix: the Coordinator does NOT see counseling records.
    "checkin:read",
    "attendance:read",
    "m1:read",
    "m1:tick",
    "m1:enroll",
    // Phase 8 matrix: Baptism "register, mark done" belongs to the Coordinator.
    "baptism:write",
    "baptism:read",
    "metrics:read",
    "templates:read",
    "account:password",
  ],
  Pastor: [
    "account:me",
    "people:read",
    "people:read-notes",
    "counseling:read",
    "counseling:write",
    "followup:read",
    "attendance:read",
    "m1:read",
    "baptism:read",
    "metrics:read",
    "checkin:read",
    "account:password",
  ],
};

export function can(role: Role | "", action: Action): boolean {
  const allowed: readonly string[] | undefined = role === "" ? undefined : (MATRIX[role] as readonly string[]);
  return allowed?.includes(action) ?? false;
}

/**
 * Prisma reads return the internal enum identifier ("FollowUpCoordinator");
 * the matrix is keyed by the role's DB/display value ("Follow-up Coordinator").
 * This converts for policy checks. Unknown roles default-deny via "".
 */
export function roleName(role: string): Role | "" {
  switch (role) {
    case "Admin":
      return "Admin";
    case "InfoDesk":
      return "Info Desk";
    case "FollowUpCoordinator":
      return "Follow-up Coordinator";
    case "Pastor":
      return "Pastor";
    default:
      return "";
  }
}

export function requireAction(user: SessionUser, action: Action): void {
  const role = roleName(user.role as string);
  if (role === "" || !can(role, action)) {
    const error = new Error("forbidden") as Error & { statusCode?: number };
    error.statusCode = 403;
    throw error;
  }
}
