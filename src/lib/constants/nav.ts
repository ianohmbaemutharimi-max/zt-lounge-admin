import {
  LayoutDashboard,
  CalendarCheck,
  Users,
  ShieldCheck,
  Sparkles,
  UtensilsCrossed,
  Images,
  Image,
  Globe,
  MessageSquareQuote,
  BadgePercent,
  Star,
  Inbox,
  Bell,
  Settings,
  MapPin,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /**
   * When true, this entry is a CMS management surface visible only to the
   * super_admin (system owner) role. Plain `admin` accounts are operational
   * only and MUST NOT see it. The page itself additionally enforces
   * requireSuperAdmin server-side — hiding nav is UX, not authorization.
   */
  superAdminOnly?: boolean;
};
export type NavGroup = {
  label: string;
  href?: string;
  icon: LucideIcon;
  children: NavItem[];
};

/**
 * Admin information architecture.
 *
 * Contact Inbox is a PARENT GROUP owning two child routes:
 *   /dashboard/messages        → Contact Inbox / Messages   (operational workspace)
 *   /dashboard/notifications   → Contact Inbox / Notifications (notification history)
 *
 * There is intentionally NO standalone top-level "Notifications" item.
 */
export type NavEntry = NavItem | NavGroup;

export const CONTACT_INBOX_HREF = "/dashboard/messages";

/**
 * Canonical Contact Inbox child destinations. Rendered inside the sidebar
 * popup (ContactInboxNav) — they are NOT standalone top-level sidebar items.
 */
export const CONTACT_INBOX_CHILDREN: NavItem[] = [
  { label: "Messages", href: "/dashboard/messages", icon: Inbox },
  { label: "Notifications", href: "/dashboard/notifications", icon: Bell },
];

export const NAV_ENTRIES: NavEntry[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Bookings", href: "/dashboard/bookings", icon: CalendarCheck },
  { label: "Customers", href: "/dashboard/customers", icon: Users },
  { label: "Members", href: "/dashboard/members", icon: ShieldCheck },
  // Membership PRODUCT/CMS editor (plans + benefits) — super_admin only.
  // Conceptually distinct from "Members" (customer membership operations).
  { label: "Memberships", href: "/dashboard/memberships", icon: Star, superAdminOnly: true },
  { label: "Services", href: "/dashboard/services", icon: Sparkles },
  { label: "Menu", href: "/dashboard/menu", icon: UtensilsCrossed },
  { label: "Gallery", href: "/dashboard/gallery", icon: Images },
  { label: "Media Library", href: "/dashboard/media", icon: Image },
  { label: "Website CMS", href: "/dashboard/website", icon: Globe },
  { label: "Testimonials", href: "/dashboard/testimonials", icon: MessageSquareQuote },
  // Google Business Profile CONNECTION surface (OAuth, location selection,
  // sync health). Review moderation itself stays on Testimonials - this page
  // never lists reviews. super_admin only: it administers Google credentials.
  { label: "Google Business Profile", href: "/dashboard/google-business-profile", icon: MapPin, superAdminOnly: true },
  { label: "Promotions", href: "/dashboard/promotions", icon: BadgePercent },
  {
    label: "Contact Inbox",
    href: CONTACT_INBOX_HREF,
    icon: Inbox,
    children: CONTACT_INBOX_CHILDREN,
  },
  { label: "Team", href: "/dashboard/team", icon: Users },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
];

// Backwards-compatible flat projection for any code that still maps NAV_ITEMS.
export const NAV_ITEMS: NavItem[] = NAV_ENTRIES.flatMap((entry) =>
  "children" in entry ? entry.children : [entry]
);

/** True when the given pathname is within the Contact Inbox group. */
export function isContactInboxPath(pathname: string): boolean {
  return pathname === "/dashboard/messages" || pathname === "/dashboard/notifications";
}

/** Resolve the active child for the Contact Inbox group based on pathname. */
export function contactInboxChildHref(pathname: string): string {
  if (pathname.startsWith("/dashboard/notifications")) return "/dashboard/notifications";
  return "/dashboard/messages";
}
