export const RESOURCE_CONFIG: Record<string, {
  table: string;
  searchFields?: string[];
  defaultSort?: { column: string; ascending?: boolean };
}> = {
  bookings: {
    table: "bookings",
    searchFields: ["booking_number", "customer_id", "service_category_id"],
    defaultSort: { column: "created_at", ascending: false },
  },
  "booking-history": {
    table: "booking_history",
    defaultSort: { column: "created_at", ascending: false },
  },
  "booking-notes": {
    table: "booking_notes",
    defaultSort: { column: "created_at", ascending: false },
  },
  customers: {
    table: "customers",
    searchFields: ["full_name", "email", "phone"],
    defaultSort: { column: "created_at", ascending: false },
  },
  services: {
    table: "services",
    searchFields: ["name", "description"],
    defaultSort: { column: "display_order", ascending: true },
  },
  "service-categories": {
    table: "service_categories",
    searchFields: ["name", "description"],
    defaultSort: { column: "display_order", ascending: true },
  },
  "menu-items": {
    table: "menu_items",
    searchFields: ["name", "description", "category"],
    defaultSort: { column: "display_order", ascending: true },
  },
  "menu-categories": {
    table: "menu_categories",
    searchFields: ["name", "description"],
    defaultSort: { column: "display_order", ascending: true },
  },
  staff: {
    table: "staff",
    searchFields: ["full_name", "email", "position"],
    defaultSort: { column: "created_at", ascending: false },
  },
  "staff-availability": {
    table: "staff_availability",
    defaultSort: { column: "weekday", ascending: true },
  },
  "staff-leave": {
    table: "staff_leave",
    defaultSort: { column: "start_date", ascending: false },
  },
  gallery: {
    table: "gallery",
    searchFields: ["title", "category", "description"],
    defaultSort: { column: "display_order", ascending: true },
  },
   "file-uploads": {
     table: "file_uploads",
     defaultSort: { column: "created_at", ascending: false },
   },
   media_assets: {
     table: "media_assets",
     defaultSort: { column: "created_at", ascending: false },
   },
   testimonials: {
    table: "testimonials",
    searchFields: ["customer_name", "comment"],
    defaultSort: { column: "display_order", ascending: true },
  },
  "contact-messages": {
    table: "contact_messages",
    searchFields: ["full_name", "email", "message"],
    defaultSort: { column: "created_at", ascending: false },
  },
  faqs: {
    table: "faqs",
    searchFields: ["question", "answer", "category"],
    defaultSort: { column: "display_order", ascending: true },
  },
  promotions: {
    table: "promotions",
    searchFields: ["title", "description"],
    defaultSort: { column: "start_date", ascending: false },
  },
  "hero-slides": {
    table: "hero_slides",
    defaultSort: { column: "display_order", ascending: true },
  },
  "website-pages": {
    table: "website_pages",
    searchFields: ["title", "page_key", "seo_title"],
    defaultSort: { column: "page_key", ascending: true },
  },
  "business-settings": {
    table: "business_settings",
  },
  "system-settings": {
    table: "system_settings",
  },
  notifications: {
    table: "notifications",
    defaultSort: { column: "created_at", ascending: false },
  },
  "activity-logs": {
    table: "activity_logs",
    defaultSort: { column: "created_at", ascending: false },
  },
  "business-closures": {
    table: "business_closures",
    defaultSort: { column: "closure_date", ascending: true },
  },
  profiles: {
    table: "profiles",
    searchFields: ["full_name", "email"],
    defaultSort: { column: "created_at", ascending: false },
  },
  roles: {
    table: "roles",
    defaultSort: { column: "name", ascending: true },
  },
  "membership-plans": {
    table: "membership_plans",
    searchFields: ["name", "slug", "description"],
    defaultSort: { column: "display_order", ascending: true },
  },
  "membership-plan-benefits": {
    table: "membership_plan_benefits",
    searchFields: ["description"],
    defaultSort: { column: "display_order", ascending: true },
  },
  "customer-memberships": {
    table: "customer_memberships",
    searchFields: ["member_number", "customer_id"],
    defaultSort: { column: "registered_at", ascending: false },
  },
  "service-charges": {
    table: "service_charges",
    searchFields: ["name"],
    defaultSort: { column: "sort_order", ascending: true },
  },
};

export function getResourceConfig(resource: string) {
  return RESOURCE_CONFIG[resource];
}