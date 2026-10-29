import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionContext } from "@/lib/auth/server";
import {
  validateResource,
  validateOrderBy,
  validateSearchField,
  validateFilterField,
  validateFilterOperator,
  validateSearchTerm,
  validationError,
  notFoundError,
  ValidationError,
  constraintValidationMessage,
  uniqueConstraintMessage,
} from "@/lib/validation/admin";
import { getResourceConfig } from "@/lib/resource-config";
import { mapToPublicContract, mapArrayToPublicContract } from "@/lib/contract/mapping";

function resolveTableName(resource: string): string {
  const config = getResourceConfig(resource);
  return config?.table ?? resource;
}

// ============================================================
// IMMUTABLE FIELDS â€” always stripped from client input
// ============================================================
const IMMUTABLE_FIELDS = new Set([
  "id",
  "created_at",
  "updated_at",
  "created_by",
  "uploaded_by",
  "deleted_at",
  "during",
  "is_approved",
  "role_id",
  "booking_number",
]);

// ============================================================
// SENSITIVE FIELDS â€” never returned in API responses
// ============================================================
const SENSITIVE_FIELDS = new Set([
  "ip_address",
  "user_agent",
  "old_data",
  "new_data",
  "content_hash",
  "internal_notes",
  "cancellation_reason",
  "password_hash",
  "secret",
  "api_key",
]);

// ============================================================
// RESPONSE ALLOWLISTS
// ============================================================
const RESPONSE_ALLOWLISTS: Record<string, string[]> = {
  roles: ["id", "name", "description", "created_at"],
  profiles: ["id", "full_name", "phone", "avatar_url", "is_active", "created_at", "updated_at"],
     business_settings: ["id", "business_name", "email", "phone", "address", "google_maps_url", "whatsapp", "facebook", "instagram", "opening_hours", "logo_url", "favicon_url", "logo_media_id", "logo_light_media_id", "favicon_media_id", "timezone", "currency", "tagline", "description", "twitter", "youtube", "city", "country", "latitude", "longitude", "google_maps_reviews_url", "google_reviews_api_key", "created_at", "updated_at"],
  website_pages: ["id", "page_key", "title", "subtitle", "content", "seo_title", "seo_description", "service_cards_enabled", "service_packages_enabled", "updated_by", "created_at", "updated_at"],
   hero_slides: ["id", "page_id", "badge", "title", "highlight", "subtitle", "image_url", "media_id", "buttons", "display_order", "is_active", "created_at", "updated_at", "alt_text", "cta_text", "cta_link"],
     services: ["id", "category_id", "name", "slug", "description", "duration_minutes", "price", "image_url", "media_id", "featured", "is_active", "deleted_at", "created_at", "updated_at", "alt_text", "tag", "href", "card_type", "type", "display_order", "page_id", "icon"],
   service_categories: ["id", "name", "slug", "description", "icon", "display_order", "is_active", "created_at", "updated_at"],
  // Packages/charges for a service. price here is the canonical package
  // price; bookings.price snapshots it server-side via create_booking().
  service_charges: ["id", "service_id", "name", "description", "price", "unit", "status", "is_active", "sort_order", "created_at", "updated_at", "updated_by"],
   menu_items: ["id", "page_id", "category_id", "name", "description", "price", "image_url", "media_id", "display_order", "is_active", "created_at", "updated_at", "slug", "alt_text", "category", "type", "is_featured"],
   menu_categories: ["id", "name", "slug", "description", "display_order", "is_active", "created_at", "updated_at"],
  staff: ["id", "profile_id", "employee_number", "full_name", "email", "phone", "position", "bio", "photo_url", "hire_date", "is_active", "created_at", "updated_at"],
  staff_availability: ["id", "staff_id", "weekday", "start_time", "end_time", "is_available", "created_at", "updated_at"],
  staff_leave: ["id", "staff_id", "leave_type", "start_date", "end_date", "reason", "approval_status", "approved_by", "approved_at", "notes", "created_at", "updated_at"],
  customers: ["id", "full_name", "phone", "email", "gender", "date_of_birth", "notes", "marketing_opt_in", "source", "is_active", "created_at", "updated_at"],
  bookings: ["id", "booking_number", "customer_id", "service_id", "staff_id", "booking_date", "start_time", "end_time", "guests", "status", "special_requests", "guest_name", "guest_phone", "guest_email", "created_by", "created_at", "updated_at"],
  booking_notes: ["id", "booking_id", "author_id", "note", "is_private", "created_at"],
  booking_history: ["id", "booking_id", "changed_by", "previous_status", "new_status", "remarks", "created_at"],
      notifications: ["id", "profile_id", "booking_id", "entity_type", "entity_id", "title", "message", "type", "is_read", "read_at", "created_at"],
  activity_logs: ["id", "profile_id", "action", "table_name", "record_id", "created_at"],
  gallery: ["id", "title", "description", "image_url", "media_id", "category", "alt_text", "display_order", "is_featured", "is_active", "uploaded_by", "created_at", "updated_at", "type", "page_id"],
   testimonials: ["id", "customer_name", "image_url", "occupation", "rating", "comment", "is_featured", "approved", "created_at", "updated_at", "display_order", "page_id", "media_id", "source", "external_id", "external_url", "author_photo_url", "reviewed_at", "last_synced_at"],
   contact_messages: ["id", "full_name", "phone", "email", "subject", "message", "status", "replied_by", "replied_at", "created_at"],
   media_assets: ["id", "public_url", "file_name", "mime_type", "file_size", "alt_text", "media_type", "display_id", "page_id", "created_at", "updated_at", "created_by", "updated_by"],
   faqs: ["id", "question", "answer", "display_order", "is_active", "category", "page_id", "is_featured", "created_at", "updated_at"],
  promotions: ["id", "title", "description", "banner_image", "discount_percent", "start_date", "end_date", "is_active", "page_id", "media_id", "show_on_homepage", "display_order", "created_at", "updated_at"],
  system_settings: ["id", "booking_buffer_minutes", "max_booking_days", "allow_online_booking", "require_staff_assignment", "enable_email_notifications", "enable_sms_notifications", "maintenance_mode", "created_at", "updated_at"],
  business_closures: ["id", "closure_date", "title", "reason", "affects_online_booking", "is_closed", "created_by", "created_at", "updated_at"],
  notification_queue: ["id", "booking_id", "customer_id", "profile_id", "notification_type", "recipient", "subject", "message", "scheduled_at", "sent_at", "retry_count", "status", "error_message", "created_at", "updated_at"],
  file_uploads: ["id", "bucket", "path", "original_name", "mime_type", "file_size", "uploaded_by", "created_at", "uploaded_filename", "uploaded_mime_type", "content_hash"],
  membership_plans: ["id", "name", "slug", "description", "annual_price", "registration_fee", "media_id", "display_order", "is_active", "cta_text", "cta_link", "created_at", "updated_at", "updated_by"],
  membership_plan_benefits: ["id", "plan_id", "description", "display_order", "is_active", "created_at", "updated_at"],
  customer_memberships: ["id", "customer_id", "plan_id", "member_number", "status", "registered_at", "expires_at", "annual_price_snapshot", "registration_fee_snapshot", "notes", "created_by", "created_at", "updated_at"],
};

