import { NextRequest, NextResponse } from "next/server";
import { withAdminAuth, withContentManagerAuth, withSuperAdminAuth } from "@/lib/auth/server";
import { MembershipHandler, isMembershipResource } from "@/lib/membership-handler";
import { Repository } from "@/lib/repository";
import { BookingHandler, isBookingResource } from "@/lib/booking-handler";
import { resolveImageUrls } from "@/lib/media/resolver";
import {
  validateResource,
  validateOrderBy,
  validateSearchField,
  validatePagination,
  validateSearchTerm,
  validateFilterField,
  validateFilterOperator,
  validationError,
  notFoundError,
  errorResultToResponse,
  isDedicatedRouteOnlyResource,
} from "@/lib/validation/admin";
import { PAGE_SCOPED_RESOURCES } from "@/lib/page-scope";
import { logCrudOperation } from "@/lib/audit/logger";
import { isPublicPageKey } from "@/lib/constants/public-pages";
import { validateMediaCategoryForMutation } from "@/lib/media/category-mapping";

export const dynamic = "force-dynamic";

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
  if (SUPER_ADMIN_RESOURCES.has(resource)) return withSuperAdminAuth;
  return CONTENT_RESOURCES.has(resource) ? withContentManagerAuth : withAdminAuth;
}

/** Extract resource from dynamic route parameter */
function extractResource(params: any): string {
  return params?.resource ?? "";
}

export const GET = async (req: NextRequest, context: { params: Promise<{ resource: string }> }) => {
   const resolvedParams = await context.params;
   const resource = extractResource(resolvedParams);
   const authWrapper = getAuthWrapper(resource);
   
   return authWrapper(async (req, _ctx: { params: Promise<{ resource: string }> }, auth) => {
     try {
       const repo = new Repository(auth.supabase as any);
       const url = new URL(req.url);

       if (!validateResource(resource)) {
         return notFoundError("Resource not found");
       }

       if (isDedicatedRouteOnlyResource(resource)) {
         return notFoundError("Resource not found");
       }

       const limit = Number(url.searchParams.get("limit") ?? 10);
       const offset = Number(url.searchParams.get("offset") ?? 0);
       const { page, limit: validatedLimit, offset: validatedOffset } = validatePagination(1, limit, offset);

       const orderBy = url.searchParams.get("orderBy");
       if (orderBy && !validateOrderBy(resource, orderBy)) {
         return validationError("Invalid sort column");
       }

       const search = url.searchParams.get("search");
       if (search) {
         const searchValidation = validateSearchTerm(search);
         if (!searchValidation.valid) {
           return validationError("Search term too long (max 200 characters)");
         }
       }

       const searchFieldsParam = url.searchParams.get("searchFields");
       if (searchFieldsParam) {
         const requestedFields = searchFieldsParam.split(",");
         for (const field of requestedFields) {
           if (!validateSearchField(resource, field)) {
             return validationError(`Invalid search field: ${field}`);
           }
         }
       }

       const filters: Record<string, any> = {};
       for (const [key, value] of url.searchParams.entries()) {
         if (key.startsWith("filter:")) {
           const filterField = key.slice(7);
           if (!validateFilterField(resource, filterField)) {
             return validationError(`Invalid filter field: ${filterField}`);
           }

           if (value.includes(":")) {
             const [operator, ...valParts] = value.split(":");
             const filterValue = valParts.join(":");
             if (!validateFilterOperator(operator)) {
               return validationError(`Invalid filter operator: ${operator}`);
             }
             filters[filterField] = { operator, value: filterValue };
           } else {
             filters[filterField] = { operator: "eq", value };
           }
         }

        // Ownership boundary: notifications list is scoped to authenticated admin.
        // The generic [resource] API must never return another admin's notification rows,
        // so the list query is constrained to profile_id = auth.profile.id server-side.
        // (There is no RLS policy on the notifications table, so this predicate is the
        // authoritative read-scoping — no client-side filtering relies on it.)
        if (resource === "notifications") {
          filters["profile_id"] = auth.profile.id;
        }

       }

const result = await repo.findAll(resource, {
          limit: validatedLimit,
          offset: validatedOffset,
          orderBy: orderBy ? { column: orderBy, ascending: url.searchParams.get("ascending") !== "false" } : undefined,
          search: search ?? undefined,
          searchFields: searchFieldsParam ? searchFieldsParam.split(",") : undefined,
          filters,
        });

        // Build totalVisits per-customer for customers resource
        // source is preserved from the database; do not recalculate origin based on current bookings
        let processedData = result.data ?? [];
        if (resource === "customers" && auth.supabase) {
          // NOTE: the live column is bookings.customer_id (snake_case). Selecting
          // the camelCase alias silently failed with a 400 and left every
          // totalVisits at 0. Errors are now logged rather than discarded.
          const { data: allBookings, error } = await auth.supabase
            .from("bookings")
            .select("customer_id, status")
            .in("status", ["confirmed", "completed"]);
          const countsMap: Record<string, number> = {};
          if (error) {
            console.error(`[${resource}] totalVisits enrichment error:`, error);
          } else if (allBookings) {
            for (const b of allBookings) {
              countsMap[b.customer_id] = (countsMap[b.customer_id] ?? 0) + 1;
            }
          }
          processedData = result.data?.map((customer: any) => ({
            ...customer,
            totalVisits: countsMap[customer.id] ?? 0,
          })) ?? [];
        } else {
          processedData = result.data ?? [];
        }

        // Resolve media URLs for resources that support media_id
        const MEDIA_RESOURCES = new Set(["menu-items", "services", "gallery", "hero-slides", "promotions", "membership-plans", "testimonials"]);
        let data = processedData ?? [];
        if (MEDIA_RESOURCES.has(resource) && data.length > 0) {
          try {
            data = await resolveImageUrls(auth.supabase as any, data);
          } catch (resolveError) {
            console.error(`[${resource}] resolveImageUrls error:`, resolveError);
            // Continue without resolved URLs rather than failing the entire request
          }
        }

        return NextResponse.json({
          data,
          pagination: result.pagination,
        }, {
          headers: {
            "X-Total-Count": String(result.pagination?.total ?? 0),
            "X-Page": String(result.pagination?.page ?? 1),
            "X-Total-Pages": String(result.pagination?.totalPages ?? 1),
            "Access-Control-Expose-Headers": "X-Total-Count, X-Page, X-Total-Pages",
          },
        });
      } catch (error) {
        console.error(`[${resource}] GET error:`, error);
        // Include more details in development
        const details = process.env.NODE_ENV === "development" && error instanceof Error 
          ? { message: error.message, name: error.name }
          : undefined;
        return NextResponse.json({ error: "Internal server error", ...(details ? { details } : {}) }, { status: 500 });
      }
   })(req, context);
};

