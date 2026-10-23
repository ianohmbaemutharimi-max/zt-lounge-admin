import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Singleton browser Supabase client for the entire application.
 * 
 * This ensures only ONE GoTrueClient instance exists in the browser,
 * avoiding the "Multiple GoTrueClient instances detected" warning.
 * 
 * All client components should import and use this client instead of
 * creating their own instances.
 * 
 * NOTE: The reset-password page intentionally uses a separate client
 * with persistSession:false to support Supabase's implicit recovery flow.
 * That's the only exception to this singleton pattern.
 */

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowser(): SupabaseClient {
  if (typeof window === "undefined") {
    throw new Error("getSupabaseBrowser can only be called in browser context");
  }

  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }

  return browserClient;
}

/**
 * Supabase-ready connection layer.
 *
 * The dashboard's data access goes through `src/lib/api.ts` →
 * `/api/admin/[resource]` route handlers, which currently talk to the
 * database via the server-side client below. When the project is pointed
 * at a hosted Supabase instance, set NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY and swap the implementation of the route
 * handlers to use `getSupabaseConfig()` — no UI code changes required.
 */
export function getSupabaseConfig() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    isConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
  };
}

/** Table names in the existing schema — single source of truth. */
export const TABLES = [
  "roles",
  "profiles",
  "business_settings",
  "website_pages",
  "hero_slides",
  "services",
  "service_categories",
  "menu_items",
  "menu_categories",
  "staff",
  "staff_availability",
  "staff_leave",
  "customers",
  "bookings",
  "booking_history",
  "booking_notes",
  "notifications",
  "activity_logs",
  "gallery",
  "testimonials",
  "contact_messages",
  "faqs",
  "promotions",
  "system_settings",
  "business_closures",
  "file_uploads",
] as const;
