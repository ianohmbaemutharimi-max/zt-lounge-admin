/**
 * Invitation Acceptance Endpoint
 * POST /api/invitations/accept
 * 
 * Accepts an invitation token and links it to the authenticated user's profile
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server";
import {
  validateInvitationToken,
  acceptInvitation,
  logInvitationAccepted,
} from "@/lib/team/invitations";
import { getSupabaseServer } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();

    if (!token) {
      return NextResponse.json(
        { error: "Invitation token is required" },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseServer();

    // Validate the token
    const validation = await validateInvitationToken(supabase, token);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error || "Invalid invitation token" },
        { status: 400 }
      );
    }

    // Get authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Get or create profile for this user
    let { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile) {
      // Create profile
      const { data: newProfile, error: createError } = await supabase
        .from("profiles")
        .insert({
          id: user.id,
          user_id: user.id,
          full_name: user.user_metadata?.full_name || user.email || "Team Member",
          role_id: null, // Will be set by acceptance
        })
        .select("id")
        .single();

      if (createError || !newProfile) {
        throw new Error(`Failed to create profile: ${createError?.message}`);
      }

      profile = newProfile;
    }

    // Accept the invitation
    const result = await acceptInvitation(supabase, token, profile.id);

    // Update the profile with the role from the invitation
    await supabase
      .from("profiles")
      .update({ role_id: result.roleId })
      .eq("id", profile.id);

    // Log acceptance
    await logInvitationAccepted(
      supabase,
      result.id,
      profile.id,
      req.headers.get("x-forwarded-for") || undefined
    );

    return NextResponse.json(
      {
        message: "Invitation accepted successfully",
        profileId: profile.id,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[Invitations Accept] error:", error);
    return NextResponse.json(
      { error: "Failed to accept invitation" },
      { status: 500 }
    );
  }
}
