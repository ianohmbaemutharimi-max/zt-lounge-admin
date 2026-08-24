import { NextRequest, NextResponse } from "next/server";
import { withAdminAuth, withContentManagerAuth } from "@/lib/auth/server";
import { Repository } from "@/lib/repository";
import { BookingHandler, isBookingResource } from "@/lib/booking-handler";
import { resolveImageUrls } from "@/lib/media/resolver";
import {
  validateResource,
  validateRecordId,
  notFoundError,
  validationError,
} from "@/lib/validation/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Content resources that managers can access */
const CONTENT_RESOURCES = new Set(["gallery", "testimonials"]);

/** Determine which auth wrapper to use based on resource type */
function getAuthWrapper(resource: string) {
  return CONTENT_RESOURCES.has(resource) ? withContentManagerAuth : withAdminAuth;
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
       if (!validateRecordId(id)) {
         return validationError("Invalid ID format");
       }

       let data = await repo.findById(table, id);
       if (!data) {
         return notFoundError("Record not found");
       }

       // Resolve media URL for resources that support media_id
       const MEDIA_RESOURCES = new Set(["menu-items", "services", "gallery", "hero-slides"]);
       if (MEDIA_RESOURCES.has(table)) {
         const resolved = await resolveImageUrls(auth.supabase as any, [data]);
         data = resolved[0];
       }

        // Special handling for business_settings: resolve logo and favicon
        if (table === "business-settings") {
          const mediaIds = new Set<string>();
          if (data.logo_media_id) mediaIds.add(data.logo_media_id);
          if (data.favicon_media_id) mediaIds.add(data.favicon_media_id);

          if (mediaIds.size > 0) {
            const { data: assets, error } = await auth.supabase
              .from("media_assets")
              .select("id, public_url")
              .in("id", Array.from(mediaIds));

            if (!error && assets) {
              const mediaMap = new Map(assets.map((a: any) => [a.id, a.public_url]));
              
              // Resolve logo: prioritize media_assets.public_url, fallback to logo_url
              data.resolved_logo_url = data.logo_media_id && mediaMap.has(data.logo_media_id)
                ? mediaMap.get(data.logo_media_id)
                : data.logo_url || null;
              
              // Resolve favicon: prioritize media_assets.public_url, fallback to favicon_url
              data.resolved_favicon_url = data.favicon_media_id && mediaMap.has(data.favicon_media_id)
                ? mediaMap.get(data.favicon_media_id)
                : data.favicon_url || null;
            } else {
              // Fallback to legacy URLs on error
              data.resolved_logo_url = data.logo_url || null;
              data.resolved_favicon_url = data.favicon_url || null;
            }
          } else {
            // No media_ids, use legacy URLs
            data.resolved_logo_url = data.logo_url || null;
            data.resolved_favicon_url = data.favicon_url || null;
          }
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
      if (!validateRecordId(id)) {
        return validationError("Invalid ID format");
      }

      const body = await req.json();

      // Special handling for bookings with validation, status transitions, and conflict detection
      if (isBookingResource(table)) {
        const handler = new BookingHandler(repo);
        const result = await handler.update(id, body);
        
        // If result is a NextResponse (error), return it directly
        if (result instanceof NextResponse) {
          return result;
        }
        
        // Otherwise return the updated booking
        return NextResponse.json(result.data);
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
      if (!validateRecordId(id)) {
        return validationError("Invalid ID format");
      }

      await repo.delete(table, id);
      return new NextResponse(null, { status: 204 });
    } catch (error) {
      console.error(`[${table}] DELETE /${id} error:`, error);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  })(req, ctx);
};
