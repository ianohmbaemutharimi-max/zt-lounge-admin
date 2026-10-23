import { NextRequest, NextResponse } from "next/server";
import { withAdminAuth } from "@/lib/auth/server";
import { validateRecordId, validationError, notFoundError } from "@/lib/validation/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Mark contact message as replied/resolved.
 * POST /api/admin/contact-messages/[id]/reply
 * 
 * This endpoint:
 * 1. Updates message status from 'new'/'read' → 'replied'
 * 2. Sets replied_by to the authenticated admin's profile_id
 * 3. Sets replied_at to current timestamp
 * 4. Marks associated contact_message notifications as read
 * 
 * This is the canonical resolution action for contact messages.
 * READ ≠ RESOLVED: viewing a message marks notifications as read, but
 * only this endpoint actually resolves the message by setting status='replied'.
 */
export const POST = withAdminAuth(
  async (req: NextRequest, context: { params: Promise<{ id: string }> }, auth) => {
    try {
      const params = await context.params;
      const id = params.id;

      if (!id) {
        return validationError("Contact message ID is required");
      }

      // Validate ID format (UUID or integer)
      if (!validateRecordId(id)) {
        return validationError("Invalid contact message ID format");
      }

      // Check if message exists
      const { data: existing, error: fetchError } = await auth.supabase
        .from("contact_messages")
        .select("id, status")
        .eq("id", id)
        .single();

      if (fetchError || !existing) {
        return notFoundError("Contact message not found");
      }

      // Update message status to 'replied'
      const { data: updated, error: updateError } = await auth.supabase
        .from("contact_messages")
        .update({
          status: "replied",
          replied_by: auth.profile.id,
          replied_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (updateError) {
        console.error("[reply] Failed to update contact message:", updateError);
        return NextResponse.json(
          { error: "Failed to mark message as replied" },
          { status: 500 }
        );
      }

      // Mark associated notifications as read
      // This ensures the notification bell count updates immediately
      const { error: notifError } = await auth.supabase
        .from("notifications")
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .eq("profile_id", auth.profile.id)
        .eq("entity_type", "contact_message")
        .eq("entity_id", id);

      if (notifError) {
        console.warn("[reply] Failed to mark notifications as read:", notifError);
        // Non-fatal: message is already marked as replied
      }

      return NextResponse.json({
        success: true,
        data: updated,
      });
    } catch (error) {
      console.error("[reply] Unexpected error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
);
