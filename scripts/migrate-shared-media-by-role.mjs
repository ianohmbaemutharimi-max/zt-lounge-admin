import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

dotenv.config({ path: ".env.local" });

const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const apply = process.argv.includes("--apply");

if (!projectUrl || !serviceRoleKey) {
  throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.");
}
if (apply && process.env.ALLOW_PRODUCTION_MEDIA_MIGRATION !== "true") {
  throw new Error("Refusing writes. Set ALLOW_PRODUCTION_MEDIA_MIGRATION=true only after reviewing the dry-run.");
}

const supabase = createClient(projectUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ROLE_FOLDER = {
  hero: "hero",
  gallery: "gallery",
  menu: "menu",
  service: "services",
  testimonial: "testimonials",
  branding: "branding",
  promotion: "promotions",
  seo: "seo",
  feature: "feature",
  general: "general",
};

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
    const path = rest.slice(split + 1).split("/").map(decodeURIComponent).join("/");
    if (!bucket || !path || path.split("/").some((part) => part === ".." || part === ".")) return null;
    return { bucket, path, key: bucket + "/" + path };
  } catch {
    return null;
  }
}

async function readAllAssets() {
  const all = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase
      .from("media_assets")
      .select("id, public_url, media_type, file_name")
      .order("id")
      .range(offset, offset + 499);
    if (error) throw new Error("Could not read media_assets: " + error.message);
    all.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }
  return all;
}

const assets = await readAllAssets();
const groups = new Map();
for (const asset of assets) {
  const location = parseStorageUrl(asset.public_url);
  if (!location) continue;
  const group = groups.get(location.key) ?? [];
  group.push({ ...asset, location });
  groups.set(location.key, group);
}

const duplicateGroups = [...groups.entries()].filter(([, rows]) => rows.length > 1);
const plan = [];

for (const [objectKey, rows] of duplicateGroups) {
  for (const row of rows) {
    let folder = ROLE_FOLDER[row.media_type];
    if (row.media_type === "general") {
      const legacyRoleFolder = row.location.path.split("/").find((part) => part === "memberships" || part === "general");
      if (legacyRoleFolder) folder = legacyRoleFolder;
    }
    if (!folder) {
      throw new Error("Unsupported media_type " + row.media_type + " for asset " + row.id + "; no copy has been made for this group.");
    }
    const extension = row.location.path.includes(".")
      ? row.location.path.split(".").pop().toLowerCase()
      : "webp";
    if (!/^[a-z0-9]{1,8}$/.test(extension)) {
      throw new Error("Unsafe file extension for asset " + row.id);
    }
    const targetPath = "assets/images/" + folder + "/" + randomUUID() + "." + extension;
    plan.push({ objectKey, assetId: row.id, oldUrl: row.public_url, bucket: row.location.bucket, oldPath: row.location.path, targetPath, mediaType: row.media_type });
  }
}

console.log(JSON.stringify({
  mode: apply ? "APPLY" : "DRY_RUN",
  assetsScanned: assets.length,
  duplicateStorageObjects: duplicateGroups.length,
  mediaRowsToSeparate: plan.length,
  plan,
}, null, 2));

if (!apply || plan.length === 0) {
  console.log(apply ? "No duplicate storage objects require separation." : "Dry run only. No Storage or database changes were made.");
  process.exit(0);
}

for (const [objectKey, rows] of duplicateGroups) {
  const groupPlan = plan.filter((item) => item.objectKey === objectKey);
  const completed = [];

  try {
    for (const item of groupPlan) {
      const { error: copyError } = await supabase.storage
        .from(item.bucket)
        .copy(item.oldPath, item.targetPath);
      if (copyError) throw new Error("Storage copy failed for " + item.assetId + ": " + copyError.message);

      const { data: publicData } = supabase.storage
        .from(item.bucket)
        .getPublicUrl(item.targetPath);

      const { data: updated, error: updateError } = await supabase
        .from("media_assets")
        .update({ public_url: publicData.publicUrl, updated_at: new Date().toISOString() })
        .eq("id", item.assetId)
        .eq("public_url", item.oldUrl)
        .select("id")
        .maybeSingle();

      if (updateError || !updated) {
        await supabase.storage.from(item.bucket).remove([item.targetPath]);
        throw new Error("Media row update failed for " + item.assetId + ": " + (updateError?.message ?? "row changed during migration"));
      }

      completed.push(item);
      console.log("Separated", item.assetId, "=>", item.targetPath);
    }

    // Verify the original object is no longer referenced by any media row
    // before removing it. If verification fails, retain the original object.
    let stillReferenced = false;
    for (const oldUrl of new Set(groupPlan.map((item) => item.oldUrl))) {
      const { data: remaining, error: verifyError } = await supabase
        .from("media_assets")
        .select("id")
        .eq("public_url", oldUrl)
        .limit(1);
      if (verifyError) throw new Error("Could not verify old object references: " + verifyError.message);
      if (remaining?.length) stillReferenced = true;
    }

    if (!stillReferenced) {
      const { error: removeError } = await supabase.storage
        .from(groupPlan[0].bucket)
        .remove([groupPlan[0].oldPath]);
      if (removeError) {
        console.warn("Old shared object retained; cleanup failed:", objectKey, removeError.message);
      } else {
        console.log("Removed old shared object:", objectKey);
      }
    } else {
      console.warn("Old object retained because other registry rows still reference it:", objectKey);
    }
  } catch (error) {
    console.error("Group failed; attempting rollback for", objectKey, error);
    for (const item of completed.reverse()) {
      const { error: rollbackError } = await supabase
        .from("media_assets")
        .update({ public_url: item.oldUrl, updated_at: new Date().toISOString() })
        .eq("id", item.assetId);
      const { error: removeError } = await supabase.storage.from(item.bucket).remove([item.targetPath]);
      if (rollbackError) console.error("ROLLBACK DB FAILED for", item.assetId, rollbackError.message);
      if (removeError) console.error("ROLLBACK STORAGE CLEANUP FAILED for", item.targetPath, removeError.message);
    }
    throw error;
  }
}

console.log("Role-specific media copy migration completed. Re-run without --apply to confirm no duplicate object groups remain.");
