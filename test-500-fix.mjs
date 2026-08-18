#!/usr/bin/env node

/**
 * Test the 500 error fixes
 * Tests menu-items and hero-slides endpoints
 */

const BASE_URL = "http://localhost:3000";

// Helper to make authenticated requests
async function testAPI(endpoint, name) {
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        // These are test tokens - the server will validate them
        Cookie: "sb-access-token=test; sb-refresh-token=test",
      },
    });

    const status = response.status;
    let body;
    try {
      body = await response.json();
    } catch {
      body = await response.text();
    }

    console.log(`\n📊 ${name}`);
    console.log(`   Status: ${status}`);
    if (status !== 200) {
      console.log(`   Response:`, body);
    } else {
      if (Array.isArray(body)) {
        console.log(`   ✓ Returned ${body.length} items`);
      } else {
        console.log(`   ✓ Response OK`);
      }
    }

    return status === 200;
  } catch (err) {
    console.log(`\n❌ ${name}`);
    console.log(`   Error: ${err.message}`);
    return false;
  }
}

async function runTests() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║  500 ERROR FIX VERIFICATION                                ║");
  console.log("║  Testing menu-items and hero-slides endpoints              ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  const tests = [
    { endpoint: "/api/admin/menu-items", name: "GET /api/admin/menu-items" },
    { endpoint: "/api/admin/menu-categories", name: "GET /api/admin/menu-categories" },
    { endpoint: "/api/admin/hero-slides", name: "GET /api/admin/hero-slides" },
    { endpoint: "/api/admin/website-pages", name: "GET /api/admin/website-pages" },
    { endpoint: "/api/admin/business-settings", name: "GET /api/admin/business-settings" },
  ];

  const results = [];
  for (const test of tests) {
    const passed = await testAPI(test.endpoint, test.name);
    results.push({ ...test, passed });
    // Small delay between requests
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║  SUMMARY                                                   ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;

  for (const result of results) {
    const status = result.passed ? "✓" : "✗";
    console.log(`  ${status} ${result.name}`);
  }

  console.log(`\n  Result: ${passed}/${total} passed`);

  if (passed === total) {
    console.log("\n  ✓ All tests passed! 500 errors are fixed.");
    process.exit(0);
  } else {
    console.log("\n  ✗ Some tests failed. Check the errors above.");
    process.exit(1);
  }
}

// Wait a bit for server to be ready
setTimeout(runTests, 1000);
