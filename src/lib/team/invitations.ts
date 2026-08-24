/**
 * Team Invitations Service
 * 
 * Centralized service for managing team invitations:
 * - Token generation and hashing
 * - Email normalization
 * - Invitation creation and validation
 * - RBAC permission checks
 * - Expiration handling
 */

import { createHash, randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/server";

// RBAC hierarchy: who can invite whom
const INVITE_PERMISSIONS: Record<string, string[]> = {
  super_admin: ["super_admin", "admin", "manager", "staff", "receptionist"],
  admin: ["manager", "staff", "receptionist"],
  manager: ["staff", "receptionist"],
  staff: [],
  receptionist: [],
};

/**
 * Generate a cryptographically secure random token
 */
export function generateInvitationToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Hash a token using SHA256
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Normalize email address (lowercase, trim)
 */
export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * Check if current user can invite a specific role
 */
export function canInviteRole(currentUserRole: string, targetRole: string): boolean {
  const allowedRoles = INVITE_PERMISSIONS[currentUserRole] || [];
  return allowedRoles.includes(targetRole);
}

/**
 * Check if email already exists in active accounts or accepted invitations
 * 
 * Uses auth.users for active accounts (authoritative source) — reached via the
 * GoTrue Admin API because `auth.users` is NOT exposed through PostgREST
 * (.from("auth.users") fails with PGRST205 in every client, service role
 * included) and auth.admin.getUserByEmail is not available in this
 * supabase-js version. `listUsers()` + case-insensitive email match is the
 * established pattern used elsewhere in this codebase.
 * Uses invitations table for accepted invitations (users who completed onboarding)
 */
export async function emailExists(
  supabase: SupabaseClient,
  email: string
): Promise<boolean> {
  const normalizedEmail = normalizeEmail(email);

  // Check if email exists in auth.users (active account)
  try {
    const admin = await getSupabaseAdmin();
    const { data, error } = await admin.auth.admin.listUsers();

    if (error) {
      console.error("[emailExists] auth.users lookup failed:", error.message);
    } else {
      const activeUsers = data?.users || [];
      const hasAccount = activeUsers.some(
        (user) => user.email != null && normalizeEmail(user.email) === normalizedEmail
      );
      if (hasAccount) {
        return true;
      }
    }
  } catch (err) {
    console.error("[emailExists] auth.users lookup threw:", err);
    // Fall through to invitation-only check; never block invitation creation
    // because of an admin API failure.
  }

  // Check if email has an accepted invitation (already completed onboarding)
  const { data: acceptedInvitation, error: invError } = await supabase
    .from("invitations")
    .select("id", { count: "exact" })
    .ilike("email", normalizedEmail)
    .eq("status", "accepted")
    .limit(1);

  if (acceptedInvitation && acceptedInvitation.length > 0) {
    return true;
  }

  return false;
}

/**
 * Check if pending invitation already exists for this email + role
 */
export async function pendingInvitationExists(
  supabase: SupabaseClient,
  email: string,
  roleId: string
): Promise<boolean> {
  const normalizedEmail = normalizeEmail(email);
  
  const { data, error } = await supabase
    .from("invitations")
    .select("id")
    .eq("email", normalizedEmail)
    .eq("role_id", roleId)
    .eq("status", "pending")
    .limit(1);

  if (error) throw new Error(`Failed to check pending invitations: ${error.message}`);
  return data && data.length > 0 ? true : false;
}

/**
 * Get role name by ID
 */
export async function getRoleName(
  supabase: SupabaseClient,
  roleId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("roles")
    .select("name")
    .eq("id", roleId)
    .single();

  if (error) return null;
  return data?.name || null;
}

/**
 * Create an invitation
 */
export async function createInvitation(
  supabase: SupabaseClient,
  email: string,
  roleId: string,
  invitedByProfileId: string,
  expirationDays: number = 14
): Promise<{ id: string; token: string; expiresAt: string }> {
  const normalizedEmail = normalizeEmail(email);
  const token = generateInvitationToken();
  const tokenHash = hashToken(token);
  
  // Calculate expiration date
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expirationDays);

  const { data, error } = await supabase
    .from("invitations")
    .insert({
      email: normalizedEmail,
      token_hash: tokenHash,
      role_id: roleId,
      invited_by: invitedByProfileId,
      status: "pending",
      expires_at: expiresAt.toISOString(),
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create invitation: ${error.message}`);

  return {
    id: data.id,
    token,
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Get invitation by token hash
 */
export async function getInvitationByToken(
  supabase: SupabaseClient,
  token: string
): Promise<any | null> {
  const tokenHash = hashToken(token);

  const { data, error } = await supabase
    .from("invitations")
    .select("id, email, role_id, status, expires_at, accepted_at")
    .eq("token_hash", tokenHash)
    .single();

  if (error) return null;
  return data;
}

/**
 * Validate invitation token
 */
export async function validateInvitationToken(
  supabase: SupabaseClient,
  token: string
): Promise<{ valid: boolean; error?: string }> {
  const invitation = await getInvitationByToken(supabase, token);

  if (!invitation) {
    return { valid: false, error: "Invitation not found" };
  }

  if (invitation.status === "accepted") {
    return { valid: false, error: "Invitation already used" };
  }

  if (invitation.status === "revoked") {
    return { valid: false, error: "Invitation was revoked" };
  }

  if (invitation.status === "expired") {
    return { valid: false, error: "Invitation has expired" };
  }

  const expiresAt = new Date(invitation.expires_at);
  if (new Date() > expiresAt) {
    return { valid: false, error: "Invitation has expired" };
  }

  return { valid: true };
}

/**
 * Accept an invitation
 */
export async function acceptInvitation(
  supabase: SupabaseClient,
  token: string,
  profileId: string
): Promise<{ id: string; roleId: string }> {
  const tokenHash = hashToken(token);
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("invitations")
    .update({
      status: "accepted",
      profile_id: profileId,
      accepted_at: now,
      updated_at: now,
    })
    .eq("token_hash", tokenHash)
    .eq("status", "pending")
    .select("id, role_id")
    .single();

  if (error) throw new Error(`Failed to accept invitation: ${error.message}`);

  return {
    id: data.id,
    roleId: data.role_id,
  };
}

/**
 * Revoke an invitation
 */
export async function revokeInvitation(
  supabase: SupabaseClient,
  invitationId: string
): Promise<void> {
  const { error } = await supabase
    .from("invitations")
    .update({
      status: "revoked",
      updated_at: new Date().toISOString(),
    })
    .eq("id", invitationId);

  if (error) throw new Error(`Failed to revoke invitation: ${error.message}`);
}

/**
 * Resend invitation (create activity log entry)
 */
export async function logInvitationResent(
  supabase: SupabaseClient,
  invitationId: string,
  profileId: string,
  ipAddress?: string
): Promise<void> {
  await supabase.from("activity_logs").insert({
    profile_id: profileId,
    action: "team_invitation_resent",
    table_name: "invitations",
    record_id: invitationId,
    ip_address: ipAddress,
    created_at: new Date().toISOString(),
  });
}

/**
 * Log invitation creation
 */
export async function logInvitationCreated(
  supabase: SupabaseClient,
  invitationId: string,
  email: string,
  roleId: string,
  profileId: string,
  ipAddress?: string
): Promise<void> {
  await supabase.from("activity_logs").insert({
    profile_id: profileId,
    action: "team_invitation_created",
    table_name: "invitations",
    record_id: invitationId,
    details: JSON.stringify({
      email: normalizeEmail(email),
      role_id: roleId,
      // DO NOT LOG RAW TOKEN
    }),
    ip_address: ipAddress,
    created_at: new Date().toISOString(),
  });
}

/**
 * Log invitation acceptance
 */
export async function logInvitationAccepted(
  supabase: SupabaseClient,
  invitationId: string,
  profileId: string,
  ipAddress?: string
): Promise<void> {
  await supabase.from("activity_logs").insert({
    profile_id: profileId,
    action: "team_invitation_accepted",
    table_name: "invitations",
    record_id: invitationId,
    ip_address: ipAddress,
    created_at: new Date().toISOString(),
  });
}

/**
 * Log invitation revocation
 */
export async function logInvitationRevoked(
  supabase: SupabaseClient,
  invitationId: string,
  profileId: string,
  ipAddress?: string
): Promise<void> {
  await supabase.from("activity_logs").insert({
    profile_id: profileId,
    action: "team_invitation_revoked",
    table_name: "invitations",
    record_id: invitationId,
    ip_address: ipAddress,
    created_at: new Date().toISOString(),
  });
}

/**
 * Get invitations for admin dashboard
 */
export async function getInvitations(
  supabase: SupabaseClient,
  filters?: {
    status?: string;
    limit?: number;
    offset?: number;
  }
): Promise<any[]> {
  let query = supabase
    .from("invitations")
    .select(
      `
      id,
      email,
      role_id,
      status,
      expires_at,
      accepted_at,
      created_at,
      roles:role_id(name)
    `
    )
    .order("created_at", { ascending: false });

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  if (filters?.limit) {
    query = query.limit(filters.limit);
  }

  if (filters?.offset) {
    query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
  }

  const { data, error } = await query;

  if (error) throw new Error(`Failed to fetch invitations: ${error.message}`);
  return data || [];
}
