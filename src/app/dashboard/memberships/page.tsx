import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/server";
import { MembershipsCms } from "@/features/memberships/memberships-cms";

/**
 * Membership PRODUCT/CMS editor (plans + benefits) — SUPER ADMIN ONLY.
 *
 * Distinct from /dashboard/members, which handles customer membership
 * OPERATIONS (assign/renew/cancel) and stays admin-accessible.
 *
 * Authorization is enforced server-side here (requireSuperAdmin). A plain
 * `admin` who navigates directly to /dashboard/memberships is redirected.
 * The API layer (withSuperAdminAuth on /api/admin/membership-plans*) enforces
 * the same boundary independently — this page guard is defense-in-depth.
 */
export default async function MembershipsCmsPage() {
  const auth = await requireSuperAdmin();

  if (!auth.ok) {
    redirect("/dashboard"); // plain admin: operational-only, silently bounce
  }

  return <MembershipsCms />;
}