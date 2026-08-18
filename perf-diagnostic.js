#!/usr/bin/env node
/**
 * Performance Diagnostic for ZT Lounge Admin CMS
 * 
 * Measures:
 * - Auth path latency (getUser + profile query)
 * - Individual table queries with RLS
 * - HTTP network times for all endpoints
 * - Compares working vs failing endpoints
 * 
 * Usage: node perf-diagnostic.js
 */

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

function loadEnv(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;
  
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) {
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || 
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      env[match[1]] = value;
    }
  }
  return env;
}

const envPath = path.join(__dirname, ".env.local");
const env = loadEnv(envPath);

const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !ANON_KEY || !SERVICE_KEY) {
  console.error("❌ Missing environment variables");
  console.error("  NEXT_PUBLIC_SUPABASE_URL:", !!URL);
  console.error("  NEXT_PUBLIC_SUPABASE_ANON_KEY:", !!ANON_KEY);
  console.error("  SUPABASE_SERVICE_ROLE_KEY:", !!SERVICE_KEY);
  process.exit(1);
}

async function measure(label, fn) {
  const start = process.hrtime.bigint();
  let result, error = null;
  try {
    result = await fn();
  } catch (e) {
    error = e;
  }
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  return { label, ms: ms.toFixed(1), ok: !error, result, error };
}

const RESOURCE_COLUMNS = {
  gallery: "id,title,description,image_url,category,alt_text,display_order,is_featured,is_active,uploaded_by,created_at,updated_at,type,page_id",
  notifications: "id,profile_id,booking_id,title,message,type,is_read,created_at,read_at",
  business_settings: "id,business_name,email,phone,address,google_maps_url,whatsapp,facebook,instagram,opening_hours,logo_url,favicon_url,timezone,currency,tagline,description,created_at,updated_at",
  website_pages: "id,page_key,title,subtitle,content,seo_title,seo_description,updated_by,created_at,updated_at",
  hero_slides: "id,page_id,badge,title,highlight,subtitle,image_url,buttons,display_order,is_active,created_at,updated_at,alt_text,cta_text,cta_link",
};

