import { NextRequest, NextResponse } from "next/server";
import { withAdminAuth, withContentManagerAuth } from "@/lib/auth/server";
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
} from "@/lib/validation/admin";

export const dynamic = "force-dynamic";

/** Content resources that managers can access */
const CONTENT_RESOURCES = new Set(["gallery", "testimonials"]);

/** Determine which auth wrapper to use based on resource type */
function getAuthWrapper(resource: string) {
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
       }

       const result = await repo.findAll(resource, {
         limit: validatedLimit,
         offset: validatedOffset,
         orderBy: orderBy ? { column: orderBy, ascending: url.searchParams.get("ascending") !== "false" } : undefined,
         search: search ?? undefined,
         searchFields: searchFieldsParam ? searchFieldsParam.split(",") : undefined,
         filters,
       });

        // Resolve media URLs for resources that support media_id
        const MEDIA_RESOURCES = new Set(["menu-items", "services", "gallery", "hero-slides"]);
        let data = result.data ?? [];
        if (MEDIA_RESOURCES.has(resource) && data.length > 0) {
          try {
            data = await resolveImageUrls(auth.supabase as any, data);
          } catch (resolveError) {
            console.error(`[${resource}] resolveImageUrls error:`, resolveError);
            // Continue without resolved URLs rather than failing the entire request
          }
        }

        return NextResponse.json(data, {
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

      // Special handling for bookings with validation and conflict detection
      if (isBookingResource(resource)) {
        const handler = new BookingHandler(repo);
        const result = await handler.create(body);
        
        // If result is a NextResponse (error), return it directly
        if (result instanceof NextResponse) {
          return result;
        }
        
        // Otherwise return the created booking
        return NextResponse.json(result.data, { status: 201 });
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
