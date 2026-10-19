import { NextRequest, NextResponse } from "next/server";

// ============================================================
// RESOURCE ALLOWLIST
// ============================================================
export const ADMIN_RESOURCES = new Set([
  "bookings",
  "booking-history",
  "booking-notes",
  "customers",
  "services",
  "service-categories",
  "menu-items",
  "menu-categories",
  "staff",
  "staff-availability",
  "staff-leave",
  "gallery",
  "file-uploads",
  "media_assets",
  "testimonials",
  "contact-messages",
  "faqs",
  "promotions",
  "hero-slides",
  "website-pages",
  "business-settings",
  "system-settings",
  "notifications",
  "activity-logs",
  "business-closures",
  "profiles",
  "roles",
  "service_charges",
  "membership-plans",
  "membership-plan-benefits",
  "customer-memberships",
]);

// ============================================================
// DEDICATED-ROUTE-ONLY RESOURCES
// ============================================================
/**
 * Resources whose admin API is served EXCLUSIVELY by a dedicated route that
 * carries its own authorization gate (e.g. /api/admin/services/[slug]/charges
 * resolves the service server-side and enforces page scope).
 *
 * The generic /api/admin/[resource] routes refuse them — fail closed — so a
 * direct call can never bypass that gate. They intentionally REMAIN in
 * ADMIN_RESOURCES above: the repository allowlist shared with the dedicated
 * route (validateResource / WRITABLE_FIELDS) still needs them.
 */
export const DEDICATED_ROUTE_ONLY_RESOURCES = new Set(["service_charges"]);

/** True when a generic admin route must refuse this resource (fail closed). */
export function isDedicatedRouteOnlyResource(resource: string): boolean {
  return DEDICATED_ROUTE_ONLY_RESOURCES.has(resource);
}


// ============================================================
// ORDERABLE COLUMNS
// ============================================================
export const ORDERABLE_COLUMNS: Record<string, string[]> = {
  bookings: ["booking_date", "start_time", "end_time", "status", "created_at", "updated_at"],
  service_charges: ["name", "price", "sort_order", "status", "created_at", "updated_at"],
  "booking-history": ["created_at"],
  "booking-notes": ["created_at"],
  customers: ["full_name", "email", "created_at", "updated_at"],
  services: ["name", "price", "display_order", "created_at", "updated_at"],
  "service-categories": ["name", "display_order", "created_at"],
  "menu-items": ["name", "price", "display_order", "created_at"],
  "menu-categories": ["name", "display_order", "created_at"],
  staff: ["full_name", "email", "position", "created_at", "updated_at"],
  "staff-availability": ["weekday", "start_time", "end_time"],
  "staff-leave": ["start_date", "end_date", "created_at"],
  gallery: ["title", "category", "display_order", "created_at", "updated_at"],
  "file-uploads": ["bucket", "created_at"],
  testimonials: ["display_order", "created_at", "updated_at"],
  "contact-messages": ["full_name", "status", "created_at"],
  faqs: ["question", "display_order", "created_at", "updated_at"],
  promotions: ["title", "start_date", "end_date", "created_at", "updated_at"],
  "hero-slides": ["display_order", "created_at", "updated_at"],
  "website-pages": ["page_key", "title", "created_at", "updated_at"],
  "business-settings": ["business_name", "created_at", "updated_at"],
  "system-settings": ["created_at", "updated_at"],
  notifications: ["type", "is_read", "created_at"],
  "activity-logs": ["action", "created_at"],
  "business-closures": ["closure_date", "created_at"],
  profiles: ["full_name", "created_at", "updated_at"],
  roles: ["name", "created_at"],
  "membership-plans": ["name", "display_order", "annual_price", "created_at", "updated_at"],
  "membership-plan-benefits": ["display_order", "created_at", "updated_at"],
  "customer-memberships": ["registered_at", "expires_at", "member_number", "status", "created_at", "updated_at"],
};

