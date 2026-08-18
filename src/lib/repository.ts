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
} from "@/lib/validation/admin";
import { getResourceConfig } from "@/lib/resource-config";

function resolveTableName(resource: string): string {
  const config = getResourceConfig(resource);
  return config?.table ?? resource;
}

// ============================================================
// IMMUTABLE FIELDS — always stripped from client input
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
// SENSITIVE FIELDS — never returned in API responses
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
  business_settings: ["id", "business_name", "email", "phone", "address", "google_maps_url", "whatsapp", "facebook", "instagram", "opening_hours", "logo_url", "favicon_url", "timezone", "currency", "tagline", "description", "twitter", "youtube", "city", "country", "latitude", "longitude", "created_at", "updated_at"],
  website_pages: ["id", "page_key", "title", "subtitle", "content", "seo_title", "seo_description", "updated_by", "created_at", "updated_at"],
   hero_slides: ["id", "page_id", "badge", "title", "highlight", "subtitle", "image_url", "media_id", "buttons", "display_order", "is_active", "created_at", "updated_at", "alt_text", "cta_text", "cta_link"],
   services: ["id", "category_id", "name", "slug", "description", "duration_minutes", "price", "image_url", "media_id", "featured", "is_active", "created_at", "updated_at", "alt_text", "tag", "href", "type", "display_order", "page_id", "icon"],
   service_categories: ["id", "name", "slug", "description", "icon", "display_order", "is_active", "created_at", "updated_at"],
   menu_items: ["id", "page_id", "category_id", "name", "description", "price", "image_url", "media_id", "display_order", "is_active", "created_at", "updated_at", "slug", "alt_text", "category", "type", "is_featured"],
   menu_categories: ["id", "name", "slug", "description", "display_order", "is_active", "created_at", "updated_at"],
  staff: ["id", "profile_id", "employee_number", "full_name", "email", "phone", "position", "bio", "photo_url", "hire_date", "is_active", "created_at", "updated_at"],
  staff_availability: ["id", "staff_id", "weekday", "start_time", "end_time", "is_available", "created_at", "updated_at"],
  staff_leave: ["id", "staff_id", "leave_type", "start_date", "end_date", "reason", "approval_status", "approved_by", "approved_at", "notes", "created_at", "updated_at"],
  customers: ["id", "full_name", "phone", "email", "gender", "date_of_birth", "notes", "marketing_opt_in", "is_active", "created_at", "updated_at"],
  bookings: ["id", "booking_number", "customer_id", "service_id", "staff_id", "booking_date", "start_time", "end_time", "guests", "status", "special_requests", "created_by", "created_at", "updated_at"],
  booking_notes: ["id", "booking_id", "author_id", "note", "is_private", "created_at"],
  booking_history: ["id", "booking_id", "changed_by", "previous_status", "new_status", "remarks", "created_at"],
   notifications: ["id", "profile_id", "booking_id", "title", "message", "type", "is_read", "read_at", "created_at"],
  activity_logs: ["id", "profile_id", "action", "table_name", "record_id", "created_at", "updated_at"],
  gallery: ["id", "title", "description", "image_url", "media_id", "category", "alt_text", "display_order", "is_featured", "is_active", "uploaded_by", "created_at", "updated_at", "type", "page_id"],
   testimonials: ["id", "customer_name", "image_url", "occupation", "rating", "comment", "is_featured", "approved", "created_at", "display_order", "page_id"],
   contact_messages: ["id", "full_name", "phone", "email", "subject", "message", "status", "replied_by", "replied_at", "created_at"],
   media_assets: ["id", "bucket", "path", "public_url", "original_name", "mime_type", "file_size", "width", "height", "alt_text", "title", "created_at", "updated_at"],
   faqs: ["id", "question", "answer", "display_order", "is_active", "category", "page_id", "is_featured", "created_at", "updated_at"],
  promotions: ["id", "title", "description", "banner_image", "discount_percent", "start_date", "end_date", "is_active", "created_at", "updated_at"],
  system_settings: ["id", "booking_buffer_minutes", "max_booking_days", "allow_online_booking", "require_staff_assignment", "enable_email_notifications", "enable_sms_notifications", "maintenance_mode", "created_at", "updated_at"],
  business_closures: ["id", "closure_date", "title", "reason", "affects_online_booking", "is_closed", "created_by", "created_at", "updated_at"],
  notification_queue: ["id", "booking_id", "customer_id", "profile_id", "notification_type", "recipient", "subject", "message", "scheduled_at", "sent_at", "retry_count", "status", "error_message", "created_at", "updated_at"],
  file_uploads: ["id", "bucket", "path", "original_name", "mime_type", "file_size", "uploaded_by", "created_at", "uploaded_filename", "uploaded_mime_type", "content_hash"],
};

