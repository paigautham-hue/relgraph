import { getDb } from "../db";
import { auditLog } from "../db/schema";
import type { AuditActionType, AuditEntityType } from "@shared/enums";

export async function logAudit(params: {
  userId: string | null;
  actionType: AuditActionType;
  entityType: AuditEntityType;
  entityId?: string | null;
  fieldName?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  inputMethod?: string | null;
  rawInputText?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  try {
    const db = getDb();
    await db.insert(auditLog).values({
      userId: params.userId,
      actionType: params.actionType as any,
      entityType: params.entityType as any,
      entityId: params.entityId ?? null,
      fieldName: params.fieldName ?? null,
      oldValue: params.oldValue ?? null,
      newValue: params.newValue ?? null,
      inputMethod: params.inputMethod as any ?? null,
      rawInputText: params.rawInputText ?? null,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
      metadata: params.metadata ?? null,
    });
  } catch (error) {
    console.error("[Audit] Failed to log audit entry:", error);
    // Fire-and-forget: don't throw
  }
}

export function getClientIp(req: { headers: Record<string, string | string[] | undefined>; ip?: string }): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  if (Array.isArray(forwarded) && forwarded.length > 0) return forwarded[0].split(",")[0].trim();
  return req.ip ?? null;
}
