#!/usr/bin/env node
/**
 * READ-ONLY LIVE DATABASE INSPECTOR (Phase 1)
 * Uses the connected Supabase project (service role, PostgREST).
 * Never executes DDL/DML. Only SELECT / OPTIONS / OpenAPI enumeration.
 */
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const out = { timestamp: new Date().toISOString(), project: "jczwilrysvnhcjzjztbi", tables: {}, rpcFunctions: [], columnChecks: {}, data: {} };

// 1) Enumerate PostgREST schema: fetch OpenAPI root
try {
  const res = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  const text = await res.text();
  const paths = Object.keys(JSON.parse(text).paths || {});
  out.rpcFunctions = paths
    .filter((p) => p.startsWith("/rpc/"))
    .map((p) => p.replace("/rpc/", ""))
    .sort();
  out.tablePaths = paths.filter((p) => !p.startsWith("/rpc/")).sort();
} catch (e) {
  out.openapiError = String(e && e.message ? e.message : e);
}

// 2) Confirm each expected table exists and has media_id / branding columns
const tableChecks = [
  { table: "media_assets", cols: ["id", "bucket", "path", "public_url"] },
  { table: "media_usage", cols: ["id", "media_asset_id"] },
  { table: "menu_items", cols: ["id", "media_id", "image_url"] },
  { table: "services", cols: ["id", "media_id", "image_url"] },
  { table: "gallery", cols: ["id", "media_id", "image_url"] },
  { table: "hero_slides", cols: ["id", "media_id", "image_url"] },
  { table: "business_settings", cols: ["id", "logo_media_id", "favicon_media_id", "logo_url", "favicon_url"] },
  { table: "menu_categories", cols: ["id", "name", "slug"] },
];

for (const { table, cols } of tableChecks) {
  const row = {};
  for (const col of cols) {
    const q = col === "id" ? col : col;
    const { data, error } = await supabase.from(table).select(q).limit(1);
    if (error) {
      row[col] = { exists: false, error: error.message, code: error.code };
    } else {
      row[col] = { exists: true };
    }
  }
  out.columnChecks[table] = row;
}

// 3) Data counts: total, with media_id, with image_url, orphaned media_id
async function countWith(table, col) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true }).not(col, "is", null);
  return error ? { error: error.message } : { count };
}
async function totalCount(table) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  return error ? { error: error.message } : { count };
}

for (const table of ["menu_items", "services", "gallery", "hero_slides"]) {
  out.data[table] = {
    total: await totalCount(table),
    withMediaId: await countWith(table, "media_id"),
    withImageUrl: await countWith(table, "image_url"),
  };
}

out.data.media_assets = { total: await totalCount("media_assets") };
out.data.media_usage = { total: await totalCount("media_usage") };
out.data.business_settings = { total: await totalCount("business_settings") };
out.data.menu_categories = { total: await totalCount("menu_categories") };

// 4) Orphaned media_id references (media_id not null and not matching media_assets)
async function orphanCount(table) {
  const { data, error } = await supabase.from(table).select("id, media_id").not("media_id", "is", null).limit(1000);
  if (error) return { error: error.message };
  const ids = [...new Set(data.map((r) => r.media_id))];
  let orphans = [];
  if (ids.length) {
    const { data: assets, error: aErr } = await supabase.from("media_assets").select("id").in("id", ids);
    if (!aErr) {
      const valid = new Set(assets.map((a) => a.id));
      orphans = data.filter((r) => !valid.has(r.media_id)).map((r) => ({ id: r.id, media_id: r.media_id }));
    }
  }
  return { referenced: data.length, orphaned: orphans.length };
}

for (const table of ["menu_items", "services", "gallery", "hero_slides"]) {
  out.data[`${table}_orphans`] = await orphanCount(table);
}

// 5) Business settings branding valid when non-null
const { data: biz } = await supabase.from("business_settings").select("id, logo_media_id, favicon_media_id, logo_url, favicon_url").limit(1);
out.data.business_settings_row = biz && biz[0] ? { hasRow: true, logo_media_id: biz[0].logo_media_id, favicon_media_id: biz[0].favicon_media_id } : { hasRow: false };

// 6) Menu categories active rows
const { data: cats } = await supabase.from("menu_categories").select("id, name, slug, display_order, is_active").order("display_order");
out.data.menu_categories_rows = cats ? cats.map((c) => ({ name: c.name, slug: c.slug, display_order: c.display_order, is_active: c.is_active })) : [];

console.log(JSON.stringify(out, null, 2));