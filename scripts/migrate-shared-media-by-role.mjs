import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

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
    if (!/^[a-z0-9][a-z0-9_-]{0,62}$/i.test(bucket) || !path ||
        path.split("/").some((part) => part === ".." || part === ".")) return null;
    return { bucket, path, key: bucket + "/" + path };
  } catch {
    return null;
  }
}

function roleFolderFor(asset, location) {
  let folder = ROLE_FOLDER[asset.media_type];
  // The live enum uses "general" for membership assets. Preserve an explicit
  // memberships folder when the legacy object path already identifies it.
  if (asset.media_type === "general") {
    const legacyRoleFolder = location.path.split("/").find((part) => part === "memberships" || part === "general");
    if (legacyRoleFolder) folder = legacyRoleFolder;
  }
  return folder;
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
const unsupportedAssets = [];

for (const asset of assets) {
  const location = parseStorageUrl(asset.public_url);
  if (!location) {
    unsupportedAssets.push({ id: asset.id, publicUrl: asset.public_url, reason: "Not a public Storage URL for the configured Supabase project" });
    continue;
  }
  const group = groups.get(location.key) ?? [];
  group.push({ ...asset, location });
  groups.set(location.key, group);
}

const plan = [];
const planById = new Map();

for (const [objectKey, rows] of groups) {
  for (const row of rows) {
    const folder = roleFolderFor(row, row.location);
    if (!folder) {
      throw new Error("Unsupported media_type " + row.media_type + " for asset " + row.id + "; no Storage changes have been made.");
    }
    const extension = row.location.path.includes(".")
      ? row.location.path.split(".").pop().toLowerCase()
      : "webp";
    if (!/^[a-z0-9]{1,8}$/.test(extension)) {
      throw new Error("Unsafe file extension for asset " + row.id);
    }

    // Stable path makes dry-run and apply plans identical and makes retries safe.
    const targetPath = "assets/images/" + folder + "/" + row.id + "." + extension;
    if (targetPath === row.location.path) continue;

    const item = {
      objectKey,
      assetId: row.id,
      oldUrl: row.public_url,
      bucket: row.location.bucket,
      oldPath: row.location.path,
      targetPath,
      mediaType: row.media_type,
    };
    plan.push(item);
    planById.set(row.id, item);
  }
}

const migrationGroups = [...groups.entries()]
  .filter(([, rows]) => rows.some((row) => planById.has(row.id)));
const duplicateStorageObjectGroups = [...groups.values()].filter((rows) => rows.length > 1).length;

console.log(JSON.stringify({
  mode: apply ? "APPLY" : "DRY_RUN",
  assetsScanned: assets.length,
  storageObjectsScanned: groups.size,
  duplicateStorageObjectGroups,
  sourceObjectsToProcess: migrationGroups.length,
  mediaRowsToMove: plan.length,
  unsupportedAssets,
  plan,
}, null, 2));

if (unsupportedAssets.length) {
  throw new Error("Some media assets are not recognized as public Storage URLs. Resolve them before applying the role-path migration.");
}
if (!apply || plan.length === 0) {
  console.log(apply ? "No media assets require role-path migration." : "Dry run only. No Storage or database changes were made.");
  process.exit(0);
}

for (const [objectKey, rows] of migrationGroups) {
  const groupPlan = plan.filter((item) => item.objectKey === objectKey);
  const completed = [];

  try {
    for (const item of groupPlan) {
      const targetDirectory = item.targetPath.slice(0, item.targetPath.lastIndexOf("/"));
      const targetName = item.targetPath.slice(item.targetPath.lastIndexOf("/") + 1);
      const { data: existingObjects, error: listError } = await supabase.storage
        .from(item.bucket)
        .list(targetDirectory, { search: targetName, limit: 10 });
      if (listError) throw new Error("Could not inspect target path for " + item.assetId + ": " + listError.message);

      const targetAlreadyExists = (existingObjects ?? []).some((object) => object.name === targetName);
      if (!targetAlreadyExists) {
        const { error: copyError } = await supabase.storage
          .from(item.bucket)
          .copy(item.oldPath, item.targetPath);
        if (copyError) throw new Error("Storage copy failed for " + item.assetId + ": " + copyError.message);
      } else {
        console.log("Reusing previously copied object:", item.targetPath);
      }

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
      console.log("Moved", item.assetId, "=>", item.targetPath);
    }

    // Verify every previous URL is no longer referenced before removing the
    // source object. Rows already using the target path are retained in place.
    let stillReferenced = false;
    for (const oldUrl of new Set(rows.map((row) => row.public_url))) {
      const { data: remaining, error: verifyError } = await supabase
        .from("media_assets")
        .select("id")
        .eq("public_url", oldUrl)
        .limit(1);
      if (verifyError) throw new Error("Could not verify old object references: " + verifyError.message);
      if (remaining?.length) stillReferenced = true;
    }

    const sourceObjectIsStillTheTarget = rows.some((row) => {
      const planned = planById.get(row.id);
      return !planned || planned.targetPath === row.location.path;
    });

    if (!stillReferenced && !sourceObjectIsStillTheTarget) {
      const { error: removeError } = await supabase.storage
        .from(rows[0].location.bucket)
        .remove([rows[0].location.path]);
      if (removeError) {
        console.warn("Old source object retained; cleanup failed:", objectKey, removeError.message);
      } else {
        console.log("Removed old source object:", objectKey);
      }
    } else {
      console.warn("Old source object retained because a media row still references it:", objectKey);
    }
  } catch (error) {
    console.error("Source object group failed; attempting rollback for", objectKey, error);
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

console.log("Role-specific media path migration completed. Run scripts/verify-media-role-separation.mjs to verify the result.");