export const POST = async (req: NextRequest, context: { params: Promise<{ resource: string }> }) => {
  const resolvedParams = await context.params;
  const resource = extractResource(resolvedParams);
  const authWrapper = getAuthWrapper(resource);
  
  return authWrapper(async (req, _ctx: { params: Promise<{ resource: string }> }, auth) => {
    try {
      const repo = new Repository(auth.supabase as any);
      const body = await req.json();

      if (!validateResource(resource)) {
        return notFoundError("Resource not found");
      }

      if (isDedicatedRouteOnlyResource(resource)) {
        return notFoundError("Resource not found");
      }

      // Special handling for bookings with validation and conflict detection
      if (isBookingResource(resource)) {
        const handler = new BookingHandler(repo);
        const result = await handler.create(body);
        
        // ActionResult discriminant is `success` (canonical validation/admin contract).
        if (!result.success) {
          return errorResultToResponse(result);
        }

        // Otherwise return the created booking
                return NextResponse.json(result.data, { status: 201 });
      }
      // Membership: customer-membership assignment is server-orchestrated
      // (member_number via DB sequence; annual price snapshots). Must route
      // through MembershipHandler — a generic repo.create() would strip the
      // server-derived NOT NULL columns and the insert would fail. (See audit §10.)
      if (isMembershipResource(resource)) {
        const handler = new MembershipHandler(repo);
        const result = await handler.create(body);
        if (!result.success) {
          return errorResultToResponse(result);
        }
        await logCrudOperation(
          auth.supabase,
          "customer_memberships",
          "CREATE",
          result.data?.id ? String(result.data.id) : null,
          auth.profile.id,
          req,
          "CREATE membership: assigned via collection POST (annual period + price snapshots)"
        );
        return NextResponse.json(result.data, { status: 201 });
      }

      // Page-first boundary (page-scoped content): a record is created inside a
      // selected website page. The client states that page as ?page_id=; it must
      // be present and must agree with the body's page_id, and the referenced
      // page must actually exist. This removes two pre-existing holes: creating
      // a record with page_id = NULL, and letting the body silently choose a
      // different page than the one the operator is working in.
      if (PAGE_SCOPED_RESOURCES.has(resource)) {
        const scopePageId = req.nextUrl.searchParams.get("page_id");
        if (!scopePageId) {
          return validationError(`A website page must be selected to create a ${resource} record`);
        }
        if (body?.page_id !== scopePageId) {
          return validationError(`${resource} page_id must match the selected website page`);
        }
        const page = await repo.findById("website-pages", scopePageId);
        if (!page) {
          return validationError("Selected website page does not exist");
        }
      }

      // Promotions: page_id is optional, but when provided it must reference a
      // published, public website page. Reject nonexistent / dead-key pages
      // server-side (the admin UI restricts the selector to PUBLIC_PAGE_KEYS,
      // but the API must not trust the client).
      if (resource === "promotions" && body?.page_id) {
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
          resource,
          body.media_id
        );
        if (!categoryValidation.valid) {
          return validationError(categoryValidation.error);
        }
      }

      // Services: validate that category_id references an active category
      if (resource === "services" && body?.category_id) {
        const cat = await repo.findById("service-categories", body.category_id);
        if (!cat) {
          return validationError("Selected service category does not exist");
        }
        if (!cat.is_active) {
          return validationError("Cannot assign service to an inactive category");
        }
      }

      // Generic handling for other resources
      const created = await repo.create(resource, body);
      return NextResponse.json(created, { status: 201 });
    } catch (error) {
      console.error(`[${resource}] POST error:`, error);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  })(req, context);
};
