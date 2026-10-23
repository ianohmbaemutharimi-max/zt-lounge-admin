/**
 * Centralized React Query key factory.
 * Use these helpers instead of inline string arrays to
 * keep cache invalidation consistent across the app.
 */
export const queryKeys = {
  bookings: {
    all: () => ["bookings"] as const,
    detail: (id?: string | number | null) => ["bookings", id] as const,
  },
  customers: {
    all: () => ["customers"] as const,
  },
  services: {
    all: () => ["services"] as const,
  },
  staff: {
    all: () => ["staff"] as const,
  },
  gallery: {
    all: () => ["gallery"] as const,
  },
  testimonials: {
    all: () => ["testimonials"] as const,
  },
  promotions: {
    all: () => ["promotions"] as const,
  },
    messages: {
    all: () => ["contact-messages"] as const,
    pending: () => ["contact-messages", "pending"] as const,
  },
  notifications: {
    all: () => ["notifications"] as const,
    unread: () => ["notifications", "unread"] as const,
  },
  "booking-notes": {
    all: (bookingId?: string | number | null) => ["booking-notes", bookingId] as const,
  },
  "booking-history": {
    all: (bookingId?: string | number | null) => ["booking-history", bookingId] as const,
  },
  "hero-slides": {
    all: () => ["hero-slides"] as const,
    pageId: (pageId?: string | null) => ["hero-slides", pageId] as const,
  },
  "website-pages": {
    all: () => ["website-pages"] as const,
  },
  "business-settings": {
    all: () => ["business-settings"] as const,
  },
  "system-settings": {
    all: () => ["system-settings"] as const,
  },
  stats: {
    all: () => ["stats"] as const,
  },
  dashboard: {
    stats: () => ["dashboard", "stats"] as const,
  },
  media: {
    all: () => ["media_assets"] as const,
  },
  "membership-plans": {
    all: () => ["membership-plans"] as const,
    detail: (id?: string | number | null) => ["membership-plans", id] as const,
  },
  "membership-plan-benefits": {
    all: () => ["membership-plan-benefits"] as const,
  },
  "customer-memberships": {
    all: () => ["customer-memberships"] as const,
  },
} as const;
