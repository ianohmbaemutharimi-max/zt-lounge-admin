#!/usr/bin/env node

import { execSync } from "child_process";
import fs from "fs";

const API_BASE = "http://localhost:3000/api/admin";

// Get auth token from .env.local
let authToken = null;
try {
  const envContent = fs.readFileSync(".env.local", "utf-8");
  const match = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/);
  if (match) {
    authToken = match[1].trim();
  }
} catch (e) {
  console.warn("⚠️ Could not read auth token from .env.local");
}

const headers = authToken
  ? { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" }
  : { "Content-Type": "application/json" };

async function testEndpoint(method, endpoint, body = null) {
  const url = `${API_BASE}${endpoint}`;
  console.log(`\n📍 ${method} ${endpoint}`);

  try {
    const options = {
      method,
      headers,
      ...(body && { body: JSON.stringify(body) }),
    };

    const response = await fetch(url, options);
    const data = await response.json().catch(() => null);

    console.log(`   Status: ${response.status}`);
    if (data) {
      console.log(`   Response: ${JSON.stringify(data).substring(0, 200)}...`);
    }

    return {
      endpoint,
      method,
      status: response.status,
      success: response.ok,
      data,
    };
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    return {
      endpoint,
      method,
      status: 0,
      success: false,
      error: error.message,
    };
  }
}

async function runTests() {
  console.log("🚀 ZT LOUNGE 500 ERROR FIX VERIFICATION");
  console.log("=========================================\n");

  const results = [];

  // PRIORITY: Menu Items API (was returning 500)
  console.log("📋 MENU ITEMS API (Previously 500 Error)");
  console.log("----------------------------------------");
  results.push(await testEndpoint("GET", "/menu-items"));
  results.push(await testEndpoint("GET", "/menu-categories"));

  // PRIORITY: Hero Slides API (was returning 500)
  console.log("\n\n🎬 HERO SLIDES API (Previously 500 Error)");
  console.log("----------------------------------------");
  results.push(await testEndpoint("GET", "/hero-slides"));
  results.push(await testEndpoint("GET", "/website-pages"));
  results.push(await testEndpoint("GET", "/business-settings"));

  // REGRESSION: Verify other endpoints still work
  console.log("\n\n✅ REGRESSION TESTS (Should Still Work)");
  console.log("----------------------------------------");
  results.push(await testEndpoint("GET", "/dashboard/stats"));
  results.push(await testEndpoint("GET", "/notifications"));
  results.push(await testEndpoint("GET", "/services"));
  results.push(await testEndpoint("GET", "/gallery"));

  // Summary
  console.log("\n\n📊 TEST SUMMARY");
  console.log("=========================================");

  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const total = results.length;

  console.log(`Total Tests: ${total}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);

  // Highlight priority fixes
  const menuItems = results.find(
    (r) => r.endpoint === "/menu-items" && r.method === "GET"
  );
  const heroSlides = results.find(
    (r) => r.endpoint === "/hero-slides" && r.method === "GET"
  );

  console.log("\n\n🎯 PRIORITY FIXES:");
  console.log(
    `   /api/admin/menu-items:    ${menuItems?.success ? "✅ 200 OK" : `❌ ${menuItems?.status}`}`
  );
  console.log(
    `   /api/admin/hero-slides:   ${heroSlides?.success ? "✅ 200 OK" : `❌ ${heroSlides?.status}`}`
  );

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
    const response = await fetch(`${API_BASE}/dashboard/stats`, { headers });
    if (response.ok || response.status === 401) {
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
