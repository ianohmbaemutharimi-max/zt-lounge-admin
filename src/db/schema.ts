import {
  pgTable,
  uuid,
  text,
  integer,
  smallint,
  numeric,
  boolean,
  timestamp,
  date,
  time,
  jsonb,
  serial,
} from "drizzle-orm/pg-core";

// ─── Roles & Profiles ────────────────────────────────────────────────
// Reconciled to match the actual Supabase database (UUID primary keys,
// role_id FK on profiles, roles table created by migration 008).
export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").unique(),
  fullName: text("full_name").notNull(),
  phone: text("phone"),
  roleId: uuid("role_id").references(() => roles.id, { onDelete: "set null" }).notNull(),
  avatarUrl: text("avatar_url"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Media Library ───────────────────────────────────────────────────
export const mediaAssets = pgTable("media_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  bucket: text("bucket").notNull(),
  path: text("path").notNull(),
  publicUrl: text("public_url").notNull(),
  originalName: text("original_name"),
  mimeType: text("mime_type"),
  fileSize: integer("file_size"),
  width: integer("width"),
  height: integer("height"),
  altText: text("alt_text"),
  title: text("title"),
  contentHash: text("content_hash"),
  uploadedBy: uuid("uploaded_by").references(() => profiles.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Business / System Settings ──────────────────────────────────────
export const businessSettings = pgTable("business_settings", {
  id: smallint("id").primaryKey().default(1),
  businessName: text("business_name").notNull(),
  tagline: text("tagline"),
  description: text("description"),
  phone: text("phone"),
  whatsapp: text("whatsapp"),
  email: text("email"),
  address: text("address"),
  city: text("city"),
  country: text("country"),
  latitude: numeric("latitude"),
  longitude: numeric("longitude"),
  googleMapsUrl: text("google_maps_url"),
  facebook: text("facebook"),
  instagram: text("instagram"),
  openingHours: jsonb("opening_hours"),
  socialLinks: jsonb("social_links"),
  currency: text("currency").default("KES").notNull(),
  timezone: text("timezone").default("Africa/Nairobi").notNull(),
  logoUrl: text("logo_url"),
  faviconUrl: text("favicon_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const systemSettings = pgTable("system_settings", {
  id: serial("id").primaryKey(),
  bookingBufferMinutes: integer("booking_buffer_minutes").default(30),
  maxBookingDays: integer("max_booking_days").default(90),
  allowOnlineBooking: boolean("allow_online_booking").default(true),
  requireStaffAssignment: boolean("require_staff_assignment").default(false),
  enableEmailNotifications: boolean("enable_email_notifications").default(true),
  enableSmsNotifications: boolean("enable_sms_notifications").default(false),
  maintenanceMode: boolean("maintenance_mode").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Website CMS ─────────────────────────────────────────────────────
export const websitePages = pgTable("website_pages", {
  id: uuid("id").primaryKey().defaultRandom(),
  pageKey: text("page_key").notNull().unique(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  subtitle: text("subtitle"),
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  content: jsonb("content"),
  isPublished: boolean("is_published").default(true).notNull(),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const heroSlides = pgTable("hero_slides", {
  id: uuid("id").primaryKey().defaultRandom(),
  pageId: uuid("page_id"),
  badge: text("badge").default(""),
  title: text("title").default(""),
  highlight: text("highlight").default(""),
  subtitle: text("subtitle").default(""),
  imageUrl: text("image_url").default(""),
  mediaId: uuid("media_id").references(() => mediaAssets.id, { onDelete: "set null" }),
  altText: text("alt_text").default(""),
  ctaText: text("cta_text").default(""),
  ctaLink: text("cta_link").default(""),
  buttons: jsonb("buttons").default([]),
  displayOrder: integer("display_order").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Services ────────────────────────────────────────────────────────
export const serviceCategories = pgTable("service_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug"),
  description: text("description"),
  icon: text("icon"),
  displayOrder: integer("display_order").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const services = pgTable("services", {
  id: uuid("id").primaryKey().defaultRandom(),
  categoryId: uuid("category_id").references(() => serviceCategories.id, { onDelete: "restrict" }).notNull(),
  name: text("name").notNull(),
  slug: text("slug"),
  description: text("description"),
  durationMinutes: integer("duration_minutes").default(60),
  price: numeric("price").default("0").notNull(),
  imageUrl: text("image_url"),
  mediaId: uuid("media_id").references(() => mediaAssets.id, { onDelete: "set null" }),
  altText: text("alt_text").default(""),
  tag: text("tag").default(""),
  href: text("href").default(""),
  type: text("type").default("service"),
  displayOrder: integer("display_order").default(0),
  pageId: uuid("page_id"),
  icon: text("icon").default(""),
  featured: boolean("featured").default(false),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Menu ────────────────────────────────────────────────────────────
export const menuCategories = pgTable("menu_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug"),
  description: text("description"),
  displayOrder: integer("display_order").default(0).notNull(),
  pageId: uuid("page_id"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const menuItems = pgTable("menu_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  categoryId: uuid("category_id").references(() => menuCategories.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description").default(""),
  price: numeric("price").default("0").notNull(),
  imageUrl: text("image_url").default(""),
  mediaId: uuid("media_id").references(() => mediaAssets.id, { onDelete: "set null" }),
  altText: text("alt_text").default(""),
  category: text("category").default(""),
  type: text("type").default("item").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  isFeatured: boolean("is_featured").default(false).notNull(),
  displayOrder: integer("display_order").default(0).notNull(),
  pageId: uuid("page_id"),
  slug: text("slug"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Staff ───────────────────────────────────────────────────────────
export const staff = pgTable("staff", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id"),
  employeeNumber: text("employee_number"),
  fullName: text("full_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  position: text("position").notNull(),
  bio: text("bio"),
  photoUrl: text("photo_url"),
  hireDate: date("hire_date"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const staffAvailability = pgTable("staff_availability", {
  id: uuid("id").primaryKey().defaultRandom(),
  staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  dayOfWeek: integer("weekday").notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  isAvailable: boolean("is_available").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const staffLeave = pgTable("staff_leave", {
  id: uuid("id").primaryKey().defaultRandom(),
  staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  leaveType: text("leave_type").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  reason: text("reason"),
  approvalStatus: text("approval_status").default("pending").notNull(),
  approvedBy: uuid("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Customers ───────────────────────────────────────────────────────
export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").unique(),
  fullName: text("full_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  gender: text("gender"),
  dateOfBirth: date("date_of_birth"),
  notes: text("notes"),
  marketingOptIn: boolean("marketing_opt_in").default(false),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Bookings ────────────────────────────────────────────────────────
export const bookings = pgTable("bookings", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookingNumber: text("booking_number").notNull().unique(),
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "restrict" }),
  serviceId: uuid("service_id").references(() => services.id, { onDelete: "restrict" }),
  staffId: uuid("staff_id").references(() => staff.id, { onDelete: "restrict" }),
  bookingDate: date("booking_date").notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  guests: smallint("guests").default(1).notNull(),
  status: text("status").default("pending").notNull(),
  specialRequests: text("special_requests"),
  cancellationReason: text("cancellation_reason"),
  internalNotes: text("internal_notes"),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const bookingHistory = pgTable("booking_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookingId: uuid("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
  changedBy: text("changed_by"),
  previousStatus: text("previous_status"),
  newStatus: text("new_status").notNull(),
  remarks: text("remarks"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const bookingNotes = pgTable("booking_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookingId: uuid("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
  authorId: uuid("author_id"),
  note: text("note").notNull(),
  isPrivate: boolean("is_private").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Notifications & Activity ────────────────────────────────────────
// NOTE: Remote database does not have updated_at column for notifications table.
// Repository layer (src/lib/repository.ts) correctly omits this column from queries.
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id"),
  bookingId: uuid("booking_id"),
  title: text("title").notNull(),
  message: text("message"),
  type: text("type").default("info").notNull(),
  isRead: boolean("is_read").default(false).notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const activityLogs = pgTable("activity_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id"),
  action: text("action").notNull(),
  tableName: text("table_name"),
  recordId: text("record_id"),
  details: text("details"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  oldData: jsonb("old_data"),
  newData: jsonb("new_data"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Gallery & Files ─────────────────────────────────────────────────
export const gallery = pgTable("gallery", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title"),
  description: text("description"),
  imageUrl: text("image_url").notNull(),
  mediaId: uuid("media_id").references(() => mediaAssets.id, { onDelete: "set null" }),
  category: text("category"),
  altText: text("alt_text"),
  displayOrder: integer("display_order").default(0).notNull(),
  isFeatured: boolean("is_featured").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  uploadedBy: uuid("uploaded_by"),
  type: text("type").default("general"),
  pageId: uuid("page_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const fileUploads = pgTable("file_uploads", {
  id: uuid("id").primaryKey().defaultRandom(),
  bucket: text("bucket").notNull(),
  path: text("path").notNull(),
  originalName: text("original_name"),
  mimeType: text("mime_type"),
  fileSize: integer("file_size"),
  contentHash: text("content_hash"),
  uploadedBy: uuid("uploaded_by"),
  uploadedFilename: text("uploaded_filename"),
  uploadedMimeType: text("uploaded_mime_type"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Testimonials / Messages / FAQs / Promotions ─────────────────────
export const testimonials = pgTable("testimonials", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerName: text("customer_name").notNull(),
  imageUrl: text("image_url"),
  occupation: text("occupation"),
  rating: integer("rating").default(5).notNull(),
  comment: text("comment").notNull(),
  isFeatured: boolean("is_featured").default(false).notNull(),
  approved: boolean("approved").default(false).notNull(),
  displayOrder: integer("display_order").default(0),
  pageId: uuid("page_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const contactMessages = pgTable("contact_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").unique(),
  fullName: text("full_name").notNull(),
  phone: text("phone"),
  email: text("email"),
  subject: text("subject"),
  message: text("message").notNull(),
  status: text("status").default("new").notNull(),
  repliedBy: uuid("replied_by").references(() => profiles.id, { onDelete: "set null" }),
  repliedAt: timestamp("replied_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  // Note: updated_at column does not exist in remote database
  // Remote only has: id, full_name, phone, email, subject, message, status, replied_by, replied_at, created_at
  // Remote replied_by is a UUID FK to profiles(id), not text
});

export const faqs = pgTable("faqs", {
  id: uuid("id").primaryKey().defaultRandom(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  displayOrder: integer("display_order").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  isFeatured: boolean("is_featured").default(false).notNull(),
  category: text("category").default("general"),
  pageId: uuid("page_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const promotions = pgTable("promotions", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description"),
  bannerImage: text("banner_image"),
  discountPercent: numeric("discount_percent").default("0"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const businessClosures = pgTable("business_closures", {
  id: uuid("id").primaryKey().defaultRandom(),
  closureDate: date("closure_date").notNull(),
  title: text("title").notNull(),
  reason: text("reason"),
  affectsOnlineBooking: boolean("affects_online_booking").default(false).notNull(),
  isClosed: boolean("is_closed").default(true).notNull(),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const notificationQueue = pgTable("notification_queue", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookingId: uuid("booking_id"),
  customerId: uuid("customer_id"),
  profileId: uuid("profile_id"),
  notificationType: text("notification_type").notNull(),
  recipient: text("recipient").notNull(),
  subject: text("subject"),
  message: text("message").notNull(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  retryCount: integer("retry_count").default(0).notNull(),
  status: text("status").default("pending").notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Team Invitations ────────────────────────────────────────────────
export const invitations = pgTable("invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  roleId: uuid("role_id").references(() => roles.id, { onDelete: "restrict" }).notNull(),
  invitedBy: uuid("invited_by").references(() => profiles.id, { onDelete: "cascade" }).notNull(),
  profileId: uuid("profile_id").references(() => profiles.id, { onDelete: "cascade" }),
  status: text("status").default("pending").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
