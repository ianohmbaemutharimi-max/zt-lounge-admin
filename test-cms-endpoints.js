#!/usr/bin/env node
/**
 * Test CMS endpoints to see if they work and measure timing
 */

const fs = require("fs");
const path = require("path");

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
  process.exit(1);
}

const { createClient } = require("@supabase/supabase-js");

async function testEndpoint(label, baseUrl, jwt, endpoint) {
  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      headers: {
        "Authorization": `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
    });
    
    const ms = Date.now() - start;
    const status = res.status;
    const contentType = res.headers.get("content-type");
    let body = "no body";
    
    if (contentType?.includes("json")) {
      body = await res.json();
      if (body.error) {
        body = `Error: ${body.error}`;
      } else if (Array.isArray(body)) {
        body = `${body.length} items`;
      } else {
        body = JSON.stringify(body).slice(0, 100);
      }
    } else {
      body = await res.text();
      body = body.slice(0, 100);
    }
    
    console.log(`  ${label.padEnd(25)} ${status} ${ms.toString().padStart(5)}ms  ${body}`);
    return { status, ms };
  } catch (e) {
    const ms = Date.now() - start;
    console.log(`  ${label.padEnd(25)} ERR  ${ms.toString().padStart(5)}ms  ${e.message}`);
    return { status: 0, ms };
  }
}

async function main() {
  console.log("🧪 CMS Endpoint Test\n");
  
  const admin = createClient(URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  
  // Get a real admin user
  const { data: { users } } = await admin.auth.admin.listUsers();
  const adminUser = users.find(u => u.email?.includes("admin") || u.email?.includes("test"));
  
  if (!adminUser) {
    console.error("❌ No admin test user found");
    process.exit(1);
  }
  
  console.log(`Using user: ${adminUser.email}`);
  
  // Sign in
  const anonClient = createClient(URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  
  const { data: signIn, error: signInErr } = await anonClient.auth.signInWithPassword({
    email: adminUser.email,
    password: "PerfTest!234",
  });
  
  if (signInErr || !signIn?.session) {
    console.error("❌ Sign in failed:", signInErr?.message);
    // Try getting a session token another way
    console.log("⚠️  Using service role key for direct testing instead\n");
    
    // Test via PostgREST directly
    console.log("📊 DIRECT POSTGREST (service-role, no auth)");
    console.log("─".repeat(60));
    
    const endpoints = [
      "/rest/v1/business-settings?select=*&limit=1",
      "/rest/v1/website-pages?select=*&limit=1",
      "/rest/v1/hero-slides?select=*&limit=1",
      "/rest/v1/gallery?select=*&limit=1",
    ];
    
    for (const endpoint of endpoints) {
      const start = Date.now();
      const res = await fetch(URL + endpoint, {
        headers: {
          apikey: SERVICE_KEY,
          Accept: "application/json",
        },
      });
      const ms = Date.now() - start;
      const status = res.status;
      const body = await res.json();
      console.log(`  ${endpoint.padEnd(50)} ${status} ${ms.toString().padStart(5)}ms  ${Array.isArray(body) ? body.length + " rows" : JSON.stringify(body).slice(0, 50)}`);
    }
    
    process.exit(0);
  }
  
  const jwt = signIn.session.access_token;
  console.log(`JWT obtained (len: ${jwt.length})\n`);
  
  // Test endpoints
  console.log("📊 API ENDPOINT TEST (with auth)");
  console.log("─".repeat(60));
  
  const baseUrl = URL.replace("https://", "http://localhost:3000/api").replace("supabase.co", "");
  
  // Use actual Next.js server URLs instead
  const endpoints = [
    ["/api/admin/gallery", "gallery"],
    ["/api/admin/business-settings", "business-settings"],
    ["/api/admin/website-pages", "website-pages"],
    ["/api/admin/hero-slides", "hero-slides"],
    ["/api/admin/notifications", "notifications"],
  ];
  
  for (const [endpoint, label] of endpoints) {
    await testEndpoint(label, "http://localhost:3000", jwt, endpoint);
  }
  
  console.log("\n");
  process.exit(0);
}

main().catch(e => {
  console.error("❌ Fatal error:", e.message);
  process.exit(1);
});
