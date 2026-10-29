import { NextRequest, NextResponse } from "next/server";

import { withAdminAuth, withContentManagerAuth, withSuperAdminAuth } from "@/lib/auth/server";

import { Repository } from "@/lib/repository";

import { BookingHandler, isBookingResource } from "@/lib/booking-handler";

import { MembershipHandler, isMembershipResource } from "@/lib/membership-handler";

import { resolveImageUrls } from "@/lib/media/resolver";

import {
  validateResource,

  validateRecordId,

  notFoundError,

  validationError,

  errorResultToResponse,

  isDedicatedRouteOnlyResource,

} from "@/lib/validation/admin";
import { logCrudOperation } from "@/lib/audit/logger";
import { isPublicPageKey } from "@/lib/constants/public-pages";

import { assertPageOwnership, assertPageAssignment } from "@/lib/page-scope";

import { validateMediaCategoryForMutation } from "@/lib/media/category-mapping";



export const dynamic = "force-dynamic";

export const revalidate = 0;



/** Content resources that managers can access */

const CONTENT_RESOURCES = new Set(["gallery", "testimonials"]);

/** Resources reserved for SUPER ADMIN — commerce/product definitions AND staff
 *  role/profile administration. Role & profile writes must never be admin-writable
 *  (business rule: only super_admin may change staff roles / manage staff members). */
const SUPER_ADMIN_RESOURCES = new Set([
  "membership-plans",
  "membership-plan-benefits",
  "roles",
  "profiles",
]);



/** Determine which auth wrapper to use based on resource type */

function getAuthWrapper(resource: string) {
  return SUPER_ADMIN_RESOURCES.has(resource) ? withSuperAdminAuth : CONTENT_RESOURCES.has(resource) ? withContentManagerAuth : withAdminAuth;
}



/** Extract resource and ID from request URL */

function extractResourceAndId(req: NextRequest): [string, string] {

  const url = new URL(req.url);

  const path = url.pathname.replace("/api/admin/", "");

  const [table, id] = path.split("/");

  return [table, id];

}



export const GET = async (req: NextRequest, ctx: any) => {

   const [table, id] = extractResourceAndId(req);

   const authWrapper = getAuthWrapper(table);

   

   return authWrapper(async (req, _ctx, auth) => {

     try {

       const repo = new Repository(auth.supabase as any);



       if (!validateResource(table)) {

         return notFoundError("Resource not found");

       }

       if (isDedicatedRouteOnlyResource(table)) {
         return notFoundError("Resource not found");
       }

       if (!validateRecordId(id)) {

         return validationError("Invalid ID format");

       }

       // Page-first ownership guard (page-scoped resources only): the record's
       // own page_id must equal the selected website page (?page_id=). Knowing
       // the record UUID alone is never sufficient. No-op for other resources.
       const ownership = await assertPageOwnership(req, repo, table, id);

       if (ownership) {
         return NextResponse.json({ error: ownership.error }, { status: ownership.status });
       }

       let data = await repo.findById(table, id);

       if (!data) {

         return notFoundError("Record not found");

       }



       // Resolve media URL for resources that support media_id

       const MEDIA_RESOURCES = new Set(["menu-items", "services", "gallery", "hero-slides", "promotions"]);

       if (MEDIA_RESOURCES.has(table)) {

         const resolved = await resolveImageUrls(auth.supabase as any, [data]);

         data = resolved[0];

       }



        // Canonical branding only: media_id -> media_assets.public_url.
        // Legacy logo_url/favicon_url fields are not present in the live schema
        // and must never be used as fallback sources.
        if (table === "business-settings") {
          const mediaIds = [data.logo_media_id, data.favicon_media_id].filter(
            (value: unknown): value is string => typeof value === "string" && value.length > 0,
          );
          const mediaMap = new Map<string, string>();

          if (mediaIds.length > 0) {
            const { data: assets, error } = await auth.supabase
              .from("media_assets")
              .select("id, public_url")
              .in("id", mediaIds);

            if (error) {
              console.error("[business-settings] canonical branding lookup failed:", error.message);
              throw new Error("Unable to resolve canonical branding media");
            }

            for (const asset of assets ?? []) {
              if (asset.public_url) mediaMap.set(asset.id, asset.public_url);
            }
          }

          data.resolved_logo_url = data.logo_media_id ? mediaMap.get(data.logo_media_id) ?? null : null;
          data.resolved_favicon_url = data.favicon_media_id ? mediaMap.get(data.favicon_media_id) ?? null : null;
        }



       // Notifications are per-recipient: findById() is scoped to `id` only;
       // the notifications RLS is employee-wide (is_employee()), so an admin
       // must be re-checked against their own profile_id before leaking
       // another admin's notification. Fail-closed 404 (no record disclosure).
       // Mirrors the ownership guard applied on PATCH and DELETE below.
       if (table === "notifications" && data.profileId !== auth.profile.id) {
         return notFoundError("Notification not found or access denied");
       }

       return NextResponse.json(data);

     } catch (error) {

       console.error(`[${table}] GET /${id} error:`, error);

       return NextResponse.json({ error: "Internal server error" }, { status: 500 });

     }

   })(req, ctx);

};



