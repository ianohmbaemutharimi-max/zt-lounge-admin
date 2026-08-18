/**
 * BOOKING INTEGRITY — Validation & Business Rules
 * 
 * Centralized booking validation logic with:
 * - Strict date/time format validation
 * - Cross-field time comparison
 * - Status transition state machine
 * - Reusable helpers for time parsing
 */

import { z } from "zod";

// ============================================================
// DATE/TIME FORMAT VALIDATION
// ============================================================

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/; // YYYY-MM-DD
const TIME_FORMAT = /^(\d{2}):(\d{2})(:\d{2})?$/; // HH:mm or HH:mm:ss

/**
 * Parse time string to minutes since midnight for comparison.
 * Supports HH:mm and HH:mm:ss formats.
 */
export function parseTimeToMinutes(timeStr: string): number | null {
  const match = timeStr.match(TIME_FORMAT);
  if (!match) return null;
  
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  
  // Validate ranges
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  
  return hours * 60 + minutes;
}

/**
 * Validate that endTime > startTime.
 */
export function isEndTimeAfterStart(startTime: string, endTime: string): boolean {
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);
  
  if (startMinutes === null || endMinutes === null) {
    return false;
  }
  
  return endMinutes > startMinutes;
}

// ============================================================
// BOOKING VALIDATION SCHEMA
// ============================================================

export const bookingValidationSchema = z
  .object({
    customerId: z.string().uuid("Customer ID must be a valid UUID"),
    serviceId: z.string().uuid("Service ID must be a valid UUID"),
    staffId: z.string().uuid("Staff ID must be a valid UUID"),
    bookingDate: z
      .string()
      .min(1, "Booking date is required")
      .regex(DATE_FORMAT, "Booking date must be in YYYY-MM-DD format"),
    startTime: z
      .string()
      .min(1, "Start time is required")
      .regex(TIME_FORMAT, "Start time must be in HH:mm or HH:mm:ss format"),
    endTime: z
      .string()
      .min(1, "End time is required")
      .regex(TIME_FORMAT, "End time must be in HH:mm or HH:mm:ss format"),
    guests: z.coerce
      .number()
      .int("Guests must be a whole number")
      .min(1, "At least 1 guest is required")
      .max(50, "Maximum 50 guests allowed"),
    status: z.enum(["pending", "confirmed", "completed", "cancelled", "no_show"], {
      message: "Invalid booking status",
    }),
    specialRequests: z.string().optional(),
    cancellationReason: z.string().optional(),
    internalNotes: z.string().optional(),
  })
  .refine(
    (data) => isEndTimeAfterStart(data.startTime, data.endTime),
    {
      message: "End time must be after start time",
      path: ["endTime"],
    }
  );

export type BookingValidation = z.infer<typeof bookingValidationSchema>;

// ============================================================
// STATUS TRANSITION STATE MACHINE
// ============================================================

export type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled" | "no_show";

/**
 * Valid booking status transitions.
 * 
 * Business rules:
 * - pending → confirmed, cancelled, no_show
 * - confirmed → completed, cancelled, no_show
 * - completed → (terminal state, no transitions)
 * - cancelled → (terminal state, no transitions)
 * - no_show → (terminal state, no transitions)
 */
export const VALID_STATUS_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending: ["confirmed", "cancelled", "no_show"],
  confirmed: ["completed", "cancelled", "no_show"],
  completed: [], // Terminal state
  cancelled: [], // Terminal state
  no_show: [], // Terminal state
};

/**
 * Check if a status transition is valid.
 */
export function isValidStatusTransition(
  currentStatus: BookingStatus,
  newStatus: BookingStatus
): boolean {
  if (currentStatus === newStatus) {
    return true; // Same status is always allowed (no-op)
  }
  
  const allowedTransitions = VALID_STATUS_TRANSITIONS[currentStatus];
  return allowedTransitions.includes(newStatus);
}

/**
 * Get human-readable error message for invalid status transition.
 */
export function getStatusTransitionError(
  currentStatus: BookingStatus,
  newStatus: BookingStatus
): string {
  return `Cannot transition booking from '${currentStatus}' to '${newStatus}'. ` +
    `Allowed transitions from '${currentStatus}': ${
      VALID_STATUS_TRANSITIONS[currentStatus].length > 0
        ? VALID_STATUS_TRANSITIONS[currentStatus].join(", ")
        : "none (terminal state)"
    }`;
}

// ============================================================
// SERVER-SIDE VALIDATION HELPERS
// ============================================================

/**
 * Validate booking data on the server.
 * Returns { success: true, data } or { success: false, error }.
 */
export function validateBookingData(data: unknown): 
  | { success: true; data: BookingValidation }
  | { success: false; error: string } {
  try {
    const validated = bookingValidationSchema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues[0];
      return {
        success: false,
        error: firstError.message,
      };
    }
    return {
      success: false,
      error: "Invalid booking data",
    };
  }
}

/**
 * Validate status transition during update.
 */
export function validateStatusUpdate(
  currentStatus: string,
  newStatus: string
): { valid: boolean; error?: string } {
  // Validate status values
  const validStatuses: BookingStatus[] = ["pending", "confirmed", "completed", "cancelled", "no_show"];
  
  if (!validStatuses.includes(currentStatus as BookingStatus)) {
    return { valid: false, error: `Invalid current status: ${currentStatus}` };
  }
  
  if (!validStatuses.includes(newStatus as BookingStatus)) {
    return { valid: false, error: `Invalid new status: ${newStatus}` };
  }
  
  // Check transition validity
  if (!isValidStatusTransition(currentStatus as BookingStatus, newStatus as BookingStatus)) {
    return {
      valid: false,
      error: getStatusTransitionError(currentStatus as BookingStatus, newStatus as BookingStatus),
    };
  }
  
  return { valid: true };
}
