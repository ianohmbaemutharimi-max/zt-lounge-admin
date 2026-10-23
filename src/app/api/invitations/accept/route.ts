/**
 * Invitation Acceptance Endpoint
 * POST /api/invitations/accept
 *
 * FINAL TWO-ROLE MODEL:
 *   - The role granted is read from the invitation record ONLY (server-derived).
 *     The client never supplies a role.
 *   - A Supabase Auth account is created via the service-role Admin API, then
 *     the acceptance is committed through the SECURITY DEFINER RPC
 *     accept_team_invitation() which validates token/email/expiry/use and
 *     creates the team profile atomically.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { normalizeEmail } from "@/lib/team/invitations";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { token, email, password, fullName } = await req.json();

    if (!token || !email || !password) {
      return NextResponse.json(
        { error: "Token, email and password are required" },
        { status: 400 }
      );
    }
    if (String(password).length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const normalizedEmail = normalizeEmail(email);
    const admin = await getSupabaseAdmin();
    const tokenHash = (await import("crypto"))
      .createHash("sha256")
      .update(token)
      .digest("hex");

    // 1) Validate the invitation BEFORE creating any auth account.
    const { data: invitation } = await admin
      .from("invitations")
      .select("id, email, status, expires_at, role_id, accepted_at, profile_id, roles:role_id(name)")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (!invitation) {
      return NextResponse.json({ error: "Invalid invitation" }, { status: 400 });
    }
    if (invitation.status !== "pending" || invitation.accepted_at || invitation.profile_id) {
      return NextResponse.json({ error: "Invitation already used or no longer pending" }, { status: 400 });
    }
    if (new Date(invitation.expires_at) < new Date()) {
      return NextResponse.json({ error: "Invitation has expired" }, { status: 400 });
    }
    if (invitation.email.toLowerCase() !== normalizedEmail) {
      return NextResponse.json(
        { error: "This email does not match the invitation" },
        { status: 400 }
      );
    }
    const rolesRaw = (invitation as any).roles;
    const inviteRole = Array.isArray(rolesRaw) ? rolesRaw[0]?.name : rolesRaw?.name;
    // Final staff model: an invitation may only ever grant `admin`.
    // `super_admin` is rejected here so no invitation path can mint a peer
    // super_admin. The RPC re-checks this independently.
    if (inviteRole !== "admin") {
      return NextResponse.json(
        { error: "This invitation is for a retired role and can no longer be accepted" },
        { status: 400 }
      );
    }

    // 2) Create the Supabase Auth account (or reuse on idempotent retry).
    let userId: string | null = null;
    // Only an account this request actually created may be compensated below.
    let createdHere = false;
    const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
      email: normalizedEmail,
      password: String(password),
      email_confirm: true,
      user_metadata: { full_name: fullName || normalizedEmail },
    });

    if (createError) {
      const msg = (createError as any).message ?? "";
      if (/already registered|User already registered/i.test(msg)) {
        const { data: users } = await admin.auth.admin.listUsers();
        userId = users?.users.find((u: any) => u.email?.toLowerCase() === normalizedEmail)?.id ?? null;
        if (!userId) {
          return NextResponse.json({ error: "Account exists but could not be resolved" }, { status: 409 });
        }
      } else {
        return NextResponse.json({ error: "Failed to create account: " + msg }, { status: 400 });
      }
    } else {
      userId = createdUser?.user?.id ?? null;
      createdHere = true;
    }

    if (!userId) {
      return NextResponse.json({ error: "Failed to create account" }, { status: 500 });
    }

    // 3) Commit acceptance + team profile via the SECURITY DEFINER RPC
    //    (role from the invitation, never from the client).
    const { data: result, error: rpcError } = await admin.rpc("accept_team_invitation", {
      p_token_hash: tokenHash,
      p_auth_user_id: userId,
      p_email: normalizedEmail,
      p_full_name: fullName || normalizedEmail,
    });

    if (rpcError) {
      // Compensation: Auth account creation cannot join the Postgres
      // transaction, so a failed RPC would otherwise leave an Auth identity
      // with no profile — a permanently unusable orphaned login. Remove ONLY
      // the account this request just created (createdHere === true), never a
      // pre-existing identity, so retries and existing users are unaffected.
      if (createdHere) {
        try {
          const { error: cleanupError } = await admin.auth.admin.deleteUser(userId);
          if (cleanupError) {
            console.error(
              "[Invitations Accept] failed to compensate orphaned auth user:",
              userId,
              cleanupError.message
            );
          }
        } catch (cleanupError) {
          console.error(
            "[Invitations Accept] compensation threw for auth user:",
            userId,
            cleanupError
          );
        }
      }
      return NextResponse.json({ error: (rpcError as any).message ?? "Failed to accept invitation" }, { status: 400 });
    }

    return NextResponse.json(
      { message: "Invitation accepted", role: result?.role ?? inviteRole, profileId: userId },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[Invitations Accept] error:", error);
    return NextResponse.json({ error: "Failed to accept invitation" }, { status: 500 });
  }
}