export const PATCH = async (req: NextRequest, ctx: any) => {

  const [table, id] = extractResourceAndId(req);

  const authWrapper = getAuthWrapper(table);

  

  return authWrapper(async (req, _ctx, auth) => {

    try {

      const repo = new Repository(auth.supabase as any);



      if (!validateResource(table)) {

        return notFoundError("Resource not found");

      }

      if (isDedicatedRouteOnlyResource(table)) {
        return notFoundError("Resource not found");
      }

      if (!validateRecordId(id)) {

        return validationError("Invalid ID format");

      }

      // Page-first ownership guard (page-scoped resources only): the record's
      // own page_id must equal the selected website page (?page_id=). Knowing
      // the record UUID alone is never sufficient. No-op for other resources.
      const ownership = await assertPageOwnership(req, repo, table, id);

      if (ownership) {

        return NextResponse.json({ error: ownership.error }, { status: ownership.status });

      }



      const body = await req.json();

      // Page-transition guard: a page-scoped record may only be mutated inside the
      // page context it is scoped to. assertPageOwnership (above) proved the record
      // BELONGS to that page; this proves the request does not try to MOVE it to a
      // different one. Runs before any resource branch and before repo.update(), so
      // an unauthorised page change is rejected rather than silently applied.
      const assignment = assertPageAssignment(req, table, body);

      if (assignment) {

        return NextResponse.json({ error: assignment.error }, { status: assignment.status });

      }



      // Special handling for bookings with validation, status transitions, and conflict detection

      if (isBookingResource(table)) {

        const handler = new BookingHandler(repo);

        const result = await handler.update(id, body);

        

        // If result is a NextResponse (error), return it directly

        if (result instanceof NextResponse) {

          return result;

        }

        

        // Otherwise return the updated booking

        if (!result.success) {

          // ActionError/ResultError: narrow union before touching result.data

          return NextResponse.json({ error: "Booking update failed" }, { status: 400 });

        }

        return NextResponse.json(result.data);

      }



      // Ownership boundary: notifications can only be marked read/unread by their owner.

      // The generic [resource] API must never allow cross-admin mutations on

      // notifications. When resource is notifications, scope the update to

      // profile_id = auth.profile.id. This prevents one admin from marking

      // another's notifications as read or unread via direct API call.

      if (table === "notifications") {

        // For notifications, verify ownership: fetch the current record first.

        const existing = await repo.findById(table, id);

        // findById() returns the PUBLIC CONTRACT (mapToPublicContract), so the

        // recipient column arrives as camelCase profileId, NOT the snake_case

        // profile_id database column. Comparing against profile_id resolved

        // to undefined and rejected EVERY caller, including the owner. This guard

        // is fail-closed: correct the field, never relax the predicate.

        if (!existing || existing.profileId !== auth.profile.id) {

          return notFoundError("Notification not found or access denied");

        }



        // Mark-read / mark-unread is a SERVER-CONTROLLED read-state flip.

        // The caller may only request { isRead: true | false }; every other field

        // (profile_id, type, entity_type, entity_id, booking_id) is discarded so

        // an admin cannot take ownership of another's notification nor alter its

        // identity. read_at is derived server-side: set on read, cleared (null)

        // on unread. body is parsed once at the top of PATCH.

        // sanitizePayload() allowlists snake_case is_read and read_at only, so

        // the server-built snake_case payload is the only thing reaching UPDATE.

        const wantRead = body?.isRead !== false; // default true (backward compatible)

        const data = await repo.update(table, id, {

          is_read: wantRead,

          read_at: wantRead ? new Date().toISOString() : null,

        });

        return NextResponse.json(data);

      }



      // Promotions: server-side page_id validation (optional placement target).
      // The admin UI restricts the selector to PUBLIC_PAGE_KEYS, but the API
      // must not trust the client - reject nonexistent / dead-key pages.
      if (table === "promotions" && body?.page_id) {
        const page = await repo.findById("website-pages", String(body.page_id));
        if (!page || !isPublicPageKey(page.page_key)) {
          return validationError("Promotion page must reference a served public website page");
        }
      }

      // Media category validation: ensure media_id references an asset with the
      // correct category for this content table (e.g., hero_slides requires category=hero).
      // Enforced at three layers: database triggers, API validation, and UI filtering.
      if (body?.media_id) {
        const categoryValidation = await validateMediaCategoryForMutation(
          auth.supabase,
          table,
          body.media_id
        );
        if (!categoryValidation.valid) {
          return validationError(categoryValidation.error);
        }
      }

      // Services: validate that category_id references an active category
      if (table === "services" && body?.category_id) {
        const cat = await repo.findById("service-categories", body.category_id);
        if (!cat) {
          return validationError("Selected service category does not exist");
        }
        if (!cat.is_active) {
          return validationError("Cannot assign service to an inactive category");
        }
      }

      // Membership lifecycle authority (F-1): customer-membership PATCH must
      // never reach the generic repo.update() back door. customer_id/plan_id
      // are immutable (change = cancel + create); only status (validated
      // transition) + notes flow through MembershipHandler.update().
      if (isMembershipResource(table)) {
        const forbidden = ["customer_id", "plan_id"].filter((k) => body?.[k] !== undefined);
        if (forbidden.length > 0) {
          return validationError(
            `Membership ${forbidden.join(", ")} is immutable. Use cancel + create to change package or customer.`
          );
        }

        const handler = new MembershipHandler(repo);
        const result = await handler.update(id, body);
        if (!result.success) {
          return errorResultToResponse(result);
        }

        await logCrudOperation(
          auth.supabase,
          "customer_memberships",
          "UPDATE",
          id,
          auth.profile.id,
          req,
          "UPDATE membership via lifecycle handler (status/notes only)"
        );

        return NextResponse.json(result.data);
      }

      // Team member (profiles) status toggling — fail-closed, server-side rules.
      if (table === "profiles") {
        const allowedKeys = ["is_active"];
        const extraKeys = Object.keys(body).filter((k) => !allowedKeys.includes(k));
        if (extraKeys.length > 0) {
          return validationError("Only is_active can be changed for a team member");
        }
        if (typeof body.is_active !== "boolean") {
          return validationError("is_active must be a boolean");
        }

        const existing = await repo.findById(table, id);
        if (!existing) {
          return notFoundError("Team member not found");
        }

        // Self-action protection: a member cannot change their own status.
        if (existing.id === auth.profile.id) {
          return NextResponse.json({ error: "You cannot change your own status" }, { status: 409 });
        }

        // Last active super admin protection: never deactivate the final active super admin.
        if (existing.is_active === true && body.is_active === false) {
          // Resolve the target's role (profiles response does not include role_id).
          const { data: targetProfile } = await auth.supabase
            .from("profiles")
            .select("id, is_active, roles(name)")
            .eq("id", id)
            .single();
          const targetRoleName = (targetProfile as any)?.roles?.name;
          if (targetRoleName === "super_admin") {
            const { data: activeSuperAdmins } = await auth.supabase
              .from("profiles")
              .select("id, is_active, roles(name)");
            const count = (activeSuperAdmins ?? []).filter(
              (p: any) => p.is_active === true && p.roles?.name === "super_admin"
            ).length;
            if (count <= 1) {
              return NextResponse.json(
                { error: "At least one active Super Admin must remain" },
                { status: 409 }
              );
            }
          }
        }

        const data = await repo.update(table, id, { is_active: body.is_active });
        await logCrudOperation(
          auth.supabase,
          "profiles",
          "UPDATE",
          id,
          auth.profile.id,
          req,
          `Set team member status to ${body.is_active ? "active" : "inactive"}`
        );
        return NextResponse.json(data);
      }

      // Generic handling for other resources
      const data = await repo.update(table, id, body);
      return NextResponse.json(data);

    } catch (error) {

      console.error(`[${table}] PATCH /${id} error:`, error);

      return NextResponse.json({ error: "Internal server error" }, { status: 500 });

    }

  })(req, ctx);

};



