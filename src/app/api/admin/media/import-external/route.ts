/**
 * Secure External Image Import API — POST /api/admin/media/import-external
 *
 * External URL → server download (SSRF-guarded) → Sharp WebP → Supabase
 * Storage → media_assets → media_id → website.
 * The external URL is never stored as a domain image field.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer, getSupabaseAdmin } from "@/lib/supabase/server";
import { sanitizeCategory, generateStoragePath, PUBLIC_ASSETS_BUCKET, type ImageCategory } from "@/lib/storage/paths";
import { processImage, MAX_FILE_SIZE, ACCEPTED_MIME_TYPES } from "@/lib/images/processor";
import { BlockList, isIP } from "node:net";
import { lookup } from "node:dns/promises";

export const runtime = "nodejs";
const IMPORT_TIMEOUT_MS = 20_000;
const MAX_DOWNLOAD_BYTES = MAX_FILE_SIZE;

// SSRF protection: IPv4 ranges via net.BlockList + manual IPv6 classification
// (net.BlockList.addSubnet rejects IPv6 in this Node v24 build). Fail closed:
// any address that is not a valid public IP is treated as private/blocked.
const PRIVATE_IPV4 = new BlockList();
const addSubnet = (addr: string, prefix: number) => PRIVATE_IPV4.addSubnet(addr, prefix);
const addAddress = (addr: string) => PRIVATE_IPV4.addAddress(addr);
addAddress("0.0.0.0"); addAddress("255.255.255.255");
addSubnet("127.0.0.0", 8); addSubnet("169.254.0.0", 16);
addSubnet("10.0.0.0", 8); addSubnet("172.16.0.0", 12); addSubnet("192.168.0.0", 16);
addSubnet("100.64.0.0", 10); addSubnet("192.0.0.0", 24); addSubnet("192.0.2.0", 24);
addSubnet("198.51.100.0", 24); addSubnet("203.0.113.0", 24); addSubnet("198.18.0.0", 15);
addSubnet("203.0.0.0", 24); addSubnet("224.0.0.0", 4); addSubnet("240.0.0.0", 4);

function expandIPv6(ip: string): number[] | null {
  let s = ip.toLowerCase().replace(/%.*/, "").trim();
  let v4: number[] | null = null;
  const lastColon = s.lastIndexOf(":");
  const lastSeg = s.slice(lastColon + 1);
  const oct = lastSeg.split(".");
  if (lastSeg.includes(".") && oct.length === 4 && oct.every((o) => /^[0-9]+$/.test(o) && Number(o) >= 0 && Number(o) <= 255)) {
    v4 = oct.map(Number);
    s = s.slice(0, lastColon);
  }
  const dc = s.indexOf("::");
  let head: string[], tail: string[];
  if (dc >= 0) {
    const before = s.slice(0, dc);
    const after = s.slice(dc + 2);
    head = before === "" ? [] : before.split(":");
    tail = after === "" ? [] : after.split(":");
  } else {
    head = s === "" ? [] : s.split(":");
    tail = [];
  }
  const target = 8 - (v4 ? 2 : 0);
  if (head.length + tail.length > target) return null;
  if (dc < 0 && head.length + tail.length !== target) return null;
  const fill = target - head.length - tail.length;
  const out = head.map((h) => parseInt(h, 16) || 0)
    .concat(Array(fill > 0 ? fill : 0).fill(0))
    .concat(tail.map((t) => parseInt(t, 16) || 0));
  if (v4) {
    out[6] = (v4[0] << 8) | v4[1];
    out[7] = (v4[2] << 8) | v4[3];
  }
  return out.length === 8 ? out : null;
}

