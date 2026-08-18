#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import fs from "fs";

// Parse .env.local
const envContent = fs.readFileSync(".env.local", "utf-8");
const env = {};
envContent.split("\n").forEach((line) => {
  if (line.trim() && !line.startsWith("#")) {
    const [key, ...valueParts] = line.split("=");
    env[key] = valueParts.join("=").trim();
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("❌ Missing SUPABASE_URL or SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function testEndpoint(endpoint, description) {
  console.log(`\n📍 ${endpoint}`);
  console.log(`   Description: ${description}`);

  try {
    const response = await fetch(`http://localhost:3000${endpoint}`, {
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
    });

    console.log(`   Status: ${response.status}`);

    const data = await response.json().catch(() => null);
    if (data) {
      const preview =
        typeof data === "string"
          ? data.substring(0, 100)
          : JSON.stringify(data).substring(0, 100);
      console.log(`   Response: ${preview}...`);
    }

    return {
      endpoint,
      description,
      status: response.status,
      success: response.status < 400,
    };
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    return {
      endpoint,
      description,
      status: 0,
      success: false,
      error: error.message,
    };
  }
}

async function runTests() {
  console.log("🚀 ZT LOUNGE 500 ERROR FIX VERIFICATION (AUTHENTICATED)");
  console.log("=======================================================\n");

  const results = [];

  // PRIORITY: Menu Items API (was returning 500)
  console.log("📋 MENU ITEMS API (Previously 500 Error)");
  console.log("----------------------------------------");
  results.push(
    await testEndpoint(
      "/api/admin/menu-items",
      "Get all menu items - PRIORITY FIX #1"
    )
  );
  results.push(
    await testEndpoint(
      "/api/admin/menu-categories",
      "Get all menu categories - companion endpoint"
    )
  );

  // PRIORITY: Hero Slides API (was returning 500)
  console.log("\n\n🎬 HERO SLIDES API (Previously 500 Error)");
  console.log("----------------------------------------");
  results.push(
    await testEndpoint(
      "/api/admin/hero-slides",
      "Get all hero slides - PRIORITY FIX #2"
    )
  );
  results.push(
    await testEndpoint(
      "/api/admin/website-pages",
      "Get all website pages - companion endpoint"
    )
  );
  results.push(
    await testEndpoint(
      "/api/admin/business-settings",
      "Get business settings - companion endpoint"
    )
  );

  // REGRESSION: Verify other endpoints still work
  console.log("\n\n✅ REGRESSION TESTS (Should Still Work)");
  console.log("----------------------------------------");
  results.push(
    await testEndpoint(
      "/api/admin/dashboard/stats",
      "Dashboard stats - critical endpoint"
    )
  );
  results.push(
    await testEndpoint("/api/admin/notifications", "Notifications endpoint")
  );
  results.push(
    await testEndpoint("/api/admin/services", "Services endpoint")
  );
  results.push(
    await testEndpoint("/api/admin/gallery", "Gallery endpoint")
  );

  // Summary
  console.log("\n\n📊 TEST SUMMARY");
  console.log("=======================================================");

  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const total = results.length;

  console.log(`Total Tests: ${total}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);

  // Highlight priority fixes
  const menuItems = results.find(
    (r) => r.endpoint === "/api/admin/menu-items"
  );
  const heroSlides = results.find(
    (r) => r.endpoint === "/api/admin/hero-slides"
  );

  console.log("\n\n🎯 PRIORITY FIXES STATUS:");
  console.log(
    `   /api/admin/menu-items:    ${menuItems?.success ? "✅ 200 OK" : `❌ ${menuItems?.status}`}`
  );
  console.log(
    `   /api/admin/hero-slides:   ${heroSlides?.success ? "✅ 200 OK" : `❌ ${heroSlides?.status}`}`
  );

  console.log("\n\n📋 DETAILED RESULTS:");
  results.forEach((r) => {
    const icon = r.success ? "✅" : "❌";
    console.log(`${icon} ${r.endpoint.padEnd(40)} ${r.status}`);
  });

  if (passed === total) {
    console.log("\n🎉 ALL TESTS PASSED! 500 errors are fixed.");
    process.exit(0);
  } else {
    console.log(
      `\n⚠️ ${failed} test(s) failed. Check logs above for details.`
    );
    process.exit(1);
  }
}

// Wait for dev server to be ready
console.log("⏳ Waiting for dev server...");
let ready = false;
let attempts = 0;

while (!ready && attempts < 30) {
  try {
    const response = await fetch("http://localhost:3000/api/admin/services", {
      headers: {
        Authorization: `Bearer ${serviceKey}`,
      },
    });
    if (response.status < 500) {
      ready = true;
    }
  } catch {
    attempts++;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

if (!ready) {
  console.error("❌ Dev server not responding. Make sure it's running on :3000");
  process.exit(1);
}

console.log("✅ Dev server is ready!\n");
runTests();
