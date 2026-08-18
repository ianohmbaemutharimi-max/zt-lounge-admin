/**
 * Team Invitations API
 * POST /api/admin/team-invitations - Create invitation
 * GET /api/admin/team-invitations - List invitations
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server";
import {
  createInvitation,
  getRoleName,
  canInviteRole,
  pendingInvitationExists,
  emailExists,
  logInvitationCreated,
  getInvitations,
  normalizeEmail,
} from "@/lib/team/invitations";
import { getSupabaseServer } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const authResult = await getServerSession(req);
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { session } = authResult;
    const { email, roleId } = await req.json();

    if (!email || !roleId) {
      return NextResponse.json(
        { error: "Email and role are required" },
        { status: 400 }
      );
    }

    const normalizedEmail = normalizeEmail(email);

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    // Check permission: can this user invite this role?
    const targetRoleName = await getRoleName(session.supabase, roleId);
    if (!targetRoleName || !canInviteRole(session.user.role, targetRoleName)) {
      return NextResponse.json(
        { error: "You cannot invite users with this role" },
        { status: 403 }
      );
    }

    // Check if email already exists in system
    const alreadyExists = await emailExists(session.supabase, normalizedEmail);
    if (alreadyExists) {
      return NextResponse.json(
        { error: "This email is already registered or has accepted an invitation" },
        { status: 409 }
      );
    }

    // Check if pending invitation already exists
    const pendingExists = await pendingInvitationExists(
      session.supabase,
      normalizedEmail,
      roleId
    );

    if (pendingExists) {
      return NextResponse.json(
        { error: "A pending invitation already exists for this email and role" },
        { status: 409 }
      );
    }

    // Create invitation
    const result = await createInvitation(
      session.supabase,
      normalizedEmail,
      roleId,
      session.profile.id
    );

    // Log action
    await logInvitationCreated(
      session.supabase,
      result.id,
      normalizedEmail,
      roleId,
      session.profile.id,
      req.headers.get("x-forwarded-for") || undefined
    );

    // Queue notification/email
    await session.supabase.from("notification_queue").insert({
      notification_type: "team_invitation",
      recipient: normalizedEmail,
      subject: "You've been invited to join ZT Lounge",
      message: `You have been invited to join the ZT Lounge team as a team member. Click the link in your email to accept.`,
      scheduled_at: new Date().toISOString(),
      status: "pending",
    });

    return NextResponse.json(
      {
        id: result.id,
        email: normalizedEmail,
        roleId,
        expiresAt: result.expiresAt,
        message: "Invitation created successfully",
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("[Team Invitations] POST error:", error);
    return NextResponse.json(
      { error: "Failed to create invitation" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const authResult = await getServerSession(req);
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { session } = authResult;

    // Only admin and super_admin can list invitations
    if (!["admin", "super_admin"].includes(session.user.role)) {
      return NextResponse.json(
        { error: "You don't have permission to view invitations" },
        { status: 403 }
      );
    }

    const url = new URL(req.url);
    const statusFilter = url.searchParams.get("status");
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);

    const invitations = await getInvitations(session.supabase, {
      status: statusFilter || undefined,
      limit,
      offset,
    });

    return NextResponse.json({ data: invitations }, { status: 200 });
  } catch (error: any) {
    console.error("[Team Invitations] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch invitations" },
      { status: 500 }
    );
  }
}
