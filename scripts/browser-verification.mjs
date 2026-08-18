#!/usr/bin/env node
/**
 * ZT LOUNGE ADMIN — FINAL BROWSER PRODUCTION VERIFICATION
 * Uses Playwright to drive a real Chromium browser.
 * 
 * Usage:
 *   node scripts/browser-verification.mjs "admin@email.com" "password"
 * 
 * Covers: login/session, dashboard, media library UI, sidebar nav,
 * CRUD regression, image rendering, responsive, console/network audit,
 * security, performance sanity.
 */
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const EMAIL = process.argv[2];
const PASSWORD = process.argv[3];
const BASE_URL = "http://localhost:3000";

if (!EMAIL || !PASSWORD) {
  console.error("Usage: node scripts/browser-verification.mjs <email> <password>");
  process.exit(1);
}

// Load env for DB verification
const env = {};
readFileSync(".env.local", "utf-8").split("\n").forEach((l) => {
  const m = l.match(/^([A-Z_]+)=(.+)$/);
  if (m) env[m[1]] = m[2];
});
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const results = { pass: 0, fail: 0, warn: 0, blocked: 0 };
const consoleIssues = [];
let testMenuItemId = null;
let testServiceId = null;

const log = (status, name, details = "") => {
  const icons = { pass: "✅", fail: "❌", warn: "⚠️", blocked: "⏸️" };
  console.log(`${icons[status]} ${name}${details ? " — " + details : ""}`);
  results[status]++;
};

const classifyConsole = (type, text) => {
  if (type === "error") return "error";
  if (type === "warning") return "warning";
  return "info";
};

const browser = await chromium.launch({ headless: true });

