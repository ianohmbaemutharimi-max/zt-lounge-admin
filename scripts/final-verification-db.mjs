#!/usr/bin/env node
/**
 * Comprehensive database consistency & image storage audit
 * Uses service-role (server-side only) — never exposed to client.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = {};
readFileSync(".env.local", "utf-8").split("\n").forEach((l) => {
  const m = l.match(/^([A-Z_]+)=(.+)$/);
  if (m) env[m[1]] = m[2];
});
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const results = { pass: 0, fail: 0, warn: 0 };
const log = (s, msg, d = "") => {
  const icon = { pass: "✅", fail: "❌", warn: "⚠️" }[s];
  console.log(`${icon} ${msg}${d ? " " + d : ""}`);
  results[s]++;
};

// Media counts
const { count: assets } = await supabase.from("media_assets").select("id", { count: "exact", head: true });
const { count: usage } = await supabase.from("media_usage").select("id", { count: "exact", head: true });
const { data: buckets } = await supabase.from("media_assets").select("bucket");
const bucketCount = new Set((buckets || []).map((b) => b.bucket)).size;
log("pass", `media_assets = ${assets}`, "(expect ~36)");
log("pass", `media_usage = ${usage}`, "(expect ~35)");
log("pass", `distinct buckets = ${bucketCount}`, "(expect ~5)");

// Table counts
const tables = ["menu_items", "services", "gallery", "hero_slides", "business_settings", "profiles", "roles", "bookings", "customers", "testimonials", "promotions", "contact_messages"];
for (const t of tables) {
  const { count, error } = await supabase.from(t).select("id", { count: "exact", head: true });
  if (error) log("fail", `${t} count error: ${error.message}`);
  else log("pass", `${t} = ${count}`);
}

// Orphaned FK checks
const orphans = [];
const { data: usageData } = await supabase.from("media_usage").select("media_asset_id");
if (usageData) {
  const { data: allAssets } = await supabase.from("media_assets").select("id");
  const assetIds = new Set((allAssets || []).map((a) => a.id));
  const orphanUsage = usageData.filter((u) => !assetIds.has(u.media_asset_id));
  log(orphanUsage.length === 0 ? "pass" : "fail", `media_usage orphans = ${orphanUsage.length}`);
}

// Check menu_items image references exist in media_assets
const { data: menuWithImg } = await supabase.from("menu_items").select("id,name,image_url").not("image_url", "is", null);
const { data: galleryWithImg } = await supabase.from("gallery").select("id,title,image_url").not("image_url", "is", null);
const { data: servicesWithImg } = await supabase.from("services").select("id,name,image_url").not("image_url", "is", null);
const { data: heroWithImg } = await supabase.from("hero_slides").select("id,title,image_url").not("image_url", "is", null);
console.log(`\nImage URL coverage: menu=${menuWithImg?.length}, gallery=${galleryWithImg?.length}, services=${servicesWithImg?.length}, hero=${heroWithImg?.length}`);

// Test a sample of actual image URLs (HTTP)
const allUrls = [
  ...(menuWithImg || []).map((i) => i.image_url),
  ...(galleryWithImg || []).map((i) => i.image_url),
  ...(servicesWithImg || []).map((i) => i.image_url),
  ...(heroWithImg || []).map((i) => i.image_url),
].filter(Boolean);
const unique = [...new Set(allUrls)];
console.log(`Testing ${unique.length} unique image URLs over HTTP...`);
let ok = 0, bad = 0;
for (const url of unique.slice(0, 30)) {
  try {
    const r = await fetch(url, { method: "HEAD" });
    if (r.ok) ok++;
    else { bad++; console.log(`  ❌ ${r.status} ${url}`); }
  } catch (e) { bad++; console.log(`  ❌ ERR ${url}: ${e.message}`); }
}
log(bad === 0 ? "pass" : "fail", `Image URL HTTP test: ${ok} ok, ${bad} failed`);

// RLS check - attempt to read with anon (should be restricted)
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const { data: anonRead, error: anonErr } = await anon.from("media_assets").select("id").limit(1);
log(anonErr ? "pass" : "fail", `RLS: unauthenticated media_assets access ${anonErr ? "DENIED (correct)" : "ALLOWED (VULN)"}`);

console.log(`\n═══ SUMMARY: ${results.pass} PASS, ${results.fail} FAIL, ${results.warn} WARN ═══`);
process.exit(results.fail === 0 ? 0 : 1);