export const DELETE = async (req: NextRequest, ctx: any) => {

  const [table, id] = extractResourceAndId(req);

  const authWrapper = getAuthWrapper(table);

  

  return authWrapper(async (req, _ctx, auth) => {

    try {

      const repo = new Repository(auth.supabase as any);



      if (!validateResource(table)) {

        return notFoundError("Resource not found");

      }

      if (isDedicatedRouteOnlyResource(table)) {
        return notFoundError("Resource not found");
      }

      if (!validateRecordId(id)) {

        return validationError("Invalid ID format");

      }



      // Page-first ownership guard: a page-scoped record may only be deleted
      // from the website page that owns it.
      const ownership = await assertPageOwnership(req, repo, table, id);

      if (ownership) {

        return NextResponse.json({ error: ownership.error }, { status: ownership.status });

      }



      // Notifications are per-recipient: an admin may only delete their own.

      // The generic repo.delete() is scoped to `id` only (RLS is employee-wide),

      // so re-check ownership here to mirror the GET/PATCH guards.

      if (table === "notifications") {

        const existing = await repo.findById(table, id);

        if (!existing || existing.profileId !== auth.profile.id) {

          return notFoundError("Notification not found or access denied");

        }

      }



      // Membership lifecycle authority (F-1): membership history is
      // preserved — cancellation is lifecycle state, never hard deletion.
      // Route callers through the explicit cancel endpoint instead.
      if (isMembershipResource(table)) {
        return NextResponse.json(
          { error: "Memberships cannot be deleted. Use POST /api/admin/customer-memberships/[id]/cancel to end a membership (record preserved)." },
          { status: 409 }
        );
      }

      // Services: soft-delete via deleted_at instead of hard remove
      if (table === "services") {
        await repo.update(table, id, { deleted_at: new Date().toISOString() });
        return new NextResponse(null, { status: 204 });
      }

      // Team member (profiles) deletion — dependency-aware hard delete with
      // self / last-super-admin protection. Hard delete is only possible when
      // no operational records reference the profile (FK NO ACTION/RESTRICT).
      if (table === "profiles") {
        const existing = await repo.findById(table, id);
        if (!existing) {
          return notFoundError("Team member not found");
        }
        if (existing.id === auth.profile.id) {
          return NextResponse.json({ error: "You cannot delete your own account" }, { status: 409 });
        }
        // Last active super admin protection
        const { data: targetProfile } = await auth.supabase
          .from("profiles")
          .select("id, is_active, roles(name)")
          .eq("id", id)
          .single();
        const targetRoleName = (targetProfile as any)?.roles?.name;
        if (targetRoleName === "super_admin") {
          const { data: activeSuperAdmins } = await auth.supabase
            .from("profiles")
            .select("id, is_active, roles(name)");
          const count = (activeSuperAdmins ?? []).filter(
            (p: any) => p.is_active === true && p.roles?.name === "super_admin"
          ).length;
          // Treat the target as active for this count even though we're deleting.
          if ((existing as any).is_active === true && count <= 1) {
            return NextResponse.json(
              { error: "At least one active Super Admin must remain" },
              { status: 409 }
            );
          }
        }

        try {
          await repo.delete(table, id);
        } catch (err: any) {
          if (err?.code === "23503" || /foreign key/i.test(String(err?.message))) {
            return NextResponse.json(
              {
                error:
                  "This team member has dependent records and cannot be deleted. Deactivate them instead.",
              },
              { status: 409 }
            );
          }
          throw err;
        }

        // Best-effort removal of the linked auth user.
        try {
          const adminClient = (await import("@/lib/supabase/admin")).getSupabaseAdmin();
          await adminClient.auth.admin.deleteUser(id);
        } catch (authErr) {
          console.warn("[profiles] DELETE auth user failed:", authErr);
        }

        await logCrudOperation(
          auth.supabase,
          "profiles",
          "DELETE",
          id,
          auth.profile.id,
          req,
          "Deleted team member"
        );
        return new NextResponse(null, { status: 204 });
      }

      await repo.delete(table, id);
      return new NextResponse(null, { status: 204 });

    } catch (error) {

      console.error(`[${table}] DELETE /${id} error:`, error);

      return NextResponse.json({ error: "Internal server error" }, { status: 500 });

    }

  })(req, ctx);

};

