/**
 * Centralized audit logging system.
 *
 * Provides:
 * - logAudit(): Low-level function to write an audit log entry
 * - withAuditLog(): Higher-order function that wraps API handlers
 *
 * Audit logs are written to the `activity_logs` table and include:
 * - The actor (profile_id)
 * - The action (CREATE, UPDATE, DELETE, etc.)
 * - The entity/table name
 * - The record ID
 * - Optional details (summary, old/new data)
 * - IP address and user agent (for security audit)
 *
 * Audit logging NEVER throws — failures are silently caught to ensure
 * the main operation is never broken by logging issues.
 */

import type { NextRequest } from "next/server";
import type { SessionContext } from "@/lib/auth/server";

/**
 * Audit log entry shape.
 */
export interface AuditLogEntry {
  action: string;
  tableName: string;
  recordId?: string | null;
  details?: string | null;
  oldData?: unknown;
  newData?: unknown;
}

/**
 * Write an audit log entry to the activity_logs table.
 *
 * @param supabase - The Supabase client (from session context)
 * @param entry - The audit log entry details
 * @param actorId - The profile ID of the actor
 * @param req - Optional request for IP/user-agent capture
 */
export async function logAudit(
  supabase: SessionContext["supabase"],
  entry: AuditLogEntry,
  actorId?: string,
  req?: NextRequest
): Promise<void> {
  try {
    const ipAddress = req?.headers.get("x-forwarded-for") || req?.headers.get("x-real-ip") || null;
    const userAgent = req?.headers.get("user-agent") || null;

    // NOTE: the live `activity_logs` table has NO `details` column (verified
    // against canonical project jczwilrysvnhcjzjztbi 2026-10-06: id, profile_id,
    // action, table_name, record_id, old_data, new_data, ip_address, user_agent,
    // created_at). Including `details` here made PostgREST reject the insert
    // ("column activity_logs.details does not exist") and the failure was
    // swallowed — so NO app-side audit row ever landed (pre-existing defect
    // surfaced while runtime-verifying F-1). `entry.details` remains part of
    // the call-site contract for readability but is not persisted.
    const { error } = await supabase.from("activity_logs").insert({
      profile_id: actorId ?? null,
      action: entry.action,
      table_name: entry.tableName,
      record_id: entry.recordId ?? null,
      ip_address: ipAddress,
      user_agent: userAgent,
      old_data: entry.oldData ?? null,
      new_data: entry.newData ?? null,
    });
    if (error) {
      // Audit logging must never break the main operation — but a dropped row
      // must be visible in server logs instead of failing silently.
      console.error("[audit] activity_logs insert failed:", error.message, {
        action: entry.action,
        table: entry.tableName,
        record_id: entry.recordId ?? null,
      });
    }
  } catch {
    // Audit logging must never break the main operation
  }
}

/**
 * Higher-order function that wraps an API route handler with audit logging.
 *
 * The wrapped handler receives the same arguments as the original, plus
 * the session context. After the handler completes, an audit log entry
 * is written automatically.
 *
 * @example
 * export const POST = withAuditLog(
 *   "customers",
 *   "CREATE",
 *   async (req, { params }, auth) => {
 *     const created = await repo.create("customers", body);
 *     return NextResponse.json(created, { status: 201 });
 *   }
 * );
 */
export function withAuditLog<T extends Record<string, any>>(
  tableName: string,
  action: string,
  handler: (
    req: NextRequest,
    context: T,
    auth: SessionContext
  ) => Promise<import("next/server").NextResponse>
) {
  return async (req: NextRequest, context: T): Promise<import("next/server").NextResponse> => {
    const { NextResponse } = await import("next/server");

    // Auth is handled by withAdminAuth — this wrapper assumes auth is already done.
    // We extract the session from the request.
    const { getServerSession } = await import("@/lib/auth/server");
    const authResult = await getServerSession(req);

    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const result = await handler(req, context, authResult.session);

    // Extract record ID from the response if possible
    let recordId: string | null = null;
    try {
      const body = await result.clone().json();
      if (body?.id) {
        recordId = String(body.id);
      }
    } catch {
      // Response body might not be JSON or might not have id
    }

    // Log the audit event
    await logAudit(
      authResult.session.supabase,
      {
        action,
        tableName,
        recordId,
        details: `${action} ${tableName} record`,
      },
      authResult.session.profile.id,
      req
    );

    return result;
  };
}

/**
 * Convenience function to log a CRUD operation.
 *
 * @example
 * await logCrudOperation(supabase, "customers", "CREATE", createdId, profileId, req);
 */
export async function logCrudOperation(
  supabase: SessionContext["supabase"],
  tableName: string,
  action: "CREATE" | "UPDATE" | "DELETE",
  recordId: string | null,
  actorId: string,
  req?: NextRequest,
  details?: string
): Promise<void> {
  await logAudit(
    supabase,
    {
      action,
      tableName,
      recordId,
      details: details ?? `${action} ${tableName} record ${recordId ?? ""}`.trim(),
    },
    actorId,
    req
  );
}
