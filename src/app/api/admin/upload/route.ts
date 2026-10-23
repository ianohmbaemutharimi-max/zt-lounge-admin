/**
 * Phase 3 - Secure Image Upload API
 * 
 * POST /api/admin/upload
 * 
 * Handles authenticated image uploads with:
  * - RBAC (super_admin, admin only — Phase 2 reconciled; manager is obsolete)
 * - File validation (JPEG, PNG, WebP, ICO; max 10MB)
 * - Sharp-based format verification (genuine ICO bypasses Sharp; preserved byte-by-byte)
 * - WebP conversion with category-specific resizing
 * - UUID-based storage paths (no client control)
 * - Supabase Storage upload to public-assets bucket
 * - media_assets table tracking
 * - Failure cleanup (no orphaned storage objects)
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer, getSupabaseAdmin } from "@/lib/supabase/server";
import { CONTENT_MANAGER_ROLES } from "@/lib/auth/server";
import { 
  sanitizeCategory,
  generateStoragePath,
  FAVICONS_BUCKET,
  PUBLIC_ASSETS_BUCKET,
  type ImageCategory
} from "@/lib/storage/paths";
import { processImage, MAX_FILE_SIZE } from "@/lib/images/processor";

/**
 * CRITICAL: Sharp requires Node.js runtime (not Edge).
 * Edge runtime does not support native modules like Sharp.
 */
export const runtime = 'nodejs';

/**
 * POST /api/admin/upload
 * 
 * Uploads and processes an image file.
 * 
 * Required headers:
 * - Cookie: Supabase session
 * 
 * Request body (multipart/form-data):
 * - file: Image file (JPEG, PNG, WebP, or ICO; max 10MB)
 * - category: Image category (hero, gallery, menu, services, testimonials, branding, promotions, memberships)
 * 
 * Response (201):
 * {
 *   "success": true,
 *   "data": {
 *     "id": "uuid",
 *     "bucket": "public-assets",
 *     "path": "assets/images/{category}/{uuid}.webp",
 *     "relativePath": "assets/images/{category}/{uuid}.webp",
 *     "publicUrl": "https://...",
 *     "originalName": "...",
 *     "mimeType": "image/jpeg",
 *     "fileSize": 123456
 *   }
 * }
 * 
 * Error responses:
 * - 401: Unauthenticated
 * - 403: Unauthorized role
 * - 400: Validation error
 * - 413: File too large
 * - 415: Unsupported media type
 * - 500: Server error
 */
