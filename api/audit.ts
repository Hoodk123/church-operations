// Audit logging (docs/09 Phase 3). Rules:
// - who/what/entity/entity_id/time
// - the message NEVER carries personal values (no names, phones, notes,
//   message text, subjects of sensitive reads). Callers pass a reason that
//   says what happened, never who it happened to.
import type { ApiPrisma } from "./db.js";

export interface AuditEntry {
  userId?: string | null;
  action: string; // e.g. "auth.login", "auth.login_failed", "auth.denied"
  entity: string; // e.g. "users", "people"
  entityId?: string | null;
  message: string; // generic wording only, callers enforce this
}

export async function audit(prisma: ApiPrisma, entry: AuditEntry): Promise<void> {
  await prisma.auditLog
    .create({
      data: {
        userId: entry.userId ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        message: entry.message,
      },
    })
    .catch(() => {
      // An audit failure must not break the request; ops will see gaps in
      // dashboards. Never log the entry itself (could hold entity ids of
      // private records)... but ids are audit-only references, safe to keep
      // out of logs entirely per the no-personal-data rule.
    });
}