// ============================================================
// WRITABLE FIELD ALLOWLISTS
// ============================================================
const WRITABLE_FIELDS: Record<string, string[]> = {
  roles: ["name", "description"],
  profiles: ["full_name", "phone", "avatar_url", "is_active"],
  business_settings: ["business_name", "email", "phone", "address", "google_maps_url", "whatsapp", "facebook", "instagram", "opening_hours", "logo_url", "favicon_url", "timezone", "currency", "tagline", "description", "twitter", "youtube", "city", "country", "latitude", "longitude"],
  website_pages: ["page_key", "title", "subtitle", "content", "seo_title", "seo_description", "updated_by"],
  hero_slides: ["page_id", "badge", "title", "highlight", "subtitle", "image_url", "media_id", "buttons", "display_order", "is_active", "alt_text", "cta_text", "cta_link"],
  services: ["category_id", "name", "slug", "description", "duration_minutes", "price", "image_url", "media_id", "featured", "is_active", "alt_text", "tag", "href", "type", "display_order", "page_id", "icon"],
  service_categories: ["name", "slug", "description", "icon", "display_order", "is_active"],
  menu_items: ["page_id", "category_id", "name", "description", "price", "image_url", "media_id", "display_order", "is_active", "slug", "alt_text", "category", "type", "is_featured"],
  menu_categories: ["name", "slug", "description", "display_order", "is_active"],
  staff: ["profile_id", "employee_number", "full_name", "email", "phone", "position", "bio", "photo_url", "hire_date", "is_active"],
  staff_availability: ["staff_id", "weekday", "start_time", "end_time", "is_available"],
  staff_leave: ["staff_id", "leave_type", "start_date", "end_date", "reason", "approval_status", "approved_by", "approved_at", "notes"],
  customers: ["full_name", "phone", "email", "gender", "date_of_birth", "notes", "marketing_opt_in", "is_active"],
  bookings: ["booking_number", "customer_id", "service_id", "staff_id", "booking_date", "start_time", "end_time", "guests", "status", "special_requests", "created_by"],
  booking_notes: ["booking_id", "author_id", "note", "is_private"],
  booking_history: ["booking_id", "changed_by", "previous_status", "new_status", "remarks"],
  notifications: ["profile_id", "booking_id", "title", "message", "type", "is_read", "read_at"],
  activity_logs: ["profile_id", "action", "table_name", "record_id"],
  gallery: ["title", "description", "image_url", "media_id", "category", "alt_text", "display_order", "is_featured", "is_active", "uploaded_by", "type", "page_id"],
  testimonials: ["customer_name", "image_url", "occupation", "rating", "comment", "is_featured", "approved", "display_order", "page_id"],
  contact_messages: ["full_name", "phone", "email", "subject", "message", "status", "replied_by", "replied_at"],
  media_assets: ["alt_text", "title"],
  faqs: ["question", "answer", "display_order", "is_active", "category", "page_id", "is_featured"],
  promotions: ["title", "description", "banner_image", "discount_percent", "start_date", "end_date", "is_active"],
  system_settings: ["booking_buffer_minutes", "max_booking_days", "allow_online_booking", "require_staff_assignment", "enable_email_notifications", "enable_sms_notifications", "maintenance_mode"],
  business_closures: ["closure_date", "title", "reason", "affects_online_booking", "is_closed", "created_by"],
  notification_queue: ["booking_id", "customer_id", "profile_id", "notification_type", "recipient", "subject", "message", "scheduled_at", "sent_at", "retry_count", "status", "error_message"],
  file_uploads: ["bucket", "path", "original_name", "mime_type", "file_size", "uploaded_by", "uploaded_filename", "uploaded_mime_type", "content_hash"],
};

