import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!projectUrl || !serviceRoleKey) {
  throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.");
}

const supabase = createClient(projectUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const REFERENCES = [
  { table: "services", column: "media_id", role: "service" },
  { table: "gallery", column: "media_id", role: "gallery" },
  { table: "hero_slides", column: "media_id", role: "hero" },
  { table: "menu_items", column: "media_id", role: "menu" },
  { table: "testimonials", column: "media_id", role: "testimonial" },
  { table: "promotions", column: "media_id", role: "promotion" },
  { table: "branding_assets", column: "media_id", role: "branding" },
  { table: "page_features", column: "media_id", role: "feature" },
  { table: "page_seo", column: "og_image_media_id", role: "seo", recordColumn: "page_key" },
  { table: "business_settings", column: "logo_media_id", role: "branding" },
  { table: "business_settings", column: "logo_light_media_id", role: "branding" },
  { table: "business_settings", column: "favicon_media_id", role: "branding" },
];

function parseStorageUrl(value) {
  try {
    const url = new URL(value);
    if (url.origin !== new URL(projectUrl).origin) return null;
    const prefix = "/storage/v1/object/public/";
    if (!url.pathname.startsWith(prefix)) return null;
    const rest = url.pathname.slice(prefix.length);
    const split = rest.indexOf("/");
    if (split < 1 || split === rest.length - 1) return null;
    const bucket = decodeURIComponent(rest.slice(0, split));
    if (!/^[a-z0-9][a-z0-9_-]{0,62}$/i.test(bucket)) return null;
    const path = rest.slice(split + 1).split("/").map(decodeURIComponent).join("/");
    return { key: bucket + "/" + path, bucket, path };
  } catch {
    return null;
  }
}

async function readAll(table, select) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from(table).select(select).range(offset, offset + 499);
    if (error) throw new Error("Read failed for " + table + ": " + error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }
  return rows;
}

const assets = await readAll("media_assets", "id, public_url, media_type, file_name");
const assetById = new Map(assets.map((asset) => [asset.id, asset]));
const objectGroups = new Map();

for (const asset of assets) {
  const location = parseStorageUrl(asset.public_url);
  if (!location) continue;
  const rows = objectGroups.get(location.key) ?? [];
  rows.push({ id: asset.id, media_type: asset.media_type, file_name: asset.file_name });
  objectGroups.set(location.key, rows);
}

const duplicateStorageObjects = [...objectGroups.entries()]
  .filter(([, rows]) => rows.length > 1)
  .map(([objectKey, rows]) => ({ objectKey, rows }));

const roleByAsset = new Map();
const roleMismatches = [];
for (const ref of REFERENCES) {
  const recordColumn = ref.recordColumn ?? "id";
  const rows = await readAll(ref.table, recordColumn + ", " + ref.column);
  for (const row of rows) {
    const mediaId = row[ref.column];
    if (!mediaId) continue;
    const asset = assetById.get(mediaId);
    if (!asset) {
      roleMismatches.push({ table: ref.table, recordId: row[recordColumn], mediaId, expectedRole: ref.role, problem: "missing media_assets row" });
      continue;
    }
    const roles = roleByAsset.get(mediaId) ?? new Set();
    roles.add(ref.role);
    roleByAsset.set(mediaId, roles);
    if (asset.media_type !== ref.role) {
      roleMismatches.push({
        table: ref.table,
        recordId: row[recordColumn],
        mediaId,
        expectedRole: ref.role,
        actualMediaType: asset.media_type,
        problem: "media_type does not match content role",
      });
    }
  }
}

const crossRoleIds = [...roleByAsset.entries()]
  .filter(([, roles]) => roles.size > 1)
  .map(([mediaId, roles]) => ({ mediaId, roles: [...roles] }));

const report = {
  project: new URL(projectUrl).host,
  mediaAssetsScanned: assets.length,
  duplicateStorageObjectGroups: duplicateStorageObjects.length,
  duplicateStorageObjects,
  crossRoleMediaIdCount: crossRoleIds.length,
  crossRoleMediaIds: crossRoleIds,
  roleMismatchCount: roleMismatches.length,
  roleMismatches,
  pass: duplicateStorageObjects.length === 0 && crossRoleIds.length === 0 && roleMismatches.length === 0,
};

console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;