/** Returns true for loopback / link-local / private / reserved / multicast addresses. */
function isPrivateIP(ip: string): boolean {
  const family = isIP(ip);
  if (family === 0) return true; // not a valid IP -> fail closed (block)
  if (family === 4) return PRIVATE_IPV4.check(ip);
  const g = expandIPv6(ip);
  if (!g || g.length !== 8) return true; // malformed IPv6 -> fail closed
  if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0 && g[6] === 0 && g[7] === 1) return true; // ::1
  if (g.every((x) => x === 0)) return true; // :: (unspecified)
  // IPv4-mapped (::ffff:a.b.c.d) or IPv4-compatible (::a.b.c.d) -> recheck embedded IPv4
  if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && (g[5] === 0xffff || g[5] === 0)) {
    const a = (g[6] >> 8) & 0xff;
    const b = g[6] & 0xff;
    const c = (g[7] >> 8) & 0xff;
    const d = g[7] & 0xff;
    if (PRIVATE_IPV4.check(a + "." + b + "." + c + "." + d)) return true;
  }
  const p0 = g[0];
  if (p0 >= 0xfe80 && p0 <= 0xfebf) return true; // fe80::/10 link-local
  if (p0 >= 0xfc00 && p0 <= 0xfdff) return true; // fc00::/7 ULA
  if (p0 === 0x2001 && g[1] === 0x0db8) return true; // 2001:db8::/32 documentation
  if (p0 === 0x2001 && g[1] >= 0x0010 && g[1] <= 0x001f) return true; // 2001:10::/28 ORCHIDv2
  return false;
}

/**
 * Resolves hostname and rejects if ANY resolved address resolves to a
 * private / loopback / link-local / reserved IP (SSRF defense).
 */
async function assertPublicHostOnly(hostname: string): Promise<void> {
  let addresses: string[];
  try {
    const result = await lookup(hostname, { all: true }) as Array<{ address: string; family: number }>;
    addresses = result.map((a) => a.address).filter(Boolean);
  } catch {
    throw new Error("Could not resolve image host (blocked or invalid hostname)");
  }
  if (addresses.length === 0) throw new Error("Image host resolved to no addresses");
  const blocked = addresses.filter((ip) => isPrivateIP(ip));
  if (blocked.length > 0) throw new Error("Image host resolves to a blocked/private address (" + blocked.join(", ") + ")");
}

