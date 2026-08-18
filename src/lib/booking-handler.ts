/**
 * BOOKING INTEGRITY — Server-Side Handler
 * 
 * Wraps repository operations for bookings with:
 * - Validation enforcement
 * - Status transition checking
 * - Database conflict error handling
 */

import { Repository } from "./repository";
import { validateBookingData, validateStatusUpdate, type BookingValidation } from "./booking-validation";
import { conflictError, validationError, internalError } from "./validation/admin";

/**
 * Enhanced booking handler with integrity enforcement.
 */
export class BookingHandler {
  constructor(private repo: Repository) {}

  /**
   * Create a new booking with validation.
   */
  async create(data: unknown) {
    // Validate booking data
    const validation = validateBookingData(data);
    if (!validation.success) {
      return validationError(validation.error);
    }

    try {
      const created = await this.repo.create("bookings", validation.data);
      return { success: true, data: created };
    } catch (error: any) {
      return this.handleDatabaseError(error, "create");
    }
  }

  /**
   * Update an existing booking with validation and status transition enforcement.
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