// ============================================================
// HELPERS
// ============================================================

function sanitizePayload(table: string, payload: Record<string, any>): Record<string, any> {
  const allowed = WRITABLE_FIELDS[table];
  const result: Record<string, any> = {};

  if (!allowed) {
    return result;
  }

  for (const key of allowed) {
    if (key in payload && payload[key] !== undefined) {
      result[key] = payload[key];
    }
  }

  return result;
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
    return result;
  }

  const result: Record<string, any> = {};
  for (const col of allowlist) {
    if (col in row) {
      result[col] = row[col];
    }
  }

  return result;
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

  async findAll(table: string, options?: FindAllOptions): Promise<PaginatedResult<any>> {
    if (!validateResource(table)) {
      throw new Error("Invalid resource");
    }

    const resolvedTable = resolveTableName(table);
    const allowlist = RESPONSE_ALLOWLISTS[resolvedTable];
    const selectColumns = allowlist ? allowlist.join(",") : "*";

    const limit = Math.min(100, Math.max(1, options?.limit ?? 10));
    const offset = Math.max(0, options?.offset ?? 0);
    const page = Math.floor(offset / limit) + 1;

    let query: any = this.supabase.from(resolvedTable).select(selectColumns, { count: "exact" });

    if (options?.filters) {
      for (const [key, value] of Object.entries(options.filters)) {
        if (value !== undefined && value !== null && value !== "") {
          const { operator, value: filterValue } = value as any;
          if (operator && operator !== "eq") {
            query = query.filter(operator, key, filterValue);
          } else {
            query = query.eq(key, filterValue);
          }
        }
      }
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

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      throw new Error(error.message);
    }

    const total = count ?? 0;
    const totalPages = Math.ceil(total / limit);

    return {
      data: filterResponseArray(resolvedTable, data ?? []),
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

  async findById(table: string, id: string): Promise<any | null> {
    if (!validateResource(table)) {
      throw new Error("Invalid resource");
    }

    const resolvedTable = resolveTableName(table);
    const allowlist = RESPONSE_ALLOWLISTS[resolvedTable];
    const selectColumns = allowlist ? allowlist.join(",") : "*";

    const { data, error } = await this.supabase
      .from(resolvedTable)
      .select(selectColumns)
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      throw new Error(error.message);
    }

    return filterResponse(resolvedTable, data);
  }

  async create(table: string, payload: any): Promise<any> {
    if (!validateResource(table)) {
      throw new Error("Invalid resource");
    }

    const resolvedTable = resolveTableName(table);
    const sanitized = sanitizePayload(resolvedTable, payload);

    const allowlist = RESPONSE_ALLOWLISTS[resolvedTable];
    const selectColumns = allowlist ? allowlist.join(",") : "*";

    const { data, error } = await this.supabase
      .from(resolvedTable)
      .insert(sanitized)
      .select(selectColumns)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return filterResponse(resolvedTable, data);
  }

  async update(table: string, id: string, payload: any): Promise<any> {
    if (!validateResource(table)) {
      throw new Error("Invalid resource");
    }

    const resolvedTable = resolveTableName(table);
    const sanitized = sanitizePayload(resolvedTable, payload);

    const allowlist = RESPONSE_ALLOWLISTS[resolvedTable];
    const selectColumns = allowlist ? allowlist.join(",") : "*";

    const { data, error } = await this.supabase
      .from(resolvedTable)
      .update(sanitized)
      .eq("id", id)
      .select(selectColumns)
      .single();

    if (error) {
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
      throw new Error(error.message);
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