#!/usr/bin/env node

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

const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const API_BASE = "http://localhost:3000/api/admin";

if (!serviceKey) {
  console.error("❌ Missing SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};

let testResults = {
  phase3a: { status: "PENDING", endpoints: {}, details: [] },
  phase3b: { status: "PENDING", crudTests: {}, details: [] },
  phase3c: { status: "PENDING", mediaReplacements: {}, details: [] },
};

async function testEndpoint(method, endpoint, body = null) {
  const url = `${API_BASE}${endpoint}`;
  try {
    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(url, options);
    const data = await response.json().catch(() => null);

    return {
      status: response.status,
      success: response.ok,
      data,
      url,
    };
  } catch (error) {
    return {
      status: 0,
      success: false,
      error: error.message,
      url,
    };
  }
}

// PHASE 3A: Verify Current Database/API State
async function phase3a() {
  console.log("\n📊 PHASE 3A: VERIFY CURRENT DATABASE/API STATE");
  console.log("================================================\n");

  const endpoints = [
    "/menu-items",
    "/menu-categories",
    "/services",
    "/gallery",
    "/hero-slides",
    "/website-pages",
    "/business-settings",
  ];

  const results = {};

  for (const endpoint of endpoints) {
    console.log(`Testing GET /api/admin${endpoint}...`);
    const result = await testEndpoint("GET", endpoint);

    results[endpoint] = {
      status: result.status,
      success: result.success,
      recordCount: result.data?.data?.length || 0,
      hasData: !!result.data?.data,
      error: result.error,
    };

    console.log(
      `  ✓ Status: ${result.status} | Records: ${results[endpoint].recordCount}`
    );

    testResults.phase3a.endpoints[endpoint] = results[endpoint];
  }

  const allSuccess = Object.values(results).every((r) => r.success && r.status < 400);
  testResults.phase3a.status = allSuccess ? "PASS" : "FAIL";

  console.log(`\n→ Phase 3A: ${testResults.phase3a.status}`);
  return allSuccess;
}

// PHASE 3B: CRUD Runtime Testing
async function phase3b() {
  console.log("\n🔄 PHASE 3B: CRUD RUNTIME TESTING");
  console.log("====================================\n");

  const collections = ["menu-items", "services", "gallery"];
  const crudResults = {};

  for (const collection of collections) {
    console.log(`\nTesting CRUD for ${collection}...`);
    const collectionResults = { create: null, read: null, update: null, delete: null };

    // CREATE
    console.log(`  → CREATE...`);
    const testRecord = {
      title: `Test ${collection} ${Date.now()}`,
      description: "Temporary test record",
      is_active: true,
    };

    const createResult = await testEndpoint("POST", `/${collection}`, testRecord);
    collectionResults.create = {
      status: createResult.status,
      success: createResult.success && createResult.status === 201,
      id: createResult.data?.data?.id,
    };
    console.log(`    ✓ Status: ${createResult.status}`);

    if (!collectionResults.create.success) {
      console.log(`    ⚠️ CREATE failed, skipping READ/UPDATE/DELETE`);
      testResults.phase3b.crudTests[collection] = collectionResults;
      continue;
    }

    const testId = createResult.data?.data?.id;

    // READ
    console.log(`  → READ (ID: ${testId})...`);
    const readResult = await testEndpoint("GET", `/${collection}/${testId}`);
    collectionResults.read = {
      status: readResult.status,
      success: readResult.success && readResult.status === 200,
      id: readResult.data?.data?.id,
    };
    console.log(`    ✓ Status: ${readResult.status}`);

    // UPDATE
    console.log(`  → UPDATE...`);
    const updateData = { title: `Updated ${collection} ${Date.now()}` };
    const updateResult = await testEndpoint(
      "PATCH",
      `/${collection}/${testId}`,
      updateData
    );
    collectionResults.update = {
      status: updateResult.status,
      success: updateResult.success && updateResult.status === 200,
      id: updateResult.data?.data?.id,
    };
    console.log(`    ✓ Status: ${updateResult.status}`);

    // DELETE
    console.log(`  → DELETE...`);
    const deleteResult = await testEndpoint("DELETE", `/${collection}/${testId}`);
    collectionResults.delete = {
      status: deleteResult.status,
      success: deleteResult.success && (deleteResult.status === 200 || deleteResult.status === 204),
    };
    console.log(`    ✓ Status: ${deleteResult.status}`);

    testResults.phase3b.crudTests[collection] = collectionResults;
  }

  const allCrudSuccess = Object.values(testResults.phase3b.crudTests).every((r) =>
    ["create", "read", "update", "delete"].every(
      (op) => r[op] && r[op].success
    )
  );

  testResults.phase3b.status = allCrudSuccess ? "PASS" : "PARTIAL";

  console.log(`\n→ Phase 3B: ${testResults.phase3b.status}`);
  return allCrudSuccess;
}

// PHASE 3C: Media Replacement
async function phase3c() {
  console.log("\n📸 PHASE 3C: MEDIA REPLACEMENT VERIFICATION");
  console.log("=============================================\n");

  // For now, we'll verify that media_id field can be set and updated
  console.log("Testing media_id field integrity...");

  const testRecord = {
    title: `Media Test ${Date.now()}`,
    description: "Testing media replacement",
    is_active: true,
    media_id: null,
  };

  const createResult = await testEndpoint("POST", "/menu-items", testRecord);

  if (!createResult.success) {
    console.log(`  ❌ Failed to create test record`);
    testResults.phase3c.status = "FAIL";
    return false;
  }

  const recordId = createResult.data?.data?.id;
  console.log(`  ✓ Created record with ID: ${recordId}`);

  // Try to update media_id
  const updateResult = await testEndpoint("PATCH", `/menu-items/${recordId}`, {
    media_id: "test-media-uuid",
  });

  const mediaSuccess =
    updateResult.success && updateResult.data?.data?.media_id === "test-media-uuid";

  // Cleanup
  await testEndpoint("DELETE", `/menu-items/${recordId}`);

  testResults.phase3c.status = mediaSuccess ? "PASS" : "FAIL";
  console.log(
    `  ✓ Media ID field: ${mediaSuccess ? "✅ PASS" : "❌ FAIL"}`
  );

  return mediaSuccess;
}

// Main execution
async function runAllPhases() {
  console.log("🚀 ZT LOUNGE — PHASE 3 COMPLETE VERIFICATION");
  console.log("==============================================");

  // Wait for dev server
  console.log("\n⏳ Waiting for dev server...");
  let ready = false;
  let attempts = 0;

  while (!ready && attempts < 30) {
    try {
      const response = await fetch(`${API_BASE}/menu-items`, { headers });
      if (response.status < 500) {
        ready = true;
      }
    } catch {
      attempts++;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  if (!ready) {
    console.error("❌ Dev server not responding");
    process.exit(1);
  }

  console.log("✅ Dev server ready!\n");

  // Run phases
  const phase3aPass = await phase3a();
  const phase3bPass = await phase3b();
  const phase3cPass = await phase3c();

  // Summary
  console.log("\n\n📋 PHASE 3 SUMMARY");
  console.log("==================\n");

  console.log(`Phase 3A (Database/API):     ${testResults.phase3a.status}`);
  console.log(`Phase 3B (CRUD):             ${testResults.phase3b.status}`);
  console.log(`Phase 3C (Media):            ${testResults.phase3c.status}`);

  console.log("\n📊 Endpoint Health:");
  Object.entries(testResults.phase3a.endpoints).forEach(([endpoint, result]) => {
    const icon = result.success ? "✅" : "❌";
    console.log(
      `  ${icon} ${endpoint.padEnd(20)} | Status: ${result.status} | Records: ${result.recordCount}`
    );
  });

  console.log("\n🔄 CRUD Operations:");
  Object.entries(testResults.phase3b.crudTests).forEach(([collection, ops]) => {
    const create = ops.create?.success ? "✅" : "❌";
    const read = ops.read?.success ? "✅" : "❌";
    const update = ops.update?.success ? "✅" : "❌";
    const del = ops.delete?.success ? "✅" : "❌";
    console.log(
      `  ${collection}: Create ${create} | Read ${read} | Update ${update} | Delete ${del}`
    );
  });

  const overallPass = phase3aPass && phase3bPass && phase3cPass;

  console.log(`\n🎯 Overall Result: ${overallPass ? "✅ PASS" : "⚠️ NEEDS REVIEW"}`);

  if (!overallPass) {
    console.log("\nFailed components:");
    if (!phase3aPass) console.log("  - Phase 3A: Database/API verification");
    if (!phase3bPass) console.log("  - Phase 3B: CRUD operations");
    if (!phase3cPass) console.log("  - Phase 3C: Media replacement");
  }

  process.exit(overallPass ? 0 : 1);
}

runAllPhases();
