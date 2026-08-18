import {
  LayoutDashboard,
  CalendarCheck,
  Users,
  Sparkles,
  UtensilsCrossed,
  Images,
  Image,
  Globe,
  MessageSquareQuote,
  BadgePercent,
  Inbox,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { label: string; href: string; icon: LucideIcon };

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Bookings", href: "/dashboard/bookings", icon: CalendarCheck },
  { label: "Customers", href: "/dashboard/customers", icon: Users },
  { label: "Services", href: "/dashboard/services", icon: Sparkles },
  { label: "Menu", href: "/dashboard/menu", icon: UtensilsCrossed },
  { label: "Gallery", href: "/dashboard/gallery", icon: Images },
  { label: "Media Library", href: "/dashboard/media", icon: Image },
  { label: "Website CMS", href: "/dashboard/website", icon: Globe },
  { label: "Testimonials", href: "/dashboard/testimonials", icon: MessageSquareQuote },
  { label: "Promotions", href: "/dashboard/promotions", icon: BadgePercent },
  { label: "Messages", href: "/dashboard/messages", icon: Inbox },
  { label: "Team", href: "/dashboard/team", icon: Users },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
];
