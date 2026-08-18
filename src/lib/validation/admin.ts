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
]);

// ============================================================
// ORDERABLE COLUMNS
// ============================================================
export const ORDERABLE_COLUMNS: Record<string, string[]> = {
  bookings: ["booking_date", "start_time", "end_time", "status", "created_at", "updated_at"],
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
  testimonials: ["customer_name", "rating", "display_order", "created_at", "updated_at"],
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
};

// ============================================================
// FILTERABLE FIELDS
// ============================================================
export const FILTERABLE_FIELDS: Record<string, string[]> = {
  bookings: ["status", "booking_date", "customer_id", "service_id", "staff_id", "created_by"],
  customers: ["is_active", "gender"],
  services: ["category_id", "is_active", "featured", "page_id"],
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
  "website-pages": ["is_published", "page_key"],
  profiles: ["is_active", "role_id"],
  notifications: ["is_read", "type", "profile_id"],
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