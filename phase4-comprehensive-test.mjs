#!/usr/bin/env node

/**
 * PHASE 4: Real Authenticated Runtime Test
 * Tests the actual runtime behavior with real Supabase authentication
 */

import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment
const envFile = path.join(__dirname, ".env.local");
if (!fs.existsSync(envFile)) {
  console.error("❌ .env.local not found");
  process.exit(1);
}

const env = {};
fs.readFileSync(envFile, "utf-8")
  .split("\n")
  .forEach((line) => {
    if (line.trim() && !line.startsWith("#")) {
      const [key, ...valueParts] = line.split("=");
      env[key.trim()] = valueParts.join("=").trim();
    }
  });

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !SERVICE_ROLE_KEY) {
  console.error("❌ Missing Supabase credentials in .env.local");
  process.exit(1);
}

const results = {
  timestamp: new Date().toISOString(),
  tests: [],
  errors: [],
};

async function getAdminUser() {
  console.log("\n📋 Fetching admin test user...");

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    // Check profiles table for admin users
    const { data: profiles, error: profileError } = await admin
      .from("profiles")
      .select("id, email, role")
      .in("role", ["super_admin", "admin"])
      .limit(1);

    if (profileError) {
      console.error("Error fetching profiles:", profileError);
      return null;
    }

    if (profiles && profiles.length > 0) {
      const profile = profiles[0];
      console.log(`✓ Found admin profile: ${profile.email || profile.id}`);
      return { id: profile.id, email: profile.email };
    }

    // Fallback: try to list users
    try {
      const { data: users, error } = await admin.auth.admin.listUsers();

      if (error) {
        console.error("Error listing users:", error);
        return null;
      }

      // users might be an array or have users property
      const userArray = Array.isArray(users) ? users : users?.users || [];
      
      if (userArray.length === 0) {
        console.error("❌ No users found");
        return null;
      }

      // Find one with admin role
      const adminUser = userArray.find((u) => {
        const role = u.user_metadata?.role || u.app_metadata?.role;
        return (
          role === "super_admin" ||
          role === "admin" ||
          u.email?.includes("admin")
        );
      });

      if (adminUser) {
        console.log(`✓ Found admin user: ${adminUser.email}`);
        return adminUser;
      }

      // Just use first user
      if (userArray[0]) {
        console.log(`✓ Using first user: ${userArray[0].email}`);
        return userArray[0];
      }
    } catch (userError) {
      console.error("Error with user listing fallback:", userError.message);
    }

    console.error("❌ No admin user found");
    return null;
  } catch (err) {
    console.error("Error:", err.message);
    return null;
  }
}

async function getSessionToken(adminUser) {
  console.log("\n🔑 Creating test session...");

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    // Generate access token with long expiry
    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: adminUser.email,
      options: {
        redirectTo: "http://localhost:3000/dashboard",
      },
    });

    if (error) {
      console.error("Error generating link:", error);
      // Fallback: create a session directly
      console.log("Attempting direct session creation...");

      // Get user's refresh token or create one
      const { data: session, error: sessionError } =
        await admin.auth.admin.createSession({
          userId: adminUser.id,
          expiresIn: 3600,
        });

      if (sessionError) {
        console.error("❌ Session creation failed:", sessionError);
        return null;
      }

      console.log(`✓ Session created`);
      return session?.access_token;
    }

    // Extract token from link
    if (data?.properties?.email_link) {
      const url = new URL(data.properties.email_link);
      const token = url.searchParams.get("access_token");
      if (token) {
        console.log(`✓ Token generated from email link`);
        return token;
      }
    }

    return null;
  } catch (err) {
    console.error("Error:", err.message);
    return null;
  }
}

async function testEndpoint(name, url, token) {
  console.log(`\n🧪 Testing: ${name}`);
  console.log(`   URL: ${url}`);

  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    const duration = Date.now() - startTime;
    const contentType = response.headers.get("content-type");
    let body = "";

    if (contentType?.includes("application/json")) {
      body = await response.json();
    } else {
      body = await response.text();
    }

    const test = {
      name,
      url,
      status: response.status,
      duration,
      headers: {
        contentType,
      },
      body:
        typeof body === "string"
          ? body.substring(0, 200)
          : JSON.stringify(body).substring(0, 200),
      success: response.status === 200,
    };

    results.tests.push(test);

    if (response.status === 200) {
      console.log(`   ✓ ${response.status} OK (${duration}ms)`);
      if (Array.isArray(body) && body.length > 0) {
        console.log(`   ✓ Valid data (${body.length} items)`);
      } else if (typeof body === "object") {
        console.log(
          `   ✓ Valid JSON response (${Object.keys(body).length} keys)`
        );
      }
      return true;
    } else {
      console.log(`   ✗ ${response.status} ${response.statusText}`);
      console.log(`   Response: ${JSON.stringify(body).substring(0, 100)}`);
      return false;
    }
  } catch (err) {
    console.error(`   ✗ Request failed: ${err.message}`);
    results.errors.push({ endpoint: name, error: err.message });
    return false;
  }
}

async function main() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║  PHASE 4: REAL AUTHENTICATED RUNTIME VERIFICATION          ║");
  console.log("║  Testing /api/admin/[resource] with real Supabase auth    ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  // Get admin user
  const adminUser = await getAdminUser();
  if (!adminUser) {
    console.error("❌ Could not find admin user - cannot proceed");
    process.exit(1);
  }

  // Get session token
  const token = await getSessionToken(adminUser);
  if (!token) {
    console.error("❌ Could not create session - cannot proceed");
    process.exit(1);
  }

  const BASE_URL = "http://localhost:3000";

  // Test critical endpoints
  const endpoints = [
    { name: "Menu Items", path: "/api/admin/menu-items" },
    { name: "Hero Slides", path: "/api/admin/hero-slides" },
    { name: "Menu Categories", path: "/api/admin/menu-categories" },
    { name: "Website Pages", path: "/api/admin/website-pages" },
    { name: "Business Settings", path: "/api/admin/business-settings" },
    { name: "Services", path: "/api/admin/services" },
  ];

  let passed = 0;
  let failed = 0;

  for (const endpoint of endpoints) {
    const success = await testEndpoint(
      endpoint.name,
      `${BASE_URL}${endpoint.path}`,
      token
    );
    if (success) passed++;
    else failed++;
  }

  // Summary
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║  TEST SUMMARY                                              ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log(
    `\n✓ Passed: ${passed}/${endpoints.length}`
  );
  if (failed > 0) {
    console.log(`✗ Failed: ${failed}/${endpoints.length}`);
  }

  // Write results
  const reportFile = path.join(__dirname, "phase4-results.json");
  fs.writeFileSync(reportFile, JSON.stringify(results, null, 2));
  console.log(`\n📄 Results saved to: ${reportFile}`);

  if (failed > 0) {
    console.log("\n❌ PHASE 4 FAILED - Some endpoints returned errors");
    process.exit(1);
  } else {
    console.log("\n✓ PHASE 4 PASSED - All authenticated endpoints successful");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
