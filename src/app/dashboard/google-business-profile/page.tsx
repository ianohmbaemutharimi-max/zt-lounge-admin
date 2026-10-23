import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/server";
import { GoogleBusinessProfileView } from "@/features/google-business-profile/google-business-profile-view";

/**
 * Google Business Profile CONNECTION surface — SUPER ADMIN ONLY.
 *
 * This page configures the Google connection (OAuth, location selection, sync
 * health). It does NOT list or moderate reviews: that stays on
 * /dashboard/testimonials, which remains the single review-management UI.
 *
 * Authorization is enforced server-side here (requireSuperAdmin) AND
 * independently by withSuperAdminAuth on every /api/admin/google/* route.
 * Hiding the nav entry is UX only, never the authorization boundary.
 */
export default async function GoogleBusinessProfilePage() {
  const auth = await requireSuperAdmin();

  if (!auth.ok) {
    redirect("/dashboard");
  }

  return <GoogleBusinessProfileView />;
}