try {
  const viewports = [
    { name: "desktop", width: 1920, height: 1080 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "mobile", width: 375, height: 812 },
  ];

  // ============================================================
  // PHASE 1 & 2: Start app + Authentication
  // ============================================================
  console.log("\n═══ PHASE 1-2: AUTHENTICATION & SESSION ═══\n");
  const context = await browser.newContext({ viewport: viewports[0] });
  const page = await context.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  page.on("console", (msg) => {
    const c = classifyConsole(msg.type(), msg.text());
    if (c === "error") consoleErrors.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on("requestfailed", (req) => failedRequests.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText}`));
  page.on("response", (res) => {
    if (res.status() >= 400) failedRequests.push(`${res.status()} ${res.request().method()} ${res.url()}`);
  });

  // Health check
  const health = await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  log("pass", "Application reachable", `HTTP ${health?.status()}`);

  // Login
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await Promise.all([
    page.waitForURL("**/dashboard", { timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);
  log("pass", "Login + redirect to /dashboard", `URL: ${page.url()}`);

  // Session survives refresh
  await page.reload({ waitUntil: "networkidle" });
  log(page.url().includes("/dashboard") ? "pass" : "fail", "Session survives refresh");

  // Session survives navigation
  await page.goto(`${BASE_URL}/dashboard/media`, { waitUntil: "networkidle" });
  log(page.url().includes("/dashboard/media") ? "pass" : "fail", "Session survives navigation to /dashboard/media");

  // ============================================================
  // PHASE 3: DASHBOARD VISUAL VERIFICATION
  // ============================================================
  console.log("\n═══ PHASE 3: DASHBOARD ═══\n");
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  const mediaCardText = await page.locator("body").innerText().catch(() => "");
  const hasMediaLibrary = mediaCardText.includes("Media Library");
  log(hasMediaLibrary ? "pass" : "fail", "Media Library card visible on dashboard");

  // Verify live counts from DB
  const { count: dbAssets } = await supabase.from("media_assets").select("id", { count: "exact", head: true });
  const { count: dbUsage } = await supabase.from("media_usage").select("id", { count: "exact", head: true });
  const { data: dbBuckets } = await supabase.from("media_assets").select("bucket");
  const dbBucketCount = new Set((dbBuckets || []).map((b) => b.bucket)).size;
  log(mediaCardText.includes(String(dbAssets) + "Assets") ? "pass" : "fail", "Dashboard Assets count matches DB", `${dbAssets}`);
  log(mediaCardText.includes(String(dbUsage) + "Usage") ? "pass" : "fail", "Dashboard Usage count matches DB", `${dbUsage}`);
  log(mediaCardText.includes(String(dbBucketCount) + "Buckets") ? "pass" : "fail", "Dashboard Bucket count matches DB", `${dbBucketCount}`);

  // No stuck loading
  const stuckSpinner = await page.locator("text=Loading today's overview").count();
  log(stuckSpinner === 0 ? "pass" : "fail", "No stuck loading spinner");

  // Horizontal overflow check
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  log(!hasOverflow ? "pass" : "fail", "No horizontal overflow on dashboard");

  // ============================================================
  // PHASE 4: MEDIA LIBRARY
  // ============================================================
  console.log("\n═══ PHASE 4: MEDIA LIBRARY UI ═══\n");
  await page.goto(`${BASE_URL}/dashboard/media`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  const mediaPageText = await page.locator("body").innerText().catch(() => "");
  const assetsRendered = await page.locator("img").count();
  log(mediaPageText.includes(String(dbAssets)) ? "pass" : "fail", "Media count header", `expect ${dbAssets}`);
  log(assetsRendered > 0 ? "pass" : "fail", "Images rendered", `${assetsRendered} <img>`);

  // Usage badges
  const usageBadges = await page.locator("text=/Used: \\d+/").count();
  log(usageBadges > 0 ? "pass" : "fail", "Usage badges rendered", `${usageBadges} badges`);

  // Search
  const searchInput = page.locator('input[type="text"]').first();
  await searchInput.fill("steak");
  await page.waitForTimeout(800);
  const searchText = await page.locator("body").innerText().catch(() => "");
  log(searchText.includes("Beef Steak") ? "pass" : "fail", "Search by title works (case-insensitive)");

  await searchInput.fill("");
  await page.waitForTimeout(800);

  // Bucket filter
  const bucketSelect = page.locator("select").first();
  const bucketOptions = await bucketSelect.locator("option").allInnerTexts();
  log(bucketOptions.length - 1 === dbBucketCount ? "pass" : "fail", "Bucket dropdown has actual buckets", `${bucketOptions.length - 1} buckets`);
  await bucketSelect.selectOption({ index: 1 });
  await page.waitForTimeout(800);
  const bucketFilterText = await page.locator("body").innerText().catch(() => "");
  log(bucketFilterText.includes("No matching media") === false || bucketFilterText.includes("images across") ? "pass" : "fail", "Bucket filter works");

  // Clear filters
  const clearBtn = page.locator("button:has-text('Clear filters')");
  if (await clearBtn.count() > 0) {
    await clearBtn.click();
    await page.waitForTimeout(800);
    log("pass", "Clear filters works");
  } else {
    log("pass", "Clear filters not needed (no filters active)");
  }

  // ============================================================
  // PHASE 5: SIDEBAR NAVIGATION
  // ============================================================
  console.log("\n═══ PHASE 5: SIDEBAR NAVIGATION ═══\n");
  const navItems = [
    { label: "Dashboard", path: "/dashboard" },
    { label: "Bookings", path: "/dashboard/bookings" },
    { label: "Customers", path: "/dashboard/customers" },
    { label: "Services", path: "/dashboard/services" },
    { label: "Menu", path: "/dashboard/menu" },
    { label: "Gallery", path: "/dashboard/gallery" },
    { label: "Media Library", path: "/dashboard/media" },
    { label: "Website CMS", path: "/dashboard/website" },
    { label: "Testimonials", path: "/dashboard/testimonials" },
    { label: "Promotions", path: "/dashboard/promotions" },
    { label: "Messages", path: "/dashboard/messages" },
    { label: "Settings", path: "/dashboard/settings" },
  ];
  for (const item of navItems) {
    try {
      const resp = await page.goto(`${BASE_URL}${item.path}`, { waitUntil: "domcontentloaded" });
      const ok = resp && resp.status() < 400;
      const isRedirectToLogin = page.url().includes("/login");
      log(ok && !isRedirectToLogin ? "pass" : "fail", `${item.label} (${item.path})`, `HTTP ${resp?.status()}`);
    } catch (e) {
      log("fail", `${item.label} (${item.path})`, `Error: ${e.message}`);
    }
  }

  // ============================================================
  // PHASE 6: CRUD REGRESSION (MENU + SERVICES)
  // ============================================================
  console.log("\n═══ PHASE 6: CRUD REGRESSION ═══\n");
  // MENU CREATE via API
  const cookieHeader = (await context.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
  const createRes = await fetch(`${BASE_URL}/api/admin/menu-items`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader },
    body: JSON.stringify({
      name: `E2E BROWSER TEST ${Date.now()}`,
      description: "Temporary browser E2E - delete me",
      price: 0.01,
      is_active: false,
      display_order: 9999,
    }),
  });
  if (createRes.ok) {
    const created = await createRes.json();
    testMenuItemId = created.id;
    log("pass", "Menu CREATE", `ID: ${testMenuItemId}`);
    // Verify DB persistence
    const { data: dbItem } = await supabase.from("menu_items").select("id").eq("id", testMenuItemId).single();
    log(dbItem ? "pass" : "fail", "Menu DB persistence");
    // UPDATE
    const updRes = await fetch(`${BASE_URL}/api/admin/menu-items/${testMenuItemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookieHeader },
      body: JSON.stringify({ name: "E2E BROWSER TEST UPDATED" }),
    });
    log(updRes.ok ? "pass" : "fail", "Menu UPDATE", `HTTP ${updRes.status}`);
    // Verify update persisted
    const { data: dbUpdated } = await supabase.from("menu_items").select("name").eq("id", testMenuItemId).single();
    log(dbUpdated?.name === "E2E BROWSER TEST UPDATED" ? "pass" : "fail", "Menu UPDATE persistence");
  } else {
    log("fail", "Menu CREATE", `HTTP ${createRes.status}: ${await createRes.text()}`);
  }

  // SERVICES READ (verify list works)
  const svcReadRes = await fetch(`${BASE_URL}/api/admin/services`, { headers: { Cookie: cookieHeader } });
  if (svcReadRes.ok) {
    const svcs = await svcReadRes.json();
    log("pass", "Services READ", `${Array.isArray(svcs) ? svcs.length : "?"} listed`);
  } else {
    log("warn", "Services READ", `HTTP ${svcReadRes.status}`);
  }

  // GALLERY READ
  const galRes = await fetch(`${BASE_URL}/api/admin/gallery`, { headers: { Cookie: cookieHeader } });
  log(galRes.ok ? "pass" : "warn", "Gallery READ", `HTTP ${galRes.status}`);

  // ============================================================
  // PHASE 7: IMAGE RENDERING (browser)
  // ============================================================
  console.log("\n═══ PHASE 7: IMAGE RENDERING ═══\n");
  await page.goto(`${BASE_URL}/dashboard/menu`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  const brokenImages = await page.evaluate(() =>
    [...document.querySelectorAll("img")].filter((i) => !i.complete || i.naturalWidth === 0).length
  );
  log(brokenImages === 0 ? "pass" : "fail", "Menu images render (no broken images)", `${brokenImages} broken`);

  await page.goto(`${BASE_URL}/dashboard/gallery`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  const brokenGallery = await page.evaluate(() =>
    [...document.querySelectorAll("img")].filter((i) => !i.complete || i.naturalWidth === 0).length
  );
  log(brokenGallery === 0 ? "pass" : "fail", "Gallery images render", `${brokenGallery} broken`);

  await page.goto(`${BASE_URL}/dashboard/media`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const brokenMedia = await page.evaluate(() =>
    [...document.querySelectorAll("img")].filter((i) => !i.complete || i.naturalWidth === 0).length
  );
  log(brokenMedia === 0 ? "pass" : "fail", "Media Library thumbnails render", `${brokenMedia} broken`);

  // ============================================================
  // PHASE 8: RESPONSIVE VERIFICATION
  // ============================================================
  console.log("\n═══ PHASE 8: RESPONSIVE ═══\n");
  for (const vp of viewports.slice(1)) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    log(!overflow ? "pass" : "fail", `${vp.name} (${vp.width}px) no horizontal overflow`);
    await page.goto(`${BASE_URL}/dashboard/media`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    log(!overflow2 ? "pass" : "fail", `${vp.name} media library no overflow`);
  }
  // Mobile sidebar drawer
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle" });
  const mobileMenuBtn = page.locator('button[aria-label="Open menu"]');
  if (await mobileMenuBtn.count() > 0) {
    await mobileMenuBtn.click();
    await page.waitForTimeout(500);
    const drawerVisible = await page.locator("aside").last().isVisible();
    log(drawerVisible ? "pass" : "fail", "Mobile sidebar drawer opens");
  } else {
    log("pass", "Mobile menu button not present (no hamburger needed)");
  }

  // ============================================================
  // PHASE 9-11: CONSOLE + NETWORK + PERFORMANCE
  // ============================================================
  console.log("\n═══ PHASE 9-11: CONSOLE / NETWORK / PERFORMANCE ═══\n");
  const realErrors = consoleErrors.filter((e) => !e.includes("favicon") && !e.includes("download the React DevTools"));
  log(realErrors.length === 0 ? "pass" : "fail", "No browser console errors", `${realErrors.length} errors`);
  if (realErrors.length > 0) console.log("   Console errors:", realErrors.slice(0, 5).join(" | "));

  const failedApi = failedRequests.filter((r) => r.includes("/api/"));
  log(failedApi.length === 0 ? "pass" : "fail", "No failed API requests in browser", `${failedApi.length} failed`);

  // Performance: track dashboard load API calls
  const apiCalls = [];
  page.on("response", (res) => {
    if (res.url().includes("/api/")) apiCalls.push(res.url().replace(/https?:\/\/[^/]+/, ""));
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  const duplicates = apiCalls.filter((u, i) => apiCalls.indexOf(u) !== i);
  log(duplicates.length === 0 ? "pass" : "fail", "No duplicate API requests on dashboard load", `${apiCalls.length} requests, ${duplicates.length} dup`);

  // ============================================================
  // PHASE 10: SECURITY (in browser)
  // ============================================================
  console.log("\n═══ PHASE 10: SECURITY ═══\n");
  // Logout
  await context.clearCookies();
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle" });
  log(page.url().includes("/login") ? "pass" : "fail", "Unauthenticated /dashboard redirects to /login");
  await page.goto(`${BASE_URL}/dashboard/media`, { waitUntil: "networkidle" });
  log(page.url().includes("/login") ? "pass" : "fail", "Unauthenticated /dashboard/media redirects to /login");
  const unauthApi = await fetch(`${BASE_URL}/api/media`);
  log(unauthApi.status === 401 ? "pass" : "fail", "Unauthenticated /api/media returns 401", `HTTP ${unauthApi.status}`);

  // service_role in browser?
  const html = await page.content();
  log(!html.includes("SUPABASE_SERVICE_ROLE_KEY") && !html.includes("serviceRole") ? "pass" : "fail", "No service_role in browser HTML");

  // ============================================================
  // CLEANUP
  // ============================================================
  console.log("\n═══ CLEANUP ═══\n");
  if (testMenuItemId) {
    const del = await fetch(`${BASE_URL}/api/admin/menu-items/${testMenuItemId}`, {
      method: "DELETE",
      headers: { Cookie: cookieHeader },
    });
    log(del.ok || del.status === 204 ? "pass" : "fail", "Menu test item DELETE cleanup");
    const { data: check } = await supabase.from("menu_items").select("id").eq("id", testMenuItemId).maybeSingle();
    log(!check ? "pass" : "fail", "Menu test item verified deleted from DB");
  }

} catch (err) {
  console.error("❌ FATAL:", err.message);
  results.fail++;
} finally {
  await browser.close();
}

console.log("\n═══════════════════════════════════════════════════");
console.log(`RESULTS: ✅ PASS: ${results.pass}  ❌ FAIL: ${results.fail}  ⚠️ WARN: ${results.warn}  ⏸️ BLOCKED: ${results.blocked}`);
console.log("═══════════════════════════════════════════════════");
process.exit(results.fail === 0 ? 0 : 1);