/**
 * BOOKING INTEGRITY — Server-Side Handler
 * 
 * Wraps repository operations for bookings with:
 * - Validation enforcement
 * - Status transition checking
 * - Database conflict error handling
 * - Unified booking creation via admin_booking RPC
 */

import { Repository } from "./repository";
import { validateBookingData, validateStatusUpdate, type BookingValidation } from "./booking-validation";
import { conflictErr, validationErr, internalErr, type ActionResult, type ResultError } from "./validation/admin";
import { mapFromPublicContract } from "./contract/mapping";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Enhanced booking handler with integrity enforcement.
 * Uses admin_booking RPC for unified booking creation.
 */
export class BookingHandler {
  constructor(private repo: Repository) {}

  /**
   * Create a new booking with validation using the admin_booking RPC.
   * This ensures the same booking creation logic as public bookings.
   */
    async create(data: unknown): Promise<ActionResult<any>> {
    // Validate booking data
    const validation = validateBookingData(data);
    if (!validation.success) {
      return validationErr(validation.error);
    }

    try {
      // Use admin_booking RPC for unified booking creation
      const result = await this.createBookingViaRPC(validation.data);
      return { success: true, data: result };
    } catch (error: any) {
      return this.handleDatabaseError(error, "create");
    }
  }

  /**
   * Create booking through the live public.admin_booking(...) RPC signature.
   * The database validates the active service category, date/time, and customer,
   * then creates a pending booking and generates its booking number server-side.
   * This RPC does not accept a service ID, staff ID, or caller-selected status.
   */
  private async createBookingViaRPC(data: BookingValidation) {
    const supabase = (this.repo as any).supabase as SupabaseClient<any>;

    // Match the live public.admin_booking(...) RPC signature exactly.
    // Category identity is the canonical booking classification.
    const { data: result, error } = await supabase.rpc("admin_booking", {
      p_customer_id: data.customerId || null,
      p_service_category_id: data.serviceCategoryId,
      p_profile_id: null,
      p_booking_date: data.bookingDate,
      p_start_time: data.startTime,
      p_end_time: data.endTime,
      p_full_name: data.guest_name || null,
      p_phone: data.guest_phone || null,
      p_email: data.guest_email || null,
      p_guests: data.guests ?? 1,
      p_special_requests: data.specialRequests || null,
      p_created_by: null,
      p_booking_number: null,
    });

    if (error) throw error;
    return result;
  }

  /**
   * Authoritative confirmation boundary.
   * Invokes the canonical confirm_booking() RPC which atomically creates-or-links
   * the customer (source='booking'), sets bookings.customer_id, and sets status
   * to 'confirmed'. Any failure rolls the whole transaction back.
   */
    async confirm(id: string | number, changedBy?: string): Promise<ActionResult<any>> {
    const supabase = (this.repo as any).supabase as SupabaseClient<any>;

    const { data, error } = await supabase.rpc("confirm_booking", {
      p_booking_id: String(id),
    });

        if (error) {
      console.error("[confirm_booking] RPC error:", error);
      return validationErr(
        error.message?.startsWith("Booking not found")
          ? "Booking not found or is not pending."
          : "Failed to confirm booking. Please try again."
      );
    }

    // Record the status change in booking_history for auditability.
    try {
      await this.repo.create("booking-history", {
        booking_id: String(id),
        changed_by: changedBy ?? "system",
        previous_status: "pending",
        new_status: "confirmed",
        remarks: "Confirmed via confirm_booking (customer established)",
      });
    } catch {
      // history write is best-effort; confirmation itself already succeeded
    }

    return { success: true, data: data?.[0] ?? data };
  }

  /**
   * Authoritative status transition for NON-confirmation transitions
   * (completed / cancelled / no_show). Confirmation must go through confirm().
   * Validates only the status transition — not the full booking object — so the
   * generic create/edit validator is never weakened.
   */
    async updateStatus(id: string | number, status: string, changedBy?: string): Promise<ActionResult<any>> {
    if (!status) {
      return validationErr("Status is required");
    }

    // ensure confirmation goes through confirm()
    if (status === "confirmed") {
      return this.confirm(id, changedBy);
    }

    let current: any;
    try {
      current = await this.repo.findById("bookings", String(id));
        } catch {
      return validationErr("Could not load booking for transition validation");
    }
    if (!current) {
      return validationErr("Booking not found");
    }

    const statusValidation = validateStatusUpdate(current.status, status);
    if (!statusValidation.valid) {
      return validationErr(statusValidation.error!);
    }

    try {
      const updated = await this.repo.update("bookings", String(id), { status });
      try {
        await this.repo.create("booking-history", {
          booking_id: String(id),
          changed_by: changedBy ?? "system",
          previous_status: current.status,
          new_status: status,
        });
      } catch {
        /* best-effort history write */
      }
      return { success: true, data: updated };
    } catch (error: any) {
      return this.handleDatabaseError(error, "update");
    }
  }

