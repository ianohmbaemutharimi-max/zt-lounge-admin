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