// ============================================================
// SEARCHABLE FIELDS
// ============================================================
export const SEARCHABLE_FIELDS: Record<string, string[]> = {
  bookings: ["booking_number", "customer_id", "staff_id"],
  customers: ["full_name", "email", "phone"],
  services: ["name", "description"],
  "service-categories": ["name", "description"],
  "menu-items": ["name", "description", "category"],
  "menu-categories": ["name", "description"],
  staff: ["full_name", "email", "position"],
  gallery: ["title", "category", "description"],
  testimonials: ["customer_name", "comment"],
  "contact-messages": ["full_name", "email", "message"],
  faqs: ["question", "answer", "category"],
  promotions: ["title", "description"],
  "website-pages": ["title", "page_key", "seo_title"],
  profiles: ["full_name", "email"],
  "membership-plans": ["name", "slug", "description"],
  "membership-plan-benefits": ["description"],
  "customer-memberships": ["member_number", "customer_id"],
};

// ============================================================
// FILTERABLE FIELDS
// ============================================================
export const FILTERABLE_FIELDS: Record<string, string[]> = {
  bookings: ["status", "booking_date", "customer_id", "service_id", "staff_id", "created_by"],
  customers: ["is_active", "gender"],
    services: ["category_id", "is_active", "featured", "page_id", "card_type", "type"],
  service_charges: ["service_id", "status"],
  "service-categories": ["is_active"],
  "menu-items": ["category_id", "is_active", "is_featured", "page_id"],
  "menu-categories": ["is_active"],
  staff: ["is_active", "position"],
  gallery: ["is_active", "is_featured", "category", "page_id", "type"],
  testimonials: ["is_featured", "approved", "page_id"],
  "contact-messages": ["status"],
  faqs: ["is_active", "is_featured", "category", "page_id"],
  promotions: ["is_active"],
  "hero-slides": ["is_active", "page_id"],
  "website-pages": ["is_published", "page_key", "service_cards_enabled", "service_packages_enabled"],
  profiles: ["is_active", "role_id"],
  notifications: ["is_read", "type", "profile_id"],
  "membership-plans": ["is_active"],
  "membership-plan-benefits": ["plan_id", "is_active"],
  "customer-memberships": ["customer_id", "plan_id", "status"],
};

// ============================================================
// FILTER OPERATORS
// ============================================================
export const FILTER_OPERATORS = new Set([
  "eq",
  "neq",
  "lt",
  "lte",
  "gt",
  "gte",
  "like",
  "ilike",
  "in",
]);

// ============================================================
// SORT DIRECTIONS
// ============================================================
export const SORT_DIRECTIONS = new Set(["asc", "desc"]);

// ============================================================
// VALIDATION HELPERS
// ============================================================

export function validateResource(resource: string): boolean {
  return ADMIN_RESOURCES.has(resource);
}

export function validateOrderBy(resource: string, column: string): boolean {
  const allowed = ORDERABLE_COLUMNS[resource];
  if (!allowed) return false;
  return allowed.includes(column);
}

export function validateSearchField(resource: string, field: string): boolean {
  const allowed = SEARCHABLE_FIELDS[resource];
  if (!allowed) return false;
  return allowed.includes(field);
}

export function validateFilterField(resource: string, field: string): boolean {
  const allowed = FILTERABLE_FIELDS[resource];
  if (!allowed) return false;
  return allowed.includes(field);
}

export function validateFilterOperator(operator: string): boolean {
  return FILTER_OPERATORS.has(operator);
}

export function validateSortDirection(direction: string): boolean {
  return SORT_DIRECTIONS.has(direction.toLowerCase());
}

export function validateUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Validate a record ID. Accepts UUIDs (most tables) and integer strings
 * (e.g. business_settings.id is SMALLINT/SERIAL in the live schema).
 */
export function validateRecordId(id: string): boolean {
  if (validateUUID(id)) return true;
  return /^[0-9]+$/.test(id);
}

