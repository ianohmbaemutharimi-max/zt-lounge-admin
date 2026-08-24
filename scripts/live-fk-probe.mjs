#!/usr/bin/env node
/**
 * LIVE FK BEHAVIORAL PROBE (sentinel rows only, fully cleaned up)
 * Detects per consumer table:
 *   (a) media FK existence (invalid media_id INSERT rejected => FK exists)
 *   (b) delete rule class (RESTRICT/NO ACTION vs SET NULL vs CASCADE vs none)
 */
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const { randomUUID } = await import("crypto");

const PROBE_BUCKET = `audit-probe-${Date.now()}`;
const report = { project: "jczwilrysvnhcjzjztbi", probeBucket: PROBE_BUCKET, checks: {}, mediaCountBefore: null, mediaCountAfter: null };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function countMedia() {
  const { count } = await sb.from("media_assets").select("id", { count: "exact", head: true });
  return count;
}

async function deleteId(table, id) {
  if (id) await sb.from(table).delete().eq("id", id).catch(() => {});
}

async function probeTable(table, buildRow) {
  const entry = { table, fkExists: null, deleteRuleClass: null, notes: [] };
  let consumerId = randomUUID();
  const sentinel = randomUUID();
  try {
    const bad = await buildRow(randomUUID(), "00000000-0000-0000-0000-000000000000");
    const r1 = await sb.from(table).insert(bad).select("id").maybeSingle();
    if (r1.error) {
      if (r1.error.code === "23503" || /foreign key/i.test(r1.error.message)) {
        entry.fkExists = true;
        entry.notes.push(`invalid-ref INSERT rejected (${r1.error.code}) => FK enforces media_id`);
      } else {
        entry.notes.push(`invalid-ref INSERT rejected: ${r1.error.code} ${r1.error.message}`);
        entry.fkExists = "UNKNOWN";
        return entry;
      }
    } else {
      entry.fkExists = false;
      entry.notes.push("invalid-ref INSERT succeeded => no media FK on this table");
      await deleteId(table, r1.data.id);
      return entry;
    }
    const ins = await sb.from("media_assets").insert({
      id: sentinel, bucket: PROBE_BUCKET, path: "sentinel.webp",
      public_url: `https://x/${PROBE_BUCKET}/sentinel.webp`, original_name: "probe.png",
      mime_type: "image/png", file_size: 1, width: 1, height: 1,
    }).select("id").maybeSingle();
    if (ins.error) { entry.notes.push(`media sentinel INSERT failed: ${ins.error.code} ${ins.error.message}`); return entry; }
    const good = await buildRow(consumerId, sentinel);
    const r2 = await sb.from(table).insert(good).select("id").maybeSingle();
    if (r2.error) {
      entry.notes.push(`sentinel INSERT failed: ${r2.error.code} ${r2.error.message}`);
      await deleteId("media_assets", sentinel);
      return entry;
    }
    const del = await sb.from("media_assets").delete().eq("id", sentinel).select("id").maybeSingle();
    if (del.data && del.data.id) {
      const { data: after } = await sb.from(table).select("id, media_id").eq("id", consumerId).maybeSingle();
      if (after && after.media_id === null) entry.deleteRuleClass = "SET NULL";
      else if (!after) entry.deleteRuleClass = "CASCADE";
      else entry.deleteRuleClass = "NO FK ENFORCEMENT (dangling kept)";
      entry.notes.push(`media DELETE succeeded; consumer media_id after=${after ? after.media_id : "row gone"}`);
    } else if (del.error) {
      if (del.error.code === "23503" || /foreign key/i.test(del.error.message)) {
        entry.deleteRuleClass = "RESTRICT / NO ACTION";
        entry.notes.push(`media DELETE rejected (${del.error.code}) => referenced media is not deletable`);
      } else { entry.deleteRuleClass = `ERROR ${del.error.code}`; entry.notes.push(del.error.message); }
    }
  } finally {
    await deleteId(table, consumerId);
    await deleteId("media_assets", sentinel);
  }
  return entry;
}

report.mediaCountBefore = await countMedia();

const builders = {
  menu_items: (id, mediaId) => ({ id, name: `PROBE ${id.slice(0,8)}`, media_id: mediaId, price: 1, is_active: true }),
  services: (id, mediaId) => ({ id, name: `PROBE ${id.slice(0,8)}`, slug: `probe-${id.slice(0,8)}`, media_id: mediaId, is_active: true, price: 1 }),
  gallery: (id, mediaId) => ({ id, title: `PROBE ${id.slice(0,8)}`, media_id: mediaId, is_active: true }),
  hero_slides: (id, mediaId) => ({ id, title: `PROBE ${id.slice(0,8)}`, media_id: mediaId, is_active: true }),
};

for (const t of ["menu_items", "services", "gallery", "hero_slides"]) {
  report.checks[t] = await probeTable(t, builders[t]);
  await sleep(400);
}

const { data: biz } = await sb.from("business_settings").select("id, logo_media_id, favicon_media_id").limit(1).maybeSingle();
report.checks.business_settings = { notes: ["singleton row - no transient insert"], logo_media_id: null, favicon_media_id: null, logo_resolves: null };
if (biz) {
  report.checks.business_settings.logo_media_id = biz.logo_media_id;
  report.checks.business_settings.favicon_media_id = biz.favicon_media_id;
  if (biz.logo_media_id) {
    const a = await sb.from("media_assets").select("id").eq("id", biz.logo_media_id).maybeSingle().catch(() => ({ data: null }));
    report.checks.business_settings.logo_resolves = !!a?.data;
  }
}

report.mediaCountAfter = await countMedia();
report.clean = report.mediaCountBefore === report.mediaCountAfter;
console.log(JSON.stringify(report, null, 2));