// ============================================================
// WRITABLE FIELD ALLOWLISTS
// Canonical-only writes (F-4): the legacy image columns
// (image_url on hero_slides/services/menu_items/gallery and
// banner_image on promotions) are deliberately absent so no
// client can write the shadow fallback columns the renderers
// treat as legacy. RESPONSE_ALLOWLISTS still expose them
// (reads untouched) until the column-cleanup loop.
// ============================================================
const WRITABLE_FIELDS: Record<string, string[]> = {
  roles: ["name", "description"],
  profiles: ["full_name", "phone", "avatar_url", "is_active"],
  business_settings: ["business_name", "email", "phone", "address", "google_maps_url", "whatsapp", "facebook", "instagram", "opening_hours", "logo_url", "favicon_url", "logo_media_id", "favicon_media_id", "timezone", "currency", "tagline", "description", "twitter", "youtube", "city", "country", "latitude", "longitude", "google_maps_reviews_url", "google_reviews_api_key"],
  website_pages: ["page_key", "title", "subtitle", "content", "seo_title", "seo_description", "service_cards_enabled", "service_packages_enabled", "updated_by"],
  hero_slides: ["page_id", "badge", "title", "highlight", "subtitle", "media_id", "buttons", "display_order", "is_active", "alt_text", "cta_text", "cta_link"],
    services: ["category_id", "name", "slug", "description", "duration_minutes", "price", "media_id", "featured", "is_active", "alt_text", "tag", "href", "card_type", "type", "display_order", "page_id", "icon"],
  service_categories: ["name", "slug", "description", "icon", "display_order", "is_active", "page_id"],
  // Packages/charges: client manages content fields only â€” service_id is
  // derived from the route slug server-side; id/timestamps are read-only.
  service_charges: ["name", "description", "price", "unit", "status", "is_active", "sort_order"],
  menu_items: ["page_id", "category_id", "name", "description", "price", "media_id", "display_order", "is_active", "slug", "alt_text", "category", "type", "is_featured"],
  menu_categories: ["name", "slug", "description", "display_order", "is_active"],
  staff: ["profile_id", "employee_number", "full_name", "email", "phone", "position", "bio", "photo_url", "hire_date", "is_active"],
  staff_availability: ["staff_id", "weekday", "start_time", "end_time", "is_available"],
  staff_leave: ["staff_id", "leave_type", "start_date", "end_date", "reason", "approval_status", "approved_by", "approved_at", "notes"],
  customers: ["full_name", "phone", "email", "gender", "date_of_birth", "notes", "marketing_opt_in", "is_active"],
  bookings: ["booking_number", "customer_id", "service_id", "staff_id", "booking_date", "start_time", "end_time", "guests", "status", "special_requests", "guest_name", "guest_phone", "guest_email", "created_by"],
  booking_notes: ["booking_id", "author_id", "note", "is_private"],
  booking_history: ["booking_id", "changed_by", "previous_status", "new_status", "remarks"],
    notifications: ["profile_id", "booking_id", "title", "message", "type", "is_read", "read_at", "entity_type", "entity_id"],
  activity_logs: ["profile_id", "action", "table_name", "record_id"],
  gallery: ["title", "description", "media_id", "category", "alt_text", "display_order", "is_featured", "is_active", "uploaded_by", "type", "page_id"],
  // Google-owned content protection (clean GBP path): customer_name, rating
  // and comment are Google-owned on source='google' rows and are synced
  // server-side (never via generic client CRUD). The future sync route
  // writes them through the service-role client, bypassing this allowlist.
  // ZT-owned fields remain writable. media_id is the canonical image
  // reference; image_url is a legacy display-only field (DEPRECATED —
  // kept in DB for backward compatibility, not writable via admin API).
  testimonials: ["media_id", "occupation", "is_featured", "approved", "display_order", "page_id"],
  contact_messages: ["full_name", "phone", "email", "subject", "message", "status", "replied_by", "replied_at"],
  media_assets: ["alt_text", "title", "description", "category"],
  faqs: ["question", "answer", "display_order", "is_active", "category", "page_id", "is_featured"],
  promotions: ["title", "description", "discount_percent", "start_date", "end_date", "is_active", "page_id", "media_id", "show_on_homepage", "display_order"],
  system_settings: ["booking_buffer_minutes", "max_booking_days", "allow_online_booking", "require_staff_assignment", "enable_email_notifications", "enable_sms_notifications", "maintenance_mode"],
  business_closures: ["closure_date", "title", "reason", "affects_online_booking", "is_closed", "created_by"],
  notification_queue: ["booking_id", "customer_id", "profile_id", "notification_type", "recipient", "subject", "message", "scheduled_at", "sent_at", "retry_count", "status", "error_message"],
  file_uploads: ["bucket", "path", "original_name", "mime_type", "file_size", "uploaded_by", "uploaded_filename", "uploaded_mime_type", "content_hash"],
  membership_plans: ["name", "slug", "description", "annual_price", "registration_fee", "media_id", "display_order", "is_active", "cta_text", "cta_link", "updated_by"],
  membership_plan_benefits: ["plan_id", "description", "display_order", "is_active"],
  customer_memberships: ["customer_id", "plan_id", "status", "notes"],
};

