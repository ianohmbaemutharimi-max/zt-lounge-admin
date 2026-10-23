import * as schema from "@/db/schema";
import type { PgTable } from "drizzle-orm/pg-core";

/** Maps URL resource segments to the existing database tables. */
export const RESOURCE_MAP: Record<string, PgTable> = {
  bookings: schema.bookings,
  "booking-history": schema.bookingHistory,
  "booking-notes": schema.bookingNotes,
  customers: schema.customers,
  services: schema.services,
  "service-categories": schema.serviceCategories,
  "menu-items": schema.menuItems,
  "menu-categories": schema.menuCategories,
  staff: schema.staff,
  gallery: schema.gallery,
  "file-uploads": schema.fileUploads,
  testimonials: schema.testimonials,
  "contact-messages": schema.contactMessages,
  faqs: schema.faqs,
  promotions: schema.promotions,
  "hero-slides": schema.heroSlides,
  "website-pages": schema.websitePages,
  "business-settings": schema.businessSettings,
  "system-settings": schema.systemSettings,
  notifications: schema.notifications,
  "activity-logs": schema.activityLogs,
  "business-closures": schema.businessClosures,
  "service-charges": schema.serviceCharges,
};

/** Fields that should never be set directly from a request body. */
export function sanitize(body: Record<string, unknown>) {
  const { id, createdAt, updatedAt, ...rest } = body ?? {};
  return rest;
}

export async function logActivity(action: string, entity: string, entityId?: number, details?: string) {
  const { db } = await import("@/db");
  try {
    await db.insert(schema.activityLogs).values({ action, tableName: entity, recordId: entityId ? String(entityId) : null, details });
  } catch {
    // activity logging must never break the main operation
  }
}
