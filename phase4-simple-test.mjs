#!/usr/bin/env node

/**
 * PHASE 4: Simple Runtime Test
 * Tests endpoints to capture actual errors (not just 500s)
 */

import http from "http";

const BASE_URL = "http://localhost:3000";

const endpoints = [
  { name: "Menu Items", path: "/api/admin/menu-items" },
  { name: "Hero Slides", path: "/api/admin/hero-slides" },
  { name: "Menu Categories", path: "/api/admin/menu-categories" },
  { name: "Website Pages", path: "/api/admin/website-pages" },
  { name: "Business Settings", path: "/api/admin/business-settings" },
];

async function testEndpoint(name, path) {
  console.log(`\n🧪 Testing: ${name}`);
  console.log(`   Path: ${path}`);

  const startTime = Date.now();

  return new Promise((resolve) => {
    const url = new URL(path, BASE_URL);
    const req = http.get(url, (res) => {
      const duration = Date.now() - startTime;
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          const body = JSON.parse(data);
          const test = {
            name,
            path,
            status: res.statusCode,
            duration,
            body: JSON.stringify(body).substring(0, 300),
          };

          if (res.statusCode === 401) {
            console.log(`   ✓ ${res.statusCode} Unauthorized (expected for unauthenticated)`);
          } else if (res.statusCode === 200) {
            console.log(`   ✓ ${res.statusCode} OK (${duration}ms)`);
            if (Array.isArray(body)) {
              console.log(`   ✓ Data array (${body.length} items)`);
            } else if (typeof body === "object") {
              console.log(`   ✓ Object response (${Object.keys(body).length} keys)`);
            }
          } else if (res.statusCode >= 500) {
            console.log(`   ✗ ${res.statusCode} ${res.statusText || "Server Error"}`);
            console.log(`   Response: ${data.substring(0, 200)}`);
          } else {
            console.log(`   ? ${res.statusCode}`);
            console.log(`   Response: ${data.substring(0, 200)}`);
          }

          resolve(test);
        } catch (e) {
          console.log(`   ✗ Failed to parse JSON: ${data.substring(0, 100)}`);
          resolve({
            name,
            path,
            status: res.statusCode,
            duration,
            error: "Failed to parse response",
          });
        }
      });
    });

    req.on("error", (err) => {
      console.error(`   ✗ Request failed: ${err.message}`);
      resolve({ name, path, error: err.message });
    });
  });
}

async function main() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║  PHASE 4: RUNTIME ERROR INSPECTION                          ║");
  console.log("║  Testing endpoints without authentication (401 expected)    ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  const results = [];

  for (const endpoint of endpoints) {
    const result = await testEndpoint(endpoint.name, endpoint.path);
    results.push(result);
  }

  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║  SUMMARY                                                   ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  const has500 = results.some((r) => r.status >= 500);
  const has401 = results.some((r) => r.status === 401);

  console.log(`\n✓ Total endpoints tested: ${results.length}`);
  if (has401) console.log("✓ Unauthenticated requests return 401 (expected)");
  if (has500) {
    console.log(
      "✗ Found 500 errors - endpoints may have database/schema issues"
    );
    results.forEach((r) => {
      if (r.status >= 500) {
        console.log(`  - ${r.name}: ${r.status}`);
      }
    });
  } else {
    console.log("✓ No 500 errors found at unauthenticated level");
  }

  console.log("\n📋 Next: Run authenticated tests to verify database queries");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
