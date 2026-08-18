/**
 * Team Invitations Dynamic Routes
 * DELETE /api/admin/team-invitations/[id] - Revoke invitation
 * POST /api/admin/team-invitations/[id]/resend - Resend invitation
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server";
import {
  revokeInvitation,
  logInvitationRevoked,
  logInvitationResent,
  generateInvitationToken,
  hashToken,
} from "@/lib/team/invitations";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await getServerSession(req);
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { session } = authResult;
    const { id } = await params;

    // Only admin and super_admin can revoke invitations
    if (!["admin", "super_admin"].includes(session.user.role)) {
      return NextResponse.json(
        { error: "You don't have permission to revoke invitations" },
        { status: 403 }
      );
    }

    // Revoke the invitation
    await revokeInvitation(session.supabase, id);

    // Log action
    await logInvitationRevoked(
      session.supabase,
      id,
      session.profile.id,
      req.headers.get("x-forwarded-for") || undefined
    );

    return NextResponse.json(
      { message: "Invitation revoked successfully" },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[Team Invitations] DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to revoke invitation" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await getServerSession(req);
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { session } = authResult;
    const { id } = await params;

    // Only admin and super_admin can resend invitations
    if (!["admin", "super_admin"].includes(session.user.role)) {
      return NextResponse.json(
        { error: "You don't have permission to resend invitations" },
        { status: 403 }
      );
    }

    // Get the invitation
    const { data: invitation, error: getError } = await session.supabase
      .from("invitations")
      .select("id, email, status, expires_at")
      .eq("id", id)
      .single();

    if (getError || !invitation) {
      return NextResponse.json(
        { error: "Invitation not found" },
        { status: 404 }
      );
    }

    // Only allow resending pending invitations
    if (invitation.status !== "pending") {
      return NextResponse.json(
        { error: "Only pending invitations can be resent" },
        { status: 400 }
      );
    }

    // Check if invitation is expired
    const expiresAt = new Date(invitation.expires_at);
    if (new Date() > expiresAt) {
      return NextResponse.json(
        { error: "Invitation has expired" },
        { status: 400 }
      );
    }

    // Generate new token
    const newToken = generateInvitationToken();
    const newTokenHash = hashToken(newToken);

    // Update invitation with new token hash
    const { error: updateError } = await session.supabase
      .from("invitations")
      .update({
        token_hash: newTokenHash,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      throw new Error(`Failed to update invitation: ${updateError.message}`);
    }

    // Log action
    await logInvitationResent(
      session.supabase,
      id,
      session.profile.id,
      req.headers.get("x-forwarded-for") || undefined
    );

    // Queue notification/email with new token
    await session.supabase.from("notification_queue").insert({
      notification_type: "team_invitation",
      recipient: invitation.email,
      subject: "Your ZT Lounge Team Invitation (Resent)",
      message: `You have been invited to join the ZT Lounge team. Click the link in your email to accept.`,
      scheduled_at: new Date().toISOString(),
      status: "pending",
    });

    return NextResponse.json(
      {
        message: "Invitation resent successfully",
        email: invitation.email,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[Team Invitations] POST resend error:", error);
    return NextResponse.json(
      { error: "Failed to resend invitation" },
      { status: 500 }
    );
  }
}
