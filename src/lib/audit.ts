import { db } from "@/db";
import { auditLogs } from "@/db/schema";

/** Append an entry to the audit log (SPEC §10 monitoring). */
export async function audit(entry: {
  actorId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      actorId: entry.actorId ?? null,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
      ip: entry.ip ?? null,
    });
  } catch (err) {
    // Never let audit failure break the primary action.
    console.error("audit log failed:", err);
  }
}