export function validatePagination(page: number, limit: number, offset: number): { page: number; limit: number; offset: number } {
  const validatedPage = Math.max(1, Math.floor(page));
  const validatedLimit = Math.min(100, Math.max(1, Math.floor(limit)));
  const validatedOffset = Math.max(0, Math.floor(offset));

  return {
    page: validatedPage,
    limit: validatedLimit,
    offset: validatedOffset,
  };
}

export function validateSearchTerm(term: string): { valid: boolean; truncated?: string } {
  if (term.length > 200) {
    return { valid: false };
  }
  return { valid: true, truncated: term.slice(0, 200) };
}

// ============================================================
// ERROR RESPONSE HELPERS
// ============================================================

export function validationError(message: string) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message,
      },
    },
    { status: 400 }
  );
}

export function unauthorizedError(message: string = "Unauthorized") {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message,
      },
    },
    { status: 401 }
  );
}

export function forbiddenError(message: string = "Forbidden") {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "FORBIDDEN",
        message,
      },
    },
    { status: 403 }
  );
}

export function notFoundError(message: string = "Resource not found") {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "NOT_FOUND",
        message,
      },
    },
    { status: 404 }
  );
}

export function conflictError(message: string) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "CONFLICT",
        message,
      },
    },
    { status: 409 }
  );
}

export function internalError(message: string = "Internal server error") {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message,
      },
    },
    { status: 500 }
  );
}

// ============================================================
// RESULT-STYLE ERROR HELPERS (for handler ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ route communication)
// ============================================================

export interface ResultError {
  readonly success: false;
  readonly error: Readonly<{
    code: string;
    message: string;
  }>;
}

export interface ResultSuccess<T = any> {
  readonly success: true;
  readonly data: T;
}

export type ActionResult<T = any> = ResultSuccess<T> | ResultError;

/**
 * Client-input validation failure raised by the repository/data layer.
 * Distinct from generic runtime failures so route handlers can map it to
 * HTTP 400 instead of 500, without exposing PostgreSQL internals.
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/** Known CHECK constraints → safe, user-facing messages (no DB internals). */
const CONSTRAINT_MESSAGES: Record<string, string> = {
  valid_email: "Please provide a valid email address",
};

/** Known UNIQUE constraints → safe, user-facing messages (no DB internals). */
const UNIQUE_MESSAGES: Record<string, string> = {
  uq_customers_email: "A customer with this email already exists",
  customers_phone_normalized_unique: "A customer with this phone number already exists",
};

/** Translate a Postgres 23514 message into a safe client-facing message. */
export function constraintValidationMessage(pgMessage: string): string {
  const match = pgMessage.match(/check constraint "([^"]+)"/i);
  if (match && CONSTRAINT_MESSAGES[match[1]]) {
    return CONSTRAINT_MESSAGES[match[1]];
  }
  return "One or more fields failed validation. Please check your input.";
}

/** Translate a Postgres 23505 message into a safe client-facing message. */
export function uniqueConstraintMessage(pgMessage: string): string {
  const match = pgMessage.match(/unique constraint "([^"]+)"/i);
  if (match && UNIQUE_MESSAGES[match[1]]) {
    return UNIQUE_MESSAGES[match[1]];
  }
  return "This record already exists. Please use different details.";
}


export function validationErr(message: string): ResultError {
  return { success: false, error: { code: "VALIDATION_ERROR", message } };
}

export function conflictErr(message: string): ResultError {
  return { success: false, error: { code: "CONFLICT", message } };
}

export function internalErr(message: string): ResultError {
  return { success: false, error: { code: "INTERNAL_ERROR", message } };
}

export function notFoundErr(message: string): ResultError {
  return { success: false, error: { code: "NOT_FOUND", message } };
}

const ERROR_STATUS_CODES: Record<string, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
};

/** Convert a ResultError into an HTTP NextResponse (for route handlers). */
export function errorResultToResponse(err: ResultError): NextResponse {
  const status = ERROR_STATUS_CODES[err.error.code] ?? 400;
  return NextResponse.json(
    { success: false, error: err.error },
    { status }
  );
}