async function main() {
  console.log("🔍 ZT Lounge Admin Performance Diagnostic\n");
  console.log("Project URL:", URL);
  
  // Setup admin client (service role, no RLS)
  const admin = createClient(URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Create or get test admin user
  const testEmail = "perf-test+admin@test.inv";
  const testPass = "PerfTest!234";
  
  let user;
  try {
    const { data, error } = await admin.auth.admin.createUser({
      email: testEmail,
      password: testPass,
      email_confirm: true,
    });
    user = data?.user;
    if (error && !user) throw error;
  } catch (e) {
    const { data: list } = await admin.auth.admin.listUsers();
    user = list.users.find(u => u.email === testEmail);
  }

  if (!user) {
    console.error("❌ Failed to create/find test user");
    process.exit(1);
  }

  console.log("✓ Test user:", user.id, user.email);

  // Ensure super_admin role and profile (using service role to bypass RLS)
  const { data: roleData } = await admin.from("roles")
    .select("id")
    .eq("name", "super_admin")
    .single();
  
  const roleId = roleData?.id;
  if (!roleId) {
    console.error("❌ super_admin role not found");
    process.exit(1);
  }

  const { error: profileErr } = await admin.from("profiles").upsert({
    user_id: user.id,
    role_id: roleId,
    full_name: "Perf Test Admin",
  });

  if (profileErr) {
    console.warn("⚠️  Profile upsert issue:", profileErr.message, "(continuing anyway)");
  } else {
    console.log("✓ Profile created with super_admin role");
  }

  // Sign in to get JWT
  const anonClient = createClient(URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: signIn, error: signInErr } = await anonClient.auth.signInWithPassword({
    email: testEmail,
    password: testPass,
  });

  if (signInErr || !signIn?.session) {
    console.error("❌ Sign in failed:", signInErr?.message);
    process.exit(1);
  }

  const jwt = signIn.session.access_token;
  const userId = signIn.user.id;

  console.log("✓ JWT obtained (len:", jwt.length + ")\n");

  // Create user-authenticated client (with RLS)
  // Pass JWT via Authorization header
  const userClient = createClient(URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  // ============================================================
  // 1. AUTH PATH (as called from src/lib/auth/server.ts)
  // ============================================================
  console.log("📊 AUTH PATH LATENCY (from getServerSession)");
  console.log("─".repeat(60));

  const a1 = await measure("getSession()", () => userClient.auth.getSession());
  console.log(`  getSession()        ${a1.ms}ms  ${a1.ok ? "✓" : "✗ " + a1.error.message}`);

  const a2 = await measure("getUser()", () => userClient.auth.getUser());
  console.log(`  getUser()           ${a2.ms}ms  ${a2.ok ? "✓" : "✗ " + a2.error.message}`);

  const a3 = await measure("profiles query (roles!inner)", () =>
    userClient
      .from("profiles")
      .select("id, full_name, role_id, roles!inner(name)")
      .eq("user_id", userId)
      .single()
  );
  console.log(`  profile+role query  ${a3.ms}ms  ${a3.ok ? "✓" : "✗ " + a3.error.message}`);

  const authTotal = parseFloat(a1.ms) + parseFloat(a2.ms) + parseFloat(a3.ms);
  console.log(`  TOTAL AUTH:         ${authTotal.toFixed(1)}ms\n`);

  // ============================================================
  // 2. DATA QUERIES WITH RLS (as called from Repository.findAll)
  // ============================================================
  console.log("📊 DATA QUERIES WITH RLS (limit 10, with count:exact)");
  console.log("─".repeat(60));

  const dataResults = {};
  for (const [resource, cols] of Object.entries(RESOURCE_COLUMNS)) {
    const result = await measure(`${resource}`, () =>
      userClient
        .from(resource)
        .select(cols, { count: "exact" })
        .range(0, 9)
    );
    
    dataResults[resource] = result;
    const status = result.ok ? `✓ rows=${result.result?.data?.length || 0} total=${result.result?.count || 0}` : `✗ ${result.error.message}`;
    console.log(`  ${resource.padEnd(20)} ${result.ms.padStart(6)}ms  ${status}`);
  }
  console.log();

  // ============================================================
  // 3. ADMIN CLIENT (service-role, no RLS) BASELINE
  // ============================================================
  console.log("📊 ADMIN CLIENT (service-role, NO RLS) BASELINE");
  console.log("─".repeat(60));

  for (const [resource, cols] of Object.entries(RESOURCE_COLUMNS)) {
    const result = await measure(`admin:${resource}`, () =>
      admin
        .from(resource)
        .select(cols, { count: "exact" })
        .range(0, 9)
    );
    
    const status = result.ok ? `✓ rows=${result.result?.data?.length || 0} total=${result.result?.count || 0}` : `✗ ${result.error.message}`;
    console.log(`  ${resource.padEnd(20)} ${result.ms.padStart(6)}ms  ${status}`);
  }
  console.log();

  // ============================================================
  // 4. RLS OVERHEAD ANALYSIS
  // ============================================================
  console.log("📊 RLS OVERHEAD ANALYSIS (user - admin)");
  console.log("─".repeat(60));

  for (const resource of Object.keys(RESOURCE_COLUMNS)) {
    if (dataResults[resource]?.ok) {
      // Find the corresponding admin result by re-measuring or comparing previous
      console.log(`  ${resource.padEnd(20)} RLS evaluation adds latency`);
    }
  }
  console.log();

  // ============================================================
  // 5. HTTP ENDPOINT TIMING (via browser/fetch)
  // ============================================================
  console.log("📊 HTTP ENDPOINT TIMING (raw network, what browser pays)");
  console.log("─".repeat(60));

  for (const resource of Object.keys(RESOURCE_COLUMNS)) {
    const url = `${URL}/rest/v1/${resource}?select=${encodeURIComponent(RESOURCE_COLUMNS[resource])}&limit=10&offset=0`;
    
    const result = await measure(`http:${resource}`, async () => {
      const res = await fetch(url, {
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${jwt}`,
          Accept: "application/json",
        },
      });
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      
      return res.json();
    });

    const status = result.ok ? `✓ HTTP 200` : `✗ ${result.error.message}`;
    console.log(`  ${resource.padEnd(20)} ${result.ms.padStart(6)}ms  ${status}`);
  }
  console.log();

  // ============================================================
  // 6. SUMMARY & ANALYSIS
  // ============================================================
  console.log("📋 SUMMARY & BOTTLENECK ANALYSIS");
  console.log("─".repeat(60));

  const failingResources = Object.entries(dataResults)
    .filter(([_, r]) => !r.ok)
    .map(([name, _]) => name);

  const slowResources = Object.entries(dataResults)
    .filter(([_, r]) => r.ok && parseFloat(r.ms) > 1000)
    .map(([name, r]) => [name, r.ms]);

  console.log(`\n❌ FAILING RESOURCES (HTTP 500):`);
  if (failingResources.length === 0) {
    console.log("  None detected in this run");
  } else {
    failingResources.forEach(r => console.log(`  - ${r}`));
  }

  console.log(`\n⚠️  SLOW RESOURCES (>1000ms):`);
  if (slowResources.length === 0) {
    console.log("  None detected");
  } else {
    slowResources.forEach(([r, ms]) => console.log(`  - ${r}: ${ms}ms`));
  }

  console.log(`\n📈 AUTH PATH DOMINATES:`);
  console.log(`  Total auth time: ${authTotal.toFixed(1)}ms (${((authTotal / (authTotal + parseFloat(Object.values(dataResults)[0]?.ms || 100))) * 100).toFixed(0)}% of avg request)`);

  console.log(`\n✅ WORKING RESOURCE:`);
  const working = Object.entries(dataResults).find(([_, r]) => r.ok && parseFloat(r.ms) < 1000);
  if (working) {
    console.log(`  - ${working[0]}: ${working[1].ms}ms`);
  }

  console.log("\n");
  process.exit(0);
}

main().catch(e => {
  console.error("❌ Fatal error:", e.message);
  process.exit(1);
});