  /**
   * Update an existing booking with validation and status transition enforcement.
   * This is the GENERIC (full-object) edit path used by the edit form. Fast
   * status actions must use confirm()/updateStatus() instead; do not send a
   * bare { status } payload here.
   */
    async update(id: string | number, data: unknown): Promise<ActionResult<any>> {
    // Validate booking data
    const validation = validateBookingData(data);
    if (!validation.success) {
      return validationErr(validation.error);
    }

    // The category is required for every admin edit and must still be active.
    // The FK protects referential integrity; this check also enforces the active flag.
    try {
      const category = await this.repo.findById("service-categories", validation.data.serviceCategoryId);
      if (!category || category.is_active !== true) {
        return validationErr("Selected service category does not exist or is inactive.");
      }
    } catch {
      return internalErr("Could not validate the selected service category.");
    }

    // If status is being changed, validate the transition
    if (validation.data.status) {
      try {
        // Fetch current booking to check current status
        const current = await this.repo.findById("bookings", String(id));
        if (!current) {
          return validationErr("Booking not found");
        }

        // Validate status transition
        const statusValidation = validateStatusUpdate(current.status, validation.data.status);
        if (!statusValidation.valid) {
          return validationErr(statusValidation.error!);
        }
      } catch (error: any) {
        return internalErr("Failed to validate status transition");
      }
    }

    try {
      // CONTRACT BRIDGE: validation.data uses the public API camelCase contract
      // (customerId, serviceCategoryId, bookingDate, startTime, endTime,
      // specialRequests) but Repository.update -> sanitizePayload allowlists
      // snake_case DB columns. Inverse-map via the canonical mapping layer so
      // those edits persist instead of being silently dropped by the allowlist.
      // Snake_case schema keys (guest_name/guest_phone/guest_email, guests,
      // status) pass through the mapper unchanged.
      const dbPayload = mapFromPublicContract("bookings", validation.data);
      const updated = await this.repo.update("bookings", String(id), dbPayload);
      return { success: true, data: updated };
    } catch (error: any) {
      return this.handleDatabaseError(error, "update");
    }
  }

  /**
   * Handle database errors with special handling for booking conflicts.
   */
    private handleDatabaseError(error: any, operation: "create" | "update"): ResultError {
    const errorMessage = error?.message?.toLowerCase() || "";
    const errorCode = error?.code || "";

        // PostgreSQL exclusion constraint violation (service/venue-level)
    if (errorMessage.includes("bookings_no_overlap_per_service")) {
      return conflictErr(
        "Booking conflicts with an existing booking for this service at the same time. Please choose another time slot."
      );
    }

    // PostgreSQL exclusion constraint violation (staff-level)
    if (errorMessage.includes("bookings_no_overlap_per_staff")) {
      return conflictErr(
        "Booking conflicts with an existing booking for this staff member at the same time."
      );
    }

    // Any other exclusion-constraint violation (23P01) treated as a time conflict
    if (errorCode === "23P01") {
      return conflictErr(
        "Booking conflicts with an existing booking at the same time. Please choose another time slot."
      );
    }

    // PostgreSQL check constraint violation (status)
    if (errorCode === "23514" || errorMessage.includes("bookings_status_check")) {
      return validationErr("Invalid booking status.");
    }

    // Foreign key violations
    if (errorCode === "23503" || errorMessage.includes("foreign key")) {
      if (errorMessage.includes("customer")) {
        return validationErr("Invalid customer ID.");
      }
      if (errorMessage.includes("service category")) {
        return validationErr("Invalid or inactive service category.");
      }
      return validationErr("Invalid reference in booking data.");
    }

    // Generic database errors
    console.error(`Booking ${operation} error:`, error);
    return internalErr(`Failed to ${operation} booking. Please try again.`);
  }
}

/**
 * Check if a resource is a booking resource that needs special handling.
 */
export function isBookingResource(resource: string): boolean {
  return resource === "bookings";
}