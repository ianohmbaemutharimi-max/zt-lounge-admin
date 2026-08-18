import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Records a login attempt for audit purposes.
 * Never logs passwords, tokens, or session identifiers.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { success, email, failure_reason } = body;

    if (typeof success !== "boolean") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const supabase = await getSupabaseServer();
    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

    // Create a normalized identifier from email to avoid storing raw PII
    // This allows correlation of login attempts without storing the actual email
    const normalizedId = email
      ? require("crypto").createHash("sha256").update(email.toLowerCase().trim()).digest("hex").substring(0, 16)
      : null;

    await supabase.from("activity_logs").insert({
      action: success ? "LOGIN_SUCCESS" : "LOGIN_FAILURE",
      table_name: "auth",
      new_data: {
        normalized_email_hash: normalizedId,
        ip_address: ipAddress,
        user_agent: userAgent,
        failure_reason: success ? null : (failure_reason || "unknown"),
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    // Login audit logging must never break the login flow
    return NextResponse.json({ ok: true });
  }
}