// ============================================================
// HELPERS
// ============================================================

function sanitizePayload(
  table: string,
  payload: Record<string, any>,
  extraAllowed: string[] = []
): Record<string, any> {
  const allowed = [...(WRITABLE_FIELDS[table] ?? []), ...extraAllowed];
  const result: Record<string, any> = {};

  if (!allowed.length) {
    return result;
  }

  for (const key of allowed) {
    if (key in payload && payload[key] !== undefined) {
      result[key] = payload[key];
    }
  }

  return result;
}

// ============================================================
// SCHEMA-RESILIENT COLUMN RESOLUTION
// ============================================================
// Some optional columns (e.g. notifications.entity_type/entity_id) are part
// of the canonical contract but only exist once their migration is applied.
// When PostgREST reports an unknown column we remember it and PRUNE it for
// subsequent queries, so the app degrades gracefully to the pre-migration
// shape instead of returning 500 to the UI. Once the migration is applied the
// full canonical columns are returned again â€” the cache is per-process and
// re-derived on the next "does not exist" error.
const schemaIncomplete = new Map<string, Set<string>>();

function parseMissingColumn(message: string): string | null {
  const m = message.match(/column\s+.*?\.(\w+)\s+does not exist/);
  return m ? m[1] : null;
}

function selectableColumns(table: string): string {
  const allowlist = RESPONSE_ALLOWLISTS[table];
  if (!allowlist) return "*";
  const missing = schemaIncomplete.get(table);
  if (!missing || missing.size === 0) return allowlist.join(",");
  const cols = allowlist.filter((col) => !missing.has(col));
  return cols.length > 0 ? cols.join(",") : "*";
}

function noteMissingColumn(table: string, message: string): void {
  const col = parseMissingColumn(message);
  if (!col) return;
  const missing = schemaIncomplete.get(table) ?? new Set<string>();
  missing.add(col);
  schemaIncomplete.set(table, missing);
}

function filterResponse(table: string, row: Record<string, any> | null): Record<string, any> | null {
  if (!row) return null;

  const allowlist = RESPONSE_ALLOWLISTS[table];

  if (!allowlist) {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(row)) {
      if (!SENSITIVE_FIELDS.has(key) && !IMMUTABLE_FIELDS.has(key)) {
        result[key] = value;
      }
    }
    // Apply contract mapping after filtering
    return mapToPublicContract(table, result);
  }

  const result: Record<string, any> = {};
  for (const col of allowlist) {
    if (col in row) {
      result[col] = row[col];
    }
  }

  // Apply contract mapping after filtering (snake_case â†’ camelCase)
  return mapToPublicContract(table, result);
}

function filterResponseArray(table: string, rows: any[]): any[] {
  return rows.map((row) => filterResponse(table, row)).filter((row) => row !== null);
}

// ============================================================
// REPOSITORY CLASS
// ============================================================

export interface FindAllOptions {
  orderBy?: { column: string; ascending?: boolean };
  limit?: number;
  offset?: number;
  filters?: Record<string, any>;
  search?: string;
  searchFields?: string[];
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export class Repository {
  private supabase: SupabaseClient<any>;

  constructor(supabase: SupabaseClient<any>) {
    this.supabase = supabase;
  }

  /**
   * Build the shared list query: allowlisted columns + filters + search + sort.
   * Does NOT apply pagination â€” callers decide between .range() slicing
   * (findAll) or fetching the full matching set (findAllMatching).
   */
  private buildListQuery(table: string, options?: FindAllOptions): any {
    if (!validateResource(table)) {
      throw new Error("Invalid resource");
    }

    const resolvedTable = resolveTableName(table);
    const selectColumns = selectableColumns(resolvedTable);

    let query: any = this.supabase.from(resolvedTable).select(selectColumns, { count: "exact" });

    if (options?.filters) {
      for (const [key, value] of Object.entries(options.filters)) {
        // Accept BOTH shapes: plain scalar ("slug": "events") and the
        // structured form ("price": { operator: "gte", value: 100 }) used by
        // the generic [resource] routes. Plain scalars must be applied as-is,
        // otherwise the destructured .value of a string is undefined.
        const isStructured =
          typeof value === "object" && value !== null &&
          (("operator" in (value as any)) || ("value" in (value as any)));
        const raw = isStructured ? (value as any).value : value;
        if (raw !== undefined && raw !== null && raw !== "") {
          const operator = isStructured ? (value as any).operator : undefined;
          if (operator && operator !== "eq") {
            query = query.filter(operator, key, raw);
          } else {
            query = query.eq(key, raw);
          }
        }
      }
    }

    // Default: exclude soft-deleted services unless caller explicitly requests them
    if (resolvedTable === "services" && !options?.filters?.deleted_at) {
      query = query.is("deleted_at", null);
    }

    if (options?.search && options?.searchFields?.length) {
      const searchTerm = options.search;
      const searchValidation = validateSearchTerm(searchTerm);
      if (!searchValidation.valid) {
        throw new Error("Search term too long");
      }

      const conditions = options.searchFields
        .filter((field) => validateSearchField(table, field))
        .map((field) => `${field}.ilike.%${searchTerm}%`)
        .join(",");
      if (conditions) {
        query = query.or(conditions);
      }
    }

    if (options?.orderBy?.column) {
      const column = options.orderBy.column;
      if (!validateOrderBy(table, column)) {
        throw new Error("Invalid sort column");
      }
      query = query.order(column, { ascending: options.orderBy.ascending ?? false });
    }

    return query;
  }

  async findAll(table: string, options?: FindAllOptions): Promise<PaginatedResult<any>> {
    const limit = Math.min(100, Math.max(1, options?.limit ?? 10));
    const offset = Math.max(0, options?.offset ?? 0);
    const page = Math.floor(offset / limit) + 1;

    const { data, error, count } = await this.buildListQuery(table, options).range(
      offset,
      offset + limit - 1
    );

    if (error) {
      noteMissingColumn(resolveTableName(table), error.message);
      throw new Error(error.message);
    }

    const total = count ?? 0;
    const totalPages = Math.ceil(total / limit);

    let enrichedData = filterResponseArray(resolveTableName(table), data ?? []);

    // Enrich bookings with customer identity fallback
    if (table === "bookings" && enrichedData.length > 0) {
      enrichedData = await this.enrichBookingsWithCustomerIdentity(enrichedData);
    }

    return {
      data: enrichedData,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Enrich bookings with customer identity fields using COALESCE logic:
   * - If customer_id exists, fetch from customers table
   * - Otherwise, use guest_* snapshot fields
   */
  private async enrichBookingsWithCustomerIdentity(bookings: any[]): Promise<any[]> {
    // Extract unique customer IDs (filter out nulls)
    const customerIds = [...new Set(
      bookings
        .map(b => b.customerId)
        .filter(id => id != null)
    )];

    // Fetch customer data if needed
    let customersById: Map<string, any> = new Map();
    if (customerIds.length > 0) {
      const { data: customers, error } = await this.supabase
        .from("customers")
        .select("id, full_name, phone, email")
        .in("id", customerIds);

      if (!error && customers) {
        customersById = new Map(customers.map(c => [c.id, c]));
      }
    }

    // Enrich each booking with customer identity
    return bookings.map(booking => {
      const customer = booking.customerId ? customersById.get(booking.customerId) : null;

      return {
        ...booking,
        // COALESCE: customer data OR guest snapshot
        customerName: customer?.full_name ?? booking.guestName ?? "â€”",
        customerPhone: customer?.phone ?? booking.guestPhone ?? "â€”",
        customerEmail: customer?.email ?? booking.guestEmail ?? "",
      };
    });
  }

  /**
   * Fetch ALL rows matching filters/search/sort WITHOUT database-level pagination.
   * Intended for resources whose row visibility depends on application-layer
   * rules that cannot be expressed as a single SQL predicate (e.g. canonical
   * customers verified via their bookings). The caller MUST apply canonical
   * filtering and page slicing itself. Use only for bounded datasets.
   */
  async findAllMatching(table: string, options?: FindAllOptions): Promise<any[]> {
    const { data, error } = await this.buildListQuery(table, options);

    if (error) {
      noteMissingColumn(resolveTableName(table), error.message);
      throw new Error(error.message);
    }

    return filterResponseArray(resolveTableName(table), data ?? []);
  }

  async findById(table: string, id: string): Promise<any | null> {
    if (!validateResource(table)) {
      throw new Error("Invalid resource");
    }

    const resolvedTable = resolveTableName(table);
    const selectColumns = selectableColumns(resolvedTable);

    const { data, error } = await this.supabase
      .from(resolvedTable)
      .select(selectColumns)
      .eq("id", id)
      .single();

    // Exclude soft-deleted services from lookup
    if (resolvedTable === "services" && data && !(data as any).error && (data as any).deleted_at) {
      return null;
    }

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      noteMissingColumn(resolvedTable, error.message);
      throw new Error(error.message);
    }

    return filterResponse(resolvedTable, data);
  }

  async create(table: string, payload: any, serverFields: string[] = []): Promise<any> {
    if (!validateResource(table)) {
      throw new Error("Invalid resource");
    }

    const resolvedTable = resolveTableName(table);
    // serverFields: columns the ROUTE derives server-side (e.g. service_id
    // resolved from the URL slug) that stay non-client-writable.
    const sanitized = sanitizePayload(resolvedTable, payload, serverFields);

    const selectColumns = selectableColumns(resolvedTable);

    const { data, error } = await this.supabase
      .from(resolvedTable)
      .insert(sanitized)
      .select(selectColumns)
      .single();

        if (error) {
      // Postgres 23514 = CHECK constraint violation → client-input problem.
      // Postgres 23505 = UNIQUE constraint violation → client-input problem.
      // Throw ValidationError (mapped to HTTP 400 by routes) with a safe message
      // that never exposes PostgreSQL internals. Constraint itself is preserved.
      if ((error as any).code === '23514') {
        throw new ValidationError(constraintValidationMessage(error.message));
      }
      if ((error as any).code === '23505') {
        throw new ValidationError(uniqueConstraintMessage(error.message));
      }
      throw new Error(error.message);
    }

    return filterResponse(resolvedTable, data);
  }

  async update(table: string, id: string, payload: any, serverFields: string[] = []): Promise<any> {
    if (!validateResource(table)) {
      throw new Error("Invalid resource");
    }

    const resolvedTable = resolveTableName(table);
    // serverFields: columns a ROUTE HANDLER derives server-side (e.g. expires_at
    // and price snapshots computed by MembershipHandler) that stay non-client-
    // writable. Mirrors the create() contract.
    const sanitized = sanitizePayload(resolvedTable, payload, serverFields);

    // Empty payload after sanitization = nothing client-writable requested.
    // No-op: return the current row instead of issuing an invalid empty UPDATE.
    if (Object.keys(sanitized).length === 0) {
      return this.findById(table, id);
    }

    const selectColumns = selectableColumns(resolvedTable);

    const { data, error } = await this.supabase
      .from(resolvedTable)
      .update(sanitized)
      .eq("id", id)
      .select(selectColumns)
      .single();

        if (error) {
      // Postgres 23514 = CHECK constraint violation → client-input problem.
      // Postgres 23505 = UNIQUE constraint violation → client-input problem.
      // Throw ValidationError (mapped to HTTP 400 by routes) with a safe message
      // that never exposes PostgreSQL internals. Constraint itself is preserved.
      if ((error as any).code === '23514') {
        throw new ValidationError(constraintValidationMessage(error.message));
      }
      if ((error as any).code === '23505') {
        throw new ValidationError(uniqueConstraintMessage(error.message));
      }
      throw new Error(error.message);
    }

    return filterResponse(resolvedTable, data);
  }

  async delete(table: string, id: string): Promise<void> {
    if (!validateResource(table)) {
      throw new Error("Invalid resource");
    }

    const resolvedTable = resolveTableName(table);

    const { error } = await this.supabase
      .from(resolvedTable)
      .delete()
      .eq("id", id);

    if (error) {
      // Preserve PostgreSQL error metadata (e.g. code "23503" foreign_key_violation)
      // so the API layer can map it to 409 DEPENDENT_RECORDS. Discarding error.code
      // made that branch unreachable and degraded FK-protected deletes to HTTP 500.
      const wrapped = new Error(error.message) as Error & {
        code?: string;
        details?: string | null;
        hint?: string | null;
      };
      wrapped.code = error.code;
      wrapped.details = error.details;
      wrapped.hint = error.hint;
      throw wrapped;
    }
  }

  async batchDelete(table: string, ids: string[]): Promise<number> {
    if (!ids.length) return 0;

    const resolvedTable = resolveTableName(table);

    const { error } = await this.supabase
      .from(resolvedTable)
      .delete()
      .in("id", ids);

    if (error) {
      throw new Error(error.message);
    }

    return ids.length;
  }

  async count(table: string, filters?: Record<string, any>): Promise<number> {
    if (!validateResource(table)) {
      throw new Error("Invalid resource");
    }

    const resolvedTable = resolveTableName(table);
    let query: any = this.supabase.from(resolvedTable).select("*", { count: "exact", head: true });

    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null && value !== "") {
          query = query.eq(key, value);
        }
      }
    }

    const { count, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    return count ?? 0;
  }
}
