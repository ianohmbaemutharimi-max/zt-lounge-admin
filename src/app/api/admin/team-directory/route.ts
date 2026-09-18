/** @format */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getInvitations } from "@/lib/team/invitations";

/**
 * Team Directory API
 * GET /api/admin/team-directory - Returns team members, pending invitations,
 * and the authenticated user's role for the Team Management dashboard.
 *
 * Expected response shape (matches TeamDirectoryResponse in page.tsx):
 * {
 *   team: TeamMember[],
 *   invitations: PendingInvitation[],
 *   currentRole: "super_admin" | "admin"
 * }
 */
export async function GET(req: NextRequest) {
  try {
    // Authenticate
    const authResult = await getServerSession(req);
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { session } = authResult;

    // Authorization: admin and super_admin can view team directory
    if (!["admin", "super_admin"].includes(session.user.role)) {
      return NextResponse.json(
        { error: "You don't have permission to view the team directory" },
        { status: 403 }
      );
    }

    // Fetch team members from profiles table (joined with roles)
    // auth.users is NOT joinable via PostgREST (PGRST205), so we fetch
    // profiles + roles here, and auth data separately via admin client
    const { data: profiles, error: profilesError } = await session.supabase
      .from("profiles")
      .select("id, user_id, full_name, role_id, role_name: roles(name), is_active, created_at")
      .neq("id", session.profile.id)
      .order("full_name");

    if (profilesError) {
      console.error("[Team Directory] Failed to fetch profiles:", profilesError);
      return NextResponse.json(
        { error: "Failed to fetch team directory" },
        { status: 500 }
      );
    }

    // Get auth.users data via GoTrue Admin API (established pattern from invitations.ts)
    // This provides emails and last_sign_in_at which cannot be joined via PostgREST
    const adminClient = await getSupabaseAdmin();
    let authUserMap: Record<string, { email: string; last_sign_in_at: string | null }> = {};

    try {
      const { data: authUsers, error: authError } = await adminClient.auth.admin.listUsers();
      if (!authError && authUsers?.users) {
        authUserMap = authUsers.users.reduce((acc: any, user: any) => {
          if (user.email) {
            acc[user.id] = { email: user.email, last_sign_in_at: user.last_sign_in_at };
          }
          return acc;
        }, {});
      }
    } catch (authErr: any) {
      console.warn("[Team Directory] auth.users lookup failed, email/last_sign_in_at will be null:", authErr.message);
    }

    // Transform team data to match TeamMember interface
    // Match auth.users by user_id (profiles.user_id → auth.users.id)
    const team = (profiles || []).map((member: any) => {
      const authData = authUserMap[member.user_id];
      return {
        profile_id: member.id,
        auth_user_id: member.user_id,
        email: authData?.email || "",
        full_name: member.full_name,
        role_name: member.role_name as "super_admin" | "admin",
        is_active: member.is_active,
        last_sign_in_at: authData?.last_sign_in_at || null,
        joined_at: member.created_at,
      };
    });

    // Fetch pending invitations using existing service
    const invitationsData = await getInvitations(session.supabase, { status: "pending" });

    // Transform invitations to match PendingInvitation interface
    const invitations = (invitationsData || []).map((inv: any) => ({
      id: inv.id,
      email: inv.email,
      role: inv.roles?.name || "admin",
      status: inv.status,
      expires_at: inv.expires_at,
      created_at: inv.created_at,
    }));

    return NextResponse.json(
      {
        team,
        invitations,
        currentRole: session.user.role as "super_admin" | "admin",
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[Team Directory] GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
