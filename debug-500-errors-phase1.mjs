#!/usr/bin/env node

/**
 * PHASE 1: COMPREHENSIVE 500 ERROR DEBUGGING
 * 
 * MISSION:
 * 1. Test unauthenticated endpoints (expect 401)
 * 2. Create/find test account
 * 3. Authenticate and get real JWT
 * 4. Test authenticated endpoints
 * 5. Capture actual error responses if 500 occurs
 * 6. Trace execution path
 */

import fs from "fs";
import https from "https";

const BASE_URL = "http://localhost:3000";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const results = {
  timestamp: new Date().toISOString(),
  phase: "DEBUG_500_ERRORS_PHASE_1",
  tests: [],
};

// Helper to make HTTP requests
async function makeRequest(method, url, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === "https:" ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
    };

    const protocol = urlObj.protocol === "https:" ? https : require("http");
    const req = protocol.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        resolve({
          status: res.status,
          headers: res.headers,
          body: data,
          parsed: tryParseJson(data),
        });
      });
    });

    req.on("error", reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

function tryParseJson(str) {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

async function testUnauthenticatedEndpoints() {
  console.log("\n=== TEST 1: Unauthenticated Endpoints ===\n");

  const endpoints = [
    "/api/admin/menu-items",
    "/api/admin/hero-slides",
    "/api/admin/menu-categories",
  ];

  for (const endpoint of endpoints) {
    const testName = `GET ${endpoint} (no auth)`;
    console.log(`Testing: ${testName}`);

    try {
      const response = await makeRequest("GET", `${BASE_URL}${endpoint}`);
      const result = {
        test: testName,
        status: response.status,
        expected: 401,
        passed: response.status === 401,
        body: response.parsed,
      };
      results.tests.push(result);

      if (response.status === 401) {
        console.log(`✓ PASS: Got expected 401`);
      } else if (response.status === 404) {
        console.log(`✗ FAIL: Got 404 (route not found)`);
      } else if (response.status === 500) {
        console.log(`✗ FAIL: Got 500 (server error)`);
        console.log(`  Response:`, response.body);
      } else {
        console.log(`? UNEXPECTED: Got ${response.status}`);
      }
    } catch (error) {
      console.log(`✗ ERROR:`, error.message);
      results.tests.push({
        test: testName,
        error: error.message,
        passed: false,
      });
    }
  }
}

async function createTestAccount() {
  console.log("\n=== TEST 2: Create Test Account ===\n");

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.log("⚠ SKIP: Supabase env vars not set");
    return null;
  }

  const testEmail = `test-admin-${Date.now()}@test.zt-lounge.local`;
  const testPassword = "TestPassword123!@#";

  console.log(`Creating test account: ${testEmail}`);

  try {
    const response = await makeRequest(
      "POST",
      `${SUPABASE_URL}/auth/v1/signup`,
      {
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
      {
        email: testEmail,
        password: testPassword,
        data: {
          role: "admin",
        },
      }
    );

    if (response.status === 200 || response.status === 201) {
      console.log(`✓ Account created`);
      const user = response.parsed;
      results.tests.push({
        test: "CREATE_TEST_ACCOUNT",
        status: response.status,
        passed: true,
        userId: user?.id,
        email: testEmail,
      });
      return { email: testEmail, password: testPassword, userId: user?.id };
    } else {
      console.log(`✗ Failed: ${response.status}`);
      console.log(`  Response:`, response.body);
      results.tests.push({
        test: "CREATE_TEST_ACCOUNT",
        status: response.status,
        passed: false,
        error: response.body,
      });
      return null;
    }
  } catch (error) {
    console.log(`✗ Error:`, error.message);
    results.tests.push({
      test: "CREATE_TEST_ACCOUNT",
      error: error.message,
      passed: false,
    });
    return null;
  }
}

async function authenticateUser(email, password) {
  console.log(`\n=== TEST 3: Authenticate User ===\n`);
  console.log(`Authenticating: ${email}`);

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.log("⚠ SKIP: Supabase env vars not set");
    return null;
  }

  try {
    const response = await makeRequest(
      "POST",
      `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
      {
        email,
        password,
      }
    );

    if (response.status === 200) {
      const data = response.parsed;
      console.log(`✓ Authentication successful`);
      console.log(`  User ID: ${data.user?.id}`);
      console.log(`  Role: ${data.user?.user_metadata?.role}`);
      results.tests.push({
        test: "AUTHENTICATE_USER",
        status: response.status,
        passed: true,
        userId: data.user?.id,
        role: data.user?.user_metadata?.role,
      });
      return data.access_token;
    } else {
      console.log(`✗ Failed: ${response.status}`);
      console.log(`  Response:`, response.body);
      results.tests.push({
        test: "AUTHENTICATE_USER",
        status: response.status,
        passed: false,
        error: response.body,
      });
      return null;
    }
  } catch (error) {
    console.log(`✗ Error:`, error.message);
    results.tests.push({
      test: "AUTHENTICATE_USER",
      error: error.message,
      passed: false,
    });
    return null;
  }
}

async function testAuthenticatedEndpoints(token) {
  console.log("\n=== TEST 4: Authenticated Endpoints ===\n");

  const endpoints = [
    "/api/admin/menu-items",
    "/api/admin/hero-slides",
    "/api/admin/menu-categories",
  ];

  for (const endpoint of endpoints) {
    const testName = `GET ${endpoint} (with auth)`;
    console.log(`Testing: ${testName}`);

    try {
      const response = await makeRequest("GET", `${BASE_URL}${endpoint}`, {
        Authorization: `Bearer ${token}`,
      });

      const result = {
        test: testName,
        status: response.status,
        expected: 200,
        passed: response.status === 200,
        dataLength: Array.isArray(response.parsed)
          ? response.parsed.length
          : "N/A",
      };

      if (response.status === 200) {
        console.log(`✓ PASS: Got 200`);
        console.log(`  Data count: ${response.parsed.length || 0}`);
        if (response.parsed.length > 0) {
          console.log(
            `  First record keys: ${Object.keys(response.parsed[0]).join(", ")}`
          );
        }
      } else if (response.status === 401) {
        console.log(`✗ FAIL: Got 401 (unauthorized)`);
      } else if (response.status === 500) {
        console.log(`✗ FAIL: Got 500 (server error)`);
        console.log(`  Response:`, JSON.stringify(response.parsed, null, 2));
        result.errorBody = response.parsed;
      } else {
        console.log(`? UNEXPECTED: Got ${response.status}`);
      }

      results.tests.push(result);
    } catch (error) {
      console.log(`✗ ERROR:`, error.message);
      results.tests.push({
        test: testName,
        error: error.message,
        passed: false,
      });
    }
  }
}

async function main() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║          PHASE 1: 500 ERROR DEBUGGING LOOP                 ║");
  console.log("║         Real Authentication + Error Capture                 ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  // Step 1: Test unauthenticated endpoints
  await testUnauthenticatedEndpoints();

  // Step 2: Create test account (if Supabase available)
  const account = await createTestAccount();

  // Step 3: Authenticate
  if (account) {
    const token = await authenticateUser(account.email, account.password);

    // Step 4: Test authenticated endpoints
    if (token) {
      await testAuthenticatedEndpoints(token);
    }
  }

  // Summary
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║                    TEST SUMMARY                            ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  const passedTests = results.tests.filter((t) => t.passed).length;
  const totalTests = results.tests.length;

  console.log(`Passed: ${passedTests}/${totalTests}`);
  console.log(`Status: ${passedTests === totalTests ? "✓ ALL PASS" : "✗ FAILURES"}`);

  // Show failures
  const failures = results.tests.filter((t) => !t.passed && t.test);
  if (failures.length > 0) {
    console.log("\nFailed Tests:");
    for (const failure of failures) {
      console.log(`  - ${failure.test}`);
      if (failure.error) console.log(`    Error: ${failure.error}`);
      if (failure.status) console.log(`    Status: ${failure.status}`);
    }
  }

  // Save results
  const reportPath = "debug-500-errors-phase1-results.json";
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${reportPath}`);

  process.exit(passedTests === totalTests ? 0 : 1);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