function sniffImageMimeType(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
      buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a) return "image/png";
  if (buffer.length >= 12 && buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return "image/webp";
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await getSupabaseServer();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });

    const { data: profile, error: profileError } = await supabase.from("profiles").select("id, role_id").eq("user_id", user.id).single();
    if (profileError || !profile || !profile.role_id) return NextResponse.json({ success: false, error: "Admin profile not found" }, { status: 403 });

    const { data: role, error: roleError } = await supabase.from("roles").select("name").eq("id", profile.role_id).single();
    if (roleError || !role) return NextResponse.json({ success: false, error: "Role not found" }, { status: 403 });
    if (role.name !== "super_admin") return NextResponse.json({ success: false, error: "Only the Super Admin can import media" }, { status: 403 });

    const body = await request.json().catch(() => null);
    const rawUrl = typeof body?.url === "string" ? body.url.trim() : "";
    const rawCategory = typeof body?.category === "string" ? body.category : "";
    if (!rawUrl) return NextResponse.json({ success: false, error: "URL is required" }, { status: 400 });

    let parsed: URL;
    try { parsed = new URL(rawUrl); } catch { return NextResponse.json({ success: false, error: "Invalid image URL" }, { status: 400 }); }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return NextResponse.json({ success: false, error: "Only http/https image URLs are allowed" }, { status: 400 });
    }

    let category: ImageCategory;
    try { category = sanitizeCategory(rawCategory); } catch (error) {
      return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Invalid category" }, { status: 400 });
    }

    try { await assertPublicHostOnly(parsed.hostname); } catch (error) {
      return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Image host blocked" }, { status: 400 });
    }

    let response: Response;
    try {
      const aborter = AbortSignal.timeout(IMPORT_TIMEOUT_MS);
      response = await fetch(rawUrl, { redirect: "follow", headers: { Accept: "image/webp,image/jpeg,image/png,*/*" }, signal: aborter });
    } catch (e) {
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      if (/timeout|abort/i.test(msg)) return NextResponse.json({ success: false, error: "Remote image took too long to download (20s timeout)" }, { status: 504 });
      return NextResponse.json({ success: false, error: "Could not download image from the provided URL" }, { status: 502 });
    }

    if (!response.ok) return NextResponse.json({ success: false, error: `Remote host returned HTTP ${response.status}` }, { status: 502 });
    const declaredLength = Number(response.headers.get("content-length") || "0");
    if (declaredLength > MAX_DOWNLOAD_BYTES) return NextResponse.json({ success: false, error: "Remote image is too large (max 10 MB)" }, { status: 413 });

    const arrayBuffer = await response.arrayBuffer().catch(() => null);
    if (!arrayBuffer) return NextResponse.json({ success: false, error: "Could not read remote image body" }, { status: 502 });
    if (arrayBuffer.byteLength > MAX_DOWNLOAD_BYTES) return NextResponse.json({ success: false, error: "Remote image is too large (max 10 MB)" }, { status: 413 });

    const fileBuffer = Buffer.from(arrayBuffer);
    const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    let declaredMimeType: string;
    if (ACCEPTED_MIME_TYPES.includes(contentType as any)) {
      declaredMimeType = contentType;
    } else {
      const sniffed = sniffImageMimeType(fileBuffer);
      if (!sniffed) return NextResponse.json({ success: false, error: "Remote URL is not a supported image (JPEG, PNG, or WebP)" }, { status: 415 });
      declaredMimeType = sniffed;
    }
    if (fileBuffer.length === 0) return NextResponse.json({ success: false, error: "Remote image is empty" }, { status: 415 });

    const originalName = (parsed.pathname.split("/").pop() || "external-image").slice(0, 120) || "external-image";
    let processed;
    try {
      processed = await processImage(fileBuffer, declaredMimeType, originalName, category);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Image processing failed";
      const isFormatError = /format|corrupted/i.test(message);
      return NextResponse.json({ success: false, error: message }, { status: isFormatError ? 415 : 400 });
    }

    const supabaseAdmin = await getSupabaseAdmin();
    const { data: dupes, error: dupesError } = await supabaseAdmin.from("media_assets").select("id, title, original_name").eq("content_hash", processed.contentHash).limit(1);
    if (!dupesError && dupes && dupes.length > 0) {
      return NextResponse.json({ success: false, error: "An identical image already exists in the Media Library. Select it from the library instead of importing a duplicate.", existingMediaId: dupes[0].id, code: "DUPLICATE_MEDIA" }, { status: 409 });
    }

    const storagePath = generateStoragePath(category);
    const { error: uploadError } = await supabaseAdmin.storage.from(PUBLIC_ASSETS_BUCKET).upload(storagePath, processed.buffer, { contentType: "image/webp", cacheControl: "3600", upsert: false });
    if (uploadError) {
      console.error("[import-external] storage upload failed:", { path: storagePath, code: uploadError.statusCode });
      return NextResponse.json({ success: false, error: "Failed to upload imported image to storage" }, { status: 500 });
    }

    const { data: { publicUrl } } = supabaseAdmin.storage.from(PUBLIC_ASSETS_BUCKET).getPublicUrl(storagePath);

    const { data: record, error: dbError } = await supabaseAdmin.from("media_assets")
      .insert({ bucket: PUBLIC_ASSETS_BUCKET, path: storagePath, public_url: publicUrl, original_name: originalName, mime_type: "image/webp", file_size: processed.size, width: processed.width, height: processed.height, uploaded_by: profile.id, content_hash: processed.contentHash })
      .select().single();
    if (dbError) {
      const { error: deleteError } = await supabaseAdmin.storage.from(PUBLIC_ASSETS_BUCKET).remove([storagePath]);
      if (deleteError) console.error("[import-external] cleanup failed (orphaned storage):", storagePath);
      return NextResponse.json({ success: false, error: "Failed to save imported media record" }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: { id: record.id, bucket: PUBLIC_ASSETS_BUCKET, path: storagePath, public_url: publicUrl, publicUrl, relativePath: storagePath, original_name: originalName, title: null, alt_text: null, mime_type: "image/webp", file_size: processed.size, size: processed.size, width: processed.width, height: processed.height, content_hash: processed.contentHash, created_at: record.created_at } }, { status: 201 });
  } catch (error) {
    console.error("[import-external] FATAL ERROR:", { name: error instanceof Error ? error.name : "Unknown", message: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { Allow: "POST, OPTIONS" } });
}