export async function POST(request: NextRequest) {
  console.log("[UPLOAD] Request received");
  
  try {
    console.log("[UPLOAD] Starting authentication");
    
    // 1. Authenticate user
    const supabase = await getSupabaseServer();
    console.log("[UPLOAD] Supabase client created");
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    console.log("[UPLOAD] Auth check complete, user:", user?.id ? "exists" : "null");

    if (authError || !user) {
      console.log("[UPLOAD] Auth failed:", authError?.message);
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    console.log("[UPLOAD] Starting profile lookup");
    
    // 2. Get user profile and check role
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, role_id")
      .eq("user_id", user.id)
      .single();

    console.log("[UPLOAD] Profile lookup complete:", profile ? "found" : "not found");

    if (profileError || !profile) {
      console.error("[UPLOAD] Profile lookup failed:", profileError?.message, "code:", profileError?.code);
      return NextResponse.json(
        { success: false, error: "Profile not found" },
        { status: 403 }
      );
    }

    // Get role name separately
    if (!profile.role_id) {
      console.log("[UPLOAD] No role_id in profile");
      return NextResponse.json(
        { success: false, error: "No role assigned" },
        { status: 403 }
      );
    }

    console.log("[UPLOAD] Starting role lookup, role_id:", profile.role_id);

    const { data: role, error: roleError } = await supabase
      .from("roles")
      .select("name")
      .eq("id", profile.role_id)
      .single();

    console.log("[UPLOAD] Role lookup complete:", role?.name || "not found");

    if (roleError || !role) {
      console.error("[UPLOAD] Role lookup failed:", roleError?.message, "code:", roleError?.code);
      return NextResponse.json(
        { success: false, error: "Role not found" },
        { status: 403 }
      );
    }

    // Check RBAC: only content managers can upload
    const roleName = role.name;
    console.log("[UPLOAD] Checking RBAC, role:", roleName);
    
    // PHASE 1: Only super_admin can upload media
    if (roleName !== "super_admin") {
      console.log("[UPLOAD] RBAC failed, role not super_admin:", roleName);
      return NextResponse.json(
        { 
          success: false, 
          error: "Only the Super Admin can upload media" 
        },
        { status: 403 }
      );
    }

    console.log("[UPLOAD] RBAC passed, parsing form data");

    // 3. Parse multipart form data
    const formData = await request.formData();
    console.log("[UPLOAD] Form data parsed");
    const file = formData.get("file");
    const categoryRaw = formData.get("category");

    // Validate file presence
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "File is required" },
        { status: 400 }
      );
    }

    // Validate category presence
    if (!categoryRaw) {
      return NextResponse.json(
        { success: false, error: "Category is required" },
        { status: 400 }
      );
    }

    // 4. Validate and sanitize category
    let category: ImageCategory;
    try {
      category = sanitizeCategory(categoryRaw);
    } catch (error) {
      return NextResponse.json(
        { 
          success: false, 
          error: error instanceof Error ? error.message : "Invalid category" 
        },
        { status: 400 }
      );
    }

    // 5. Validate file size (before expensive processing)
    if (file.size > MAX_FILE_SIZE) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
      const maxMB = (MAX_FILE_SIZE / (1024 * 1024)).toFixed(0);
      return NextResponse.json(
        { 
          success: false, 
          error: `File too large: ${sizeMB} MB. Maximum: ${maxMB} MB` 
        },
        { status: 413 }
      );
    }

    // 6. Get file buffer and metadata
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const originalName = file.name;
    const declaredMimeType = file.type;

    // 7. Process image with Sharp
    let processed;
    try {
      processed = await processImage(
        fileBuffer,
        declaredMimeType,
        originalName,
        category
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Image processing failed";
      
      // Return 415 for format errors, 400 for other validation errors
      const isFormatError = message.includes("format") || message.includes("corrupted");
      return NextResponse.json(
        { success: false, error: message },
        { status: isFormatError ? 415 : 400 }
      );
    }

    console.log("[UPLOAD] Generating storage path");
    
    // 8. Content hash (SHA-256 of final normalized WebP buffer)
    // Duplicate detection is handled in APPLICATION code:
    // the live database has NO uniqueness constraint on
    // media_assets.content_hash, and per the architecture we must NOT
    // introduce one. We detect an identical normalized upload here and
    // return a 409 so administrators can reuse the existing media asset
    // from the Media Library instead of creating a duplicate storage object.
    const contentHash = processed.contentHash;

    // Generate storage path (UUID-based, no client control)
    // Phase 6: a genuine .ico keeps its real .ico extension and
    // image/x-icon mime downstream; all other formats stay .webp.
    const isFaviconIco = processed.format === "ico";
    const storagePath = generateStoragePath(category, isFaviconIco ? "ico" : "webp");
    const uploadBucket = isFaviconIco ? FAVICONS_BUCKET : PUBLIC_ASSETS_BUCKET;
    console.log("[UPLOAD] Storage path:", storagePath);

    console.log("[UPLOAD] Creating admin client");
    
    const supabaseAdmin = await getSupabaseAdmin();
    console.log("[UPLOAD] Admin client created, checking for duplicate content hash");
    
    // Application-level duplicate detection (no DB constraint created).
    const { data: dupes, error: dupesError } = await supabaseAdmin
      .from("media_assets")
      .select("id, title, original_name")
      .eq("content_hash", contentHash)
      .limit(1);

    if (!dupesError && dupes && dupes.length > 0) {
      const existing = dupes[0];
      console.log("[UPLOAD] Duplicate content hash detected:", existing.id);
      return NextResponse.json(
        {
          success: false,
          error: "An identical image already exists in the Media Library. " +
            "Select it from the library (or remove the existing asset) instead of uploading a duplicate.",
          existingMediaId: existing.id,
          code: "DUPLICATE_MEDIA",
        },
        { status: 409 }
      );
    }

    console.log("[UPLOAD] No duplicate detected, starting storage upload");
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from(uploadBucket)
      .upload(storagePath, processed.buffer, {
        contentType: isFaviconIco ? "image/x-icon" : "image/webp",
        cacheControl: "3600",
        upsert: false, // Never overwrite existing files
      });

    if (uploadError) {
      console.error("Storage upload failed:", {
        path: storagePath,
        error: uploadError.message,
        code: uploadError.statusCode,
        // Never log: access tokens, service keys, credentials
      });

      return NextResponse.json(
        { 
          success: false, 
          error: "Failed to upload file to storage" 
        },
        { status: 500 }
      );
    }

    // 10. Get public URL
    const { data: { publicUrl } } = supabaseAdmin.storage
      .from(uploadBucket)
      .getPublicUrl(storagePath);

       // 11. Create media_assets record using service role client to bypass RLS
    console.log("[UPLOAD] Inserting media_assets record with service role client");
    const { data: fileUploadRecord, error: dbError } = await supabaseAdmin
      .from("media_assets")
      .insert({
        bucket: uploadBucket,
        path: storagePath,
        public_url: publicUrl,
        original_name: originalName,
        mime_type: isFaviconIco ? "image/x-icon" : declaredMimeType,
        file_size: processed.size,
        width: processed.width,
        height: processed.height,
        uploaded_by: profile.id,
        content_hash: contentHash,
      })
      .select()
      .single();

    if (dbError) {
      // Database insert failed - MUST clean up storage object
      console.error("Database insert failed, cleaning up storage:", {
        path: storagePath,
        error: dbError.message,
        code: dbError.code,
      });

      // Delete the uploaded storage object using admin client
      const { error: deleteError } = await supabaseAdmin.storage
        .from(uploadBucket)
        .remove([storagePath]);

      if (deleteError) {
        console.error("Cleanup failed - orphaned storage object:", {
          path: storagePath,
          deleteError: deleteError.message,
        });
      }

      return NextResponse.json(
        { 
          success: false, 
          error: "Failed to save upload record" 
        },
        { status: 500 }
      );
    }

    // 12. Return success response
    return NextResponse.json(
      {
        success: true,
        data: {
          id: fileUploadRecord.id,
          bucket: uploadBucket,
          path: storagePath,
          relativePath: storagePath, // For AssetUrl compatibility
          publicUrl,
          originalName,
          mimeType: isFaviconIco ? "image/x-icon" : declaredMimeType,
          fileSize: processed.size,
          width: processed.width,
          height: processed.height,
          contentHash,
        },
      },
      { status: 201 }
    );

  } catch (error) {
    console.error("[UPLOAD] FATAL ERROR:", {
      name: error instanceof Error ? error.name : "Unknown",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack?.split('\n').slice(0, 5).join('\n') : undefined,
      // Never log: tokens, keys, credentials, sensitive data
    });

    return NextResponse.json(
      { 
        success: false, 
        error: "Internal server error" 
      },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS handler for CORS preflight (if needed).
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Allow": "POST, OPTIONS",
    },
  });
}


