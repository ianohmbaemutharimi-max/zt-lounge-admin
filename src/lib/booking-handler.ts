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
import { conflictError, validationError, internalError } from "./validation/admin";
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
  async create(data: unknown) {
    // Validate booking data
    const validation = validateBookingData(data);
    if (!validation.success) {
      return validationError(validation.error);
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
   * Create booking via admin_booking RPC
   */
  private async createBookingViaRPC(data: BookingValidation) {
    // Get the supabase client from the repository
    const supabase = (this.repo as any).supabase as SupabaseClient<any>;
    
    // Map validation data to RPC parameters
    const { 
      customerId, 
      serviceId, 
      staffId, 
      bookingDate, 
      startTime, 
      endTime, 
      guests, 
      status, 
      full_name, 
      email, 
      phone, 
      specialRequests,
      cancellationReason,
      internalNotes
    } = data;

    // Call the admin_booking RPC
    const { data: result, error } = await supabase.rpc('admin_booking', {
      p_full_name: full_name || '',
      p_phone: phone || '',
      p_booking_date: bookingDate,
      p_start_time: startTime,
      p_end_time: endTime,
      p_guests: guests,
      p_email: email || null,
      p_service_id: serviceId,
      p_staff_id: staffId || null,
      p_special_requests: specialRequests || null,
      p_created_by: null, // Will be set by the API layer
      p_customer_id: customerId || null
    });

    if (error) {
      throw error;
    }

    // Map the RPC result to the expected booking object
    // The RPC returns: booking_id, booking_number, customer_id, service_id, staff_id,
    //                  booking_date, start_time, end_time, guests, status, special_requests,
    //                  created_by, created_at, updated_at
    return result;
  }

  /**
   * Authoritative confirmation boundary.
   * Invokes the canonical confirm_booking() RPC which atomically creates-or-links
   * the customer (source='booking'), sets bookings.customer_id, and sets status
   * to 'confirmed'. Any failure rolls the whole transaction back.
   */
  async confirm(id: string | number, changedBy?: string) {
    const supabase = (this.repo as any).supabase as SupabaseClient<any>;

    const { data, error } = await supabase.rpc("confirm_booking", {
      p_booking_id: String(id),
    });

    if (error) {
      console.error("[confirm_booking] RPC error:", error);
      return validationError(
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
  async updateStatus(id: string | number, status: string, changedBy?: string) {
    if (!status) {
      return validationError("Status is required");
    }

    // ensure confirmation goes through confirm()
    if (status === "confirmed") {
      return this.confirm(id, changedBy);
    }

    let current: any;
    try {
      current = await this.repo.findById("bookings", String(id));
    } catch {
      return validationError("Could not load booking for transition validation");
    }
    if (!current) {
      return validationError("Booking not found");
    }

    const statusValidation = validateStatusUpdate(current.status, status);
    if (!statusValidation.valid) {
      return validationError(statusValidation.error!);
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
  async update(id: string | number, data: unknown) {
    // Validate booking data
    const validation = validateBookingData(data);
    if (!validation.success) {
      return validationError(validation.error);
    }

    // If status is being changed, validate the transition
    if (validation.data.status) {
      try {
        // Fetch current booking to check current status
        const current = await this.repo.findById("bookings", String(id));
        if (!current) {
          return validationError("Booking not found");
        }

        // Validate status transition
        const statusValidation = validateStatusUpdate(current.status, validation.data.status);
        if (!statusValidation.valid) {
          return validationError(statusValidation.error!);
        }
      } catch (error: any) {
        return internalError("Failed to validate status transition");
      }
    }

    try {
      const updated = await this.repo.update("bookings", String(id), validation.data);
      return { success: true, data: updated };
    } catch (error: any) {
      return this.handleDatabaseError(error, "update");
    }
  }

  /**
   * Handle database errors with special handling for booking conflicts.
   */
  private handleDatabaseError(error: any, operation: "create" | "update") {
    const errorMessage = error?.message?.toLowerCase() || "";
    const errorCode = error?.code || "";

    // PostgreSQL exclusion constraint violation
    if (errorCode === "23P01" || errorMessage.includes("bookings_no_overlap_per_staff")) {
      return conflictError(
        "Booking conflicts with an existing booking for this staff member at the same time."
      );
    }

    // PostgreSQL check constraint violation (status)
    if (errorCode === "23514" || errorMessage.includes("bookings_status_check")) {
      return validationError("Invalid booking status.");
    }

    // Foreign key violations
    if (errorCode === "23503" || errorMessage.includes("foreign key")) {
      if (errorMessage.includes("customer")) {
        return validationError("Invalid customer ID.");
      }
      if (errorMessage.includes("service")) {
        return validationError("Invalid service ID.");
      }
      if (errorMessage.includes("staff")) {
        return validationError("Invalid staff ID.");
      }
      return validationError("Invalid reference in booking data.");
    }

    // Generic database errors
    console.error(`Booking ${operation} error:`, error);
    return internalError(`Failed to ${operation} booking. Please try again.`);
  }
}

/**
 * Check if a resource is a booking resource that needs special handling.
 */
export function isBookingResource(resource: string): boolean {
  return resource === "bookings";
}