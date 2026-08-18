#!/usr/bin/env node

/**
 * COMPREHENSIVE BOOKING SYSTEM RUNTIME VERIFICATION
 * 
 * Executes all 15 phases of booking production readiness testing
 * against the live Supabase database and Next.js application.
 * 
 * Usage:
 *   node scripts/booking-runtime-verification.mjs <email> <password>
 * 
 * Or with environment variables:
 *   TEST_ADMIN_EMAIL=... TEST_ADMIN_PASSWORD=... node scripts/booking-runtime-verification.mjs
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

// Load environment
dotenv.config({ path: path.join(rootDir, ".env.local") });

// ============================================================
// CONFIGURATION
// ============================================================

const TEST_ADMIN_EMAIL = process.argv[2] || process.env.TEST_ADMIN_EMAIL;
const TEST_ADMIN_PASSWORD = process.argv[3] || process.env.TEST_ADMIN_PASSWORD;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const BOOKING_PREFIX = `AUDIT-${Date.now()}`;

// ============================================================
// VALIDATION
// ============================================================

if (!TEST_ADMIN_EMAIL || !TEST_ADMIN_PASSWORD) {
  console.error("❌ ERROR: Missing credentials");
  console.error("\nUsage:");
  console.error("  node scripts/booking-runtime-verification.mjs <email> <password>");
  console.error("\nOr set environment variables:");
  console.error("  TEST_ADMIN_EMAIL=your-email@example.com");
  console.error("  TEST_ADMIN_PASSWORD=your-password\n");
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ ERROR: Missing Supabase configuration in .env.local");
  console.error("Required:");
  console.error("  - NEXT_PUBLIC_SUPABASE_URL");
  console.error("  - NEXT_PUBLIC_SUPABASE_ANON_KEY");
  console.error("  - SUPABASE_SERVICE_ROLE_KEY\n");
  process.exit(1);
}

// ============================================================
// RESULT TRACKING
// ============================================================

const results = {
  timestamp: new Date().toISOString(),
  phases: {},
  summary: {
    passed: 0,
    failed: 0,
    blocked: 0,
    skipped: 0,
  },
  critical_gates: {
    migration_verified: false,
    crud_verified: false,
    overlap_verified: false,
    concurrency_verified: false,
    status_machine_verified: false,
    authorization_verified: false,
  },
  errors: [],
  test_bookings_created: [],
};

// ============================================================
// LOGGING
// ============================================================

function log(phase, message) {
  const timestamp = new Date().toISOString().split("T")[1].split(".")[0];
  console.log(`[${timestamp}] [${phase}] ${message}`);
}

function pass(phase, detail = "") {
  log(phase, `✓ PASS ${detail}`);
  if (!results.phases[phase]) results.phases[phase] = [];
  results.phases[phase].push({ status: "PASS", detail });
  results.summary.passed++;
}

function fail(phase, error) {
  log(phase, `✗ FAIL: ${error}`);
  if (!results.phases[phase]) results.phases[phase] = [];
  results.phases[phase].push({ status: "FAIL", error });
  results.summary.failed++;
  results.errors.push({ phase, error });
}

function skip(phase, reason) {
  log(phase, `⊘ SKIP: ${reason}`);
  if (!results.phases[phase]) results.phases[phase] = [];
  results.phases[phase].push({ status: "SKIP", reason });
  results.summary.skipped++;
}

function block(phase, reason) {
  log(phase, `🚫 BLOCKED: ${reason}`);
  if (!results.phases[phase]) results.phases[phase] = [];
  results.phases[phase].push({ status: "BLOCKED", reason });
  results.summary.blocked++;
}

// ============================================================
// UTILITIES
// ============================================================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function makeAuthenticatedRequest(url, method, accessToken, body = null) {
  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
      "Cookie": `sb-access-token=${accessToken}; sb-refresh-token=dummy`,
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  return { response, data };
}

// ============================================================
// SUPABASE CLIENTS
// ============================================================

const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabaseService = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// ============================================================
// PHASE 0: PREREQUISITES
// ============================================================

async function phase0_prerequisites() {
  const phase = "PHASE-0";
  log(phase, "Checking prerequisites...");

  // Check Supabase connectivity
  try {
    const { error } = await supabaseService.from("bookings").select("count", { count: "exact", head: true });
    if (error) throw error;
    pass(phase, "Supabase connectivity OK");
  } catch (error) {
    fail(phase, `Supabase connectivity failed: ${error.message}`);
    return false;
  }

  // Check authentication
  try {
    const { data, error } = await supabaseAnon.auth.signInWithPassword({
      email: TEST_ADMIN_EMAIL,
      password: TEST_ADMIN_PASSWORD,
    });

    if (error) throw error;
    if (!data.session) throw new Error("No session returned");

    pass(phase, `Authentication successful (${TEST_ADMIN_EMAIL})`);
    return data.session.access_token;
  } catch (error) {
    fail(phase, `Authentication failed: ${error.message}`);
    return false;
  }
}

// ============================================================
// PHASE 1: DISCOVER REAL FOREIGN KEY IDS
// ============================================================

async function phase1_discoverIds() {
  const phase = "PHASE-1";
  log(phase, "Discovering real customer/service/staff IDs...");

  const ids = {
    customer: null,
    service: null,
    staff: null,
  };

  try {
    // Get first customer
    const { data: customers, error: custError } = await supabaseService
      .from("customers")
      .select("id")
      .limit(1);

    if (custError) throw new Error(`Customer query failed: ${custError.message}`);
    if (!customers || customers.length === 0) {
      block(phase, "No customers found in database - cannot test bookings");
      return null;
    }
    ids.customer = customers[0].id;
    log(phase, `Found customer ID: ${ids.customer}`);

    // Get first service
    const { data: services, error: svcError } = await supabaseService
      .from("services")
      .select("id")
      .limit(1);

    if (svcError) throw new Error(`Service query failed: ${svcError.message}`);
    if (!services || services.length === 0) {
      block(phase, "No services found in database - cannot test bookings");
      return null;
    }
    ids.service = services[0].id;
    log(phase, `Found service ID: ${ids.service}`);

    // Get first staff
    const { data: staff, error: staffError } = await supabaseService
      .from("staff")
      .select("id")
      .limit(1);

    if (staffError) throw new Error(`Staff query failed: ${staffError.message}`);
    if (!staff || staff.length === 0) {
      block(phase, "No staff found in database - cannot test bookings");
      return null;
    }
    ids.staff = staff[0].id;
    log(phase, `Found staff ID: ${ids.staff}`);

    pass(phase, "All foreign key IDs discovered");
    return ids;
  } catch (error) {
    fail(phase, error.message);
    return null;
  }
}

// ============================================================
// PHASE 2: VERIFY MIGRATION APPLIED
// ============================================================

async function phase2_verifyMigration() {
  const phase = "PHASE-2";
  log(phase, "Verifying booking constraints migration...");

  const checks = {
    btree_gist: false,
    status_check: false,
    timerange_function: false,
    overlap_constraint: false,
    staff_date_index: false,
    date_status_index: false,
  };

  try {
    // Check for btree_gist extension
    const { data: extensions, error: extError } = await supabaseService.rpc("pg_available_extensions");
    if (!extError && extensions) {
      checks.btree_gist = extensions.some(e => e.name === "btree_gist" && e.installed_version);
    }

    // Check constraints using information_schema
    const { data: constraints, error: constError } = await supabaseService
      .from("information_schema.table_constraints")
      .select("constraint_name")
      .eq("table_name", "bookings");

    if (!constError && constraints) {
      checks.status_check = constraints.some(c => c.constraint_name === "bookings_status_check");
      checks.overlap_constraint = constraints.some(c => c.constraint_name === "bookings_no_overlap_per_staff");
    }

    // Check for timerange function
    const { data: functions, error: funcError } = await supabaseService
      .from("information_schema.routines")
      .select("routine_name")
      .eq("routine_name", "booking_timerange");

    if (!funcError && functions && functions.length > 0) {
      checks.timerange_function = true;
    }

    // Check indexes
    const { data: indexes, error: idxError } = await supabaseService
      .from("pg_indexes")
      .select("indexname")
      .eq("tablename", "bookings");

    if (!idxError && indexes) {
      checks.staff_date_index = indexes.some(i => i.indexname === "idx_bookings_staff_date");
      checks.date_status_index = indexes.some(i => i.indexname === "idx_bookings_date_status");
    }

    // Report results
    const allChecks = Object.entries(checks);
    const passedChecks = allChecks.filter(([_, passed]) => passed);

    if (passedChecks.length === allChecks.length) {
      pass(phase, "All migration components verified");
      results.critical_gates.migration_verified = true;
      return true;
    } else {
      const missing = allChecks.filter(([_, passed]) => !passed).map(([name]) => name);
      fail(phase, `Missing components: ${missing.join(", ")}`);
      return false;
    }
  } catch (error) {
    fail(phase, `Migration verification failed: ${error.message}`);
    return false;
  }
}

// ============================================================
// PHASE 3: CRUD OPERATIONS
// ============================================================

async function phase3_testCRUD(accessToken, ids) {
  const phase = "PHASE-3";
  log(phase, "Testing CRUD operations...");

  const bookingNumber = `${BOOKING_PREFIX}-CRUD-01`;
  const bookingData = {
    booking_number: bookingNumber,
    customer_id: ids.customer,
    service_id: ids.service,
    staff_id: ids.staff,
    booking_date: "2026-12-25",
    start_time: "10:00:00",
    end_time: "11:00:00",
    guests: 2,
    status: "pending",
  };

  let createdId = null;

  try {
    // CREATE
    log(phase, "Testing CREATE...");
    const { response: createResp, data: createData } = await makeAuthenticatedRequest(
      `${BASE_URL}/api/admin/bookings`,
      "POST",
      accessToken,
      bookingData
    );

    if (createResp.status !== 201) {
      throw new Error(`CREATE failed: Expected 201, got ${createResp.status}`);
    }

    if (!createData || !createData.id) {
      throw new Error("CREATE response missing ID");
    }

    createdId = createData.id;
    results.test_bookings_created.push(createdId);
    pass(phase, `CREATE successful (ID: ${createdId})`);

    // READ
    log(phase, "Testing READ...");
    const { response: readResp, data: readData } = await makeAuthenticatedRequest(
      `${BASE_URL}/api/admin/bookings/${createdId}`,
      "GET",
      accessToken
    );

    if (readResp.status !== 200) {
      throw new Error(`READ failed: Expected 200, got ${readResp.status}`);
    }

    if (readData.booking_number !== bookingNumber) {
      throw new Error(`READ data mismatch: Expected ${bookingNumber}, got ${readData.booking_number}`);
    }

    pass(phase, "READ successful");

    // UPDATE
    log(phase, "Testing UPDATE...");
    const updatePayload = { guests: 4 };
    const { response: updateResp, data: updatedData } = await makeAuthenticatedRequest(
      `${BASE_URL}/api/admin/bookings/${createdId}`,
      "PATCH",
      accessToken,
      updatePayload
    );

    if (updateResp.status !== 200) {
      throw new Error(`UPDATE failed: Expected 200, got ${updateResp.status}`);
    }

    if (updatedData.guests !== 4) {
      throw new Error(`UPDATE not persisted: Expected guests=4, got ${updatedData.guests}`);
    }

    pass(phase, "UPDATE successful");

    // DELETE
    log(phase, "Testing DELETE...");
    const { response: deleteResp } = await makeAuthenticatedRequest(
      `${BASE_URL}/api/admin/bookings/${createdId}`,
      "DELETE",
      accessToken
    );

    if (deleteResp.status !== 204) {
      throw new Error(`DELETE failed: Expected 204, got ${deleteResp.status}`);
    }

    // Verify deletion
    const { response: verifyResp } = await makeAuthenticatedRequest(
      `${BASE_URL}/api/admin/bookings/${createdId}`,
      "GET",
      accessToken
    );

    if (verifyResp.status !== 404) {
      throw new Error(`DELETE not verified: Expected 404, got ${verifyResp.status}`);
    }

    pass(phase, "DELETE successful");
    results.critical_gates.crud_verified = true;

    // Remove from cleanup list since we already deleted
    results.test_bookings_created = results.test_bookings_created.filter(id => id !== createdId);

    return true;
  } catch (error) {
    fail(phase, error.message);
    return false;
  }
}

// ============================================================
// PHASE 4: VALIDATION TESTS
// ============================================================

async function phase4_testValidation(accessToken, ids) {
  const phase = "PHASE-4";
  log(phase, "Testing input validation...");

  const testCases = [
    {
      name: "Invalid customer UUID",
      data: { ...createBaseBooking(ids), customer_id: "invalid-uuid" },
      expectedStatus: 400,
    },
    {
      name: "Invalid date format",
      data: { ...createBaseBooking(ids), booking_date: "25-12-2026" },
      expectedStatus: 400,
    },
    {
      name: "Invalid time format",
      data: { ...createBaseBooking(ids), start_time: "25:00" },
      expectedStatus: 400,
    },
    {
      name: "End time before start time",
      data: { ...createBaseBooking(ids), start_time: "15:00", end_time: "14:00" },
      expectedStatus: 400,
    },
    {
      name: "Guests = 0",
      data: { ...createBaseBooking(ids), guests: 0 },
      expectedStatus: 400,
    },
    {
      name: "Guests > 50",
      data: { ...createBaseBooking(ids), guests: 100 },
      expectedStatus: 400,
    },
    {
      name: "Invalid status",
      data: { ...createBaseBooking(ids), status: "invalid_status" },
      expectedStatus: 400,
    },
  ];

  let passedCount = 0;

  for (const testCase of testCases) {
    try {
      const { response } = await makeAuthenticatedRequest(
        `${BASE_URL}/api/admin/bookings`,
        "POST",
        accessToken,
        testCase.data
      );

      if (response.status === testCase.expectedStatus) {
        log(phase, `✓ ${testCase.name}: Rejected as expected (${response.status})`);
        passedCount++;
      } else {
        throw new Error(`Expected ${testCase.expectedStatus}, got ${response.status}`);
      }
    } catch (error) {
      fail(phase, `${testCase.name}: ${error.message}`);
    }
  }

  if (passedCount === testCases.length) {
    pass(phase, `All ${testCases.length} validation tests passed`);
    return true;
  } else {
    fail(phase, `Only ${passedCount}/${testCases.length} validation tests passed`);
    return false;
  }
}

function createBaseBooking(ids, suffix = "TEST") {
  return {
    booking_number: `${BOOKING_PREFIX}-${suffix}-${Date.now()}`,
    customer_id: ids.customer,
    service_id: ids.service,
    staff_id: ids.staff,
    booking_date: "2026-12-25",
    start_time: "10:00:00",
    end_time: "11:00:00",
    guests: 2,
    status: "pending",
  };
}

// ============================================================
// PHASE 5: STATUS MACHINE
// ============================================================

async function phase5_testStatusMachine(accessToken, ids) {
  const phase = "PHASE-5";
  log(phase, "Testing status transition machine...");

  // Valid transitions to test
  const validTransitions = [
    { from: "pending", to: "confirmed" },
    { from: "confirmed", to: "completed" },
  ];

  // Invalid transitions to test
  const invalidTransitions = [
    { from: "completed", to: "pending" },
    { from: "cancelled", to: "confirmed" },
  ];

  let passed = 0;
  let failed = 0;

  // Test valid transitions
  for (const transition of validTransitions) {
    try {
      // Create booking in initial state
      const bookingData = { ...createBaseBooking(ids, `STATUS-${transition.from.toUpperCase()}`), status: transition.from };
      const { response: createResp, data: createData } = await makeAuthenticatedRequest(
        `${BASE_URL}/api/admin/bookings`,
        "POST",
        accessToken,
        bookingData
      );

      if (createResp.status !== 201) {
        throw new Error(`Failed to create booking: ${createResp.status}`);
      }

      const bookingId = createData.id;
      results.test_bookings_created.push(bookingId);

      // Attempt transition
      const { response: updateResp } = await makeAuthenticatedRequest(
        `${BASE_URL}/api/admin/bookings/${bookingId}`,
        "PATCH",
        accessToken,
        { status: transition.to }
      );

      if (updateResp.status === 200) {
        log(phase, `✓ Valid transition ${transition.from}→${transition.to} succeeded`);
        passed++;
      } else {
        throw new Error(`Valid transition rejected: ${updateResp.status}`);
      }
    } catch (error) {
      fail(phase, `Valid transition ${transition.from}→${transition.to}: ${error.message}`);
      failed++;
    }
  }

  // Test invalid transitions
  for (const transition of invalidTransitions) {
    try {
      // Create booking in initial state
      const bookingData = { ...createBaseBooking(ids, `STATUS-INV-${transition.from.toUpperCase()}`), status: transition.from };
      const { response: createResp, data: createData } = await makeAuthenticatedRequest(
        `${BASE_URL}/api/admin/bookings`,
        "POST",
        accessToken,
        bookingData
      );

      if (createResp.status !== 201) {
        throw new Error(`Failed to create booking: ${createResp.status}`);
      }

      const bookingId = createData.id;
      results.test_bookings_created.push(bookingId);

      // Attempt invalid transition
      const { response: updateResp } = await makeAuthenticatedRequest(
        `${BASE_URL}/api/admin/bookings/${bookingId}`,
        "PATCH",
        accessToken,
        { status: transition.to }
      );

      if (updateResp.status === 400) {
        log(phase, `✓ Invalid transition ${transition.from}→${transition.to} rejected`);
        passed++;
      } else {
        throw new Error(`Invalid transition allowed: ${updateResp.status}`);
      }
    } catch (error) {
      fail(phase, `Invalid transition ${transition.from}→${transition.to}: ${error.message}`);
      failed++;
    }
  }

  const total = validTransitions.length + invalidTransitions.length;
  if (failed === 0) {
    pass(phase, `All ${total} status transition tests passed`);
    results.critical_gates.status_machine_verified = true;
    return true;
  } else {
    fail(phase, `${failed}/${total} status transition tests failed`);
    return false;
  }
}

// ============================================================
// PHASE 6: OVERLAP PROTECTION (CRITICAL)
// ============================================================

async function phase6_testOverlap(accessToken, ids) {
  const phase = "PHASE-6";
  log(phase, "Testing overlap protection (CRITICAL)...");

  try {
    // Test 1: Create booking A (10:00-11:00)
    log(phase, "Creating booking A: 10:00-11:00...");
    const bookingA = {
      ...createBaseBooking(ids, "OVERLAP-A"),
      start_time: "10:00:00",
      end_time: "11:00:00",
      status: "confirmed",
    };

    const { response: respA, data: dataA } = await makeAuthenticatedRequest(
      `${BASE_URL}/api/admin/bookings`,
      "POST",
      accessToken,
      bookingA
    );

    if (respA.status !== 201) {
      throw new Error(`Booking A failed: ${respA.status}`);
    }

    results.test_bookings_created.push(dataA.id);
    log(phase, `✓ Booking A created (${dataA.id})`);

    // Test 2: Attempt overlapping booking B (10:30-11:30) - should FAIL
    log(phase, "Attempting overlapping booking B: 10:30-11:30 (should fail)...");
    const bookingB = {
      ...createBaseBooking(ids, "OVERLAP-B"),
      start_time: "10:30:00",
      end_time: "11:30:00",
      status: "confirmed",
    };

    const { response: respB } = await makeAuthenticatedRequest(
      `${BASE_URL}/api/admin/bookings`,
      "POST",
      accessToken,
      bookingB
    );

    if (respB.status === 409) {
      log(phase, "✓ Overlapping booking correctly rejected with 409");
    } else {
      throw new Error(`Expected 409, got ${respB.status} - OVERLAP CONSTRAINT FAILED`);
    }

    // Test 3: Adjacent booking C (11:00-12:00) - should SUCCEED
    log(phase, "Creating adjacent booking C: 11:00-12:00 (should succeed)...");
    const bookingC = {
      ...createBaseBooking(ids, "OVERLAP-C"),
      start_time: "11:00:00",
      end_time: "12:00:00",
      status: "confirmed",
    };

    const { response: respC, data: dataC } = await makeAuthenticatedRequest(
      `${BASE_URL}/api/admin/bookings`,
      "POST",
      accessToken,
      bookingC
    );

    if (respC.status !== 201) {
      throw new Error(`Adjacent booking failed: ${respC.status}`);
    }

    results.test_bookings_created.push(dataC.id);
    log(phase, `✓ Adjacent booking C created (${dataC.id})`);

    // Test 4: Cancelled booking E (10:00-11:00) - should SUCCEED
    log(phase, "Creating cancelled booking E: 10:00-11:00 (should succeed)...");
    const bookingE = {
      ...createBaseBooking(ids, "OVERLAP-E"),
      start_time: "10:00:00",
      end_time: "11:00:00",
      status: "cancelled",
    };

    const { response: respE, data: dataE } = await makeAuthenticatedRequest(
      `${BASE_URL}/api/admin/bookings`,
      "POST",
      accessToken,
      bookingE
    );

    if (respE.status !== 201) {
      throw new Error(`Cancelled booking failed: ${respE.status}`);
    }

    results.test_bookings_created.push(dataE.id);
    log(phase, "✓ Cancelled booking E created (overlap allowed for cancelled)");

    pass(phase, "All overlap protection tests passed");
    results.critical_gates.overlap_verified = true;
    return true;
  } catch (error) {
    fail(phase, error.message);
    return false;
  }
}

// ============================================================
// PHASE 7: UPDATE OVERLAP
// ============================================================

async function phase7_testUpdateOverlap(accessToken, ids) {
  const phase = "PHASE-7";
  log(phase, "Testing UPDATE overlap detection...");

  try {
    // Create booking X (12:00-13:00)
    const bookingX = {
      ...createBaseBooking(ids, "UPDATE-X"),
      start_time: "12:00:00",
      end_time: "13:00:00",
      status: "confirmed",
    };

    const { response: respX, data: dataX } = await makeAuthenticatedRequest(
      `${BASE_URL}/api/admin/bookings`,
      "POST",
      accessToken,
      bookingX
    );

    if (respX.status !== 201) {
      throw new Error(`Booking X creation failed: ${respX.status}`);
    }

    results.test_bookings_created.push(dataX.id);
    log(phase, `Created booking X: 12:00-13:00 (${dataX.id})`);

    // Create booking Y (14:00-15:00)
    const bookingY = {
      ...createBaseBooking(ids, "UPDATE-Y"),
      start_time: "14:00:00",
      end_time: "15:00:00",
      status: "confirmed",
    };

    const { response: respY, data: dataY } = await makeAuthenticatedRequest(
      `${BASE_URL}/api/admin/bookings`,
      "POST",
      accessToken,
      bookingY
    );

    if (respY.status !== 201) {
      throw new Error(`Booking Y creation failed: ${respY.status}`);
    }

    results.test_bookings_created.push(dataY.id);
    log(phase, `Created booking Y: 14:00-15:00 (${dataY.id})`);

    // Attempt to UPDATE Y to overlap with X (12:30-13:30)
    log(phase, "Attempting to update Y to 12:30-13:30 (should fail)...");
    const { response: updateResp } = await makeAuthenticatedRequest(
      `${BASE_URL}/api/admin/bookings/${dataY.id}`,
      "PATCH",
      accessToken,
      { start_time: "12:30:00", end_time: "13:30:00" }
    );

    if (updateResp.status === 409) {
      log(phase, "✓ UPDATE overlap correctly rejected with 409");
      pass(phase, "UPDATE overlap detection verified");
      return true;
    } else {
      throw new Error(`Expected 409, got ${updateResp.status}`);
    }
  } catch (error) {
    fail(phase, error.message);
    return false;
  }
}

// ============================================================
// PHASE 8: REAL CONCURRENCY TEST (CRITICAL)
// ============================================================

async function phase8_testConcurrency(accessToken, ids) {
  const phase = "PHASE-8";
  log(phase, "Testing real concurrency (CRITICAL)...");

  try {
    const bookingData = {
      ...createBaseBooking(ids, "CONCURRENCY"),
      start_time: "16:00:00",
      end_time: "17:00:00",
      status: "confirmed",
    };

    // Send two identical requests simultaneously
    log(phase, "Sending two simultaneous booking requests...");
    const [result1, result2] = await Promise.all([
      makeAuthenticatedRequest(`${BASE_URL}/api/admin/bookings`, "POST", accessToken, bookingData),
      makeAuthenticatedRequest(`${BASE_URL}/api/admin/bookings`, "POST", accessToken, bookingData),
    ]);

    const status1 = result1.response.status;
    const status2 = result2.response.status;

    log(phase, `Request 1: ${status1}`);
    log(phase, `Request 2: ${status2}`);

    // Exactly one should succeed (201) and one should fail (409)
    const successes = [status1, status2].filter(s => s === 201).length;
    const conflicts = [status1, status2].filter(s => s === 409).length;

    if (successes === 1 && conflicts === 1) {
      log(phase, "✓ Exactly one request succeeded, one rejected - concurrency verified");
      
      // Track the created booking for cleanup
      if (status1 === 201) {
        results.test_bookings_created.push(result1.data.id);
      } else {
        results.test_bookings_created.push(result2.data.id);
      }

      pass(phase, "Concurrency protection verified");
      results.critical_gates.concurrency_verified = true;
      return true;
    } else {
      throw new Error(`Expected 1 success + 1 conflict, got ${successes} successes + ${conflicts} conflicts`);
    }
  } catch (error) {
    fail(phase, error.message);
    return false;
  }
}

// ============================================================
// PHASE 9: FOREIGN KEY INTEGRITY
// ============================================================

async function phase9_testForeignKeys(accessToken, ids) {
  const phase = "PHASE-9";
  log(phase, "Testing foreign key integrity...");

  const testCases = [
    { field: "customer_id", value: "00000000-0000-0000-0000-000000000001" },
    { field: "service_id", value: "00000000-0000-0000-0000-000000000002" },
    { field: "staff_id", value: "00000000-0000-0000-0000-000000000003" },
  ];

  let passed = 0;

  for (const testCase of testCases) {
    try {
      const bookingData = { ...createBaseBooking(ids, `FK-${testCase.field.toUpperCase()}`) };
      bookingData[testCase.field] = testCase.value;

      const { response } = await makeAuthenticatedRequest(
        `${BASE_URL}/api/admin/bookings`,
        "POST",
        accessToken,
        bookingData
      );

      if (response.status === 400) {
        log(phase, `✓ Invalid ${testCase.field} rejected`);
        passed++;
      } else {
        throw new Error(`Expected 400, got ${response.status}`);
      }
    } catch (error) {
      fail(phase, `${testCase.field}: ${error.message}`);
    }
  }

  if (passed === testCases.length) {
    pass(phase, "All foreign key tests passed");
    return true;
  } else {
    fail(phase, `Only ${passed}/${testCases.length} FK tests passed`);
    return false;
  }
}

// ============================================================
// PHASE 10: AUTHORIZATION
// ============================================================

async function phase10_testAuthorization() {
  const phase = "PHASE-10";
  log(phase, "Testing authorization...");

  try {
    // Test without authentication
    log(phase, "Testing request without authentication...");
    const response = await fetch(`${BASE_URL}/api/admin/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ test: "data" }),
    });

    if (response.status === 401 || response.status === 403) {
      log(phase, `✓ Unauthenticated request rejected (${response.status})`);
      pass(phase, "Authorization verified");
      results.critical_gates.authorization_verified = true;
      return true;
    } else {
      throw new Error(`Expected 401/403, got ${response.status}`);
    }
  } catch (error) {
    fail(phase, error.message);
    return false;
  }
}

// ============================================================
// PHASE 11: CLEANUP
// ============================================================

async function phase11_cleanup() {
  const phase = "PHASE-11";
  log(phase, "Cleaning up test bookings...");

  if (results.test_bookings_created.length === 0) {
    skip(phase, "No test bookings to clean up");
    return true;
  }

  let cleaned = 0;
  let failed = 0;

  for (const bookingId of results.test_bookings_created) {
    try {
      const { error } = await supabaseService
        .from("bookings")
        .delete()
        .eq("id", bookingId);

      if (error) throw error;
      cleaned++;
    } catch (error) {
      log(phase, `Failed to delete ${bookingId}: ${error.message}`);
      failed++;
    }
  }

  log(phase, `Cleaned ${cleaned} bookings, ${failed} failed`);

  if (failed === 0) {
    pass(phase, `All ${cleaned} test bookings cleaned up`);
    return true;
  } else {
    fail(phase, `${failed} bookings failed to clean up`);
    return false;
  }
}

// ============================================================
// MAIN EXECUTION
// ============================================================

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("COMPREHENSIVE BOOKING SYSTEM RUNTIME VERIFICATION");
  console.log("=".repeat(70));
  console.log(`Timestamp: ${results.timestamp}`);
  console.log(`Test User: ${TEST_ADMIN_EMAIL}`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Booking Prefix: ${BOOKING_PREFIX}`);
  console.log("=".repeat(70) + "\n");

  try {
    // PHASE 0: Prerequisites
    const accessToken = await phase0_prerequisites();
    if (!accessToken) {
      console.error("\n❌ Prerequisites failed - cannot continue\n");
      process.exit(1);
    }

    // PHASE 1: Discover IDs
    const ids = await phase1_discoverIds();
    if (!ids) {
      console.error("\n❌ Cannot discover foreign key IDs - cannot continue\n");
      process.exit(1);
    }

    // PHASE 2: Verify migration
    await phase2_verifyMigration();

    // PHASE 3: CRUD operations
    await phase3_testCRUD(accessToken, ids);

    // PHASE 4: Validation
    await phase4_testValidation(accessToken, ids);

    // PHASE 5: Status machine
    await phase5_testStatusMachine(accessToken, ids);

    // PHASE 6: Overlap protection (CRITICAL)
    await phase6_testOverlap(accessToken, ids);

    // PHASE 7: Update overlap
    await phase7_testUpdateOverlap(accessToken, ids);

    // PHASE 8: Concurrency (CRITICAL)
    await phase8_testConcurrency(accessToken, ids);

    // PHASE 9: Foreign keys
    await phase9_testForeignKeys(accessToken, ids);

    // PHASE 10: Authorization
    await phase10_testAuthorization();

    // PHASE 11: Cleanup
    await phase11_cleanup();
  } catch (error) {
    console.error("\n❌ FATAL ERROR:", error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    // Generate report
    await generateReport();
  }
}

// ============================================================
// REPORT GENERATION
// ============================================================

async function generateReport() {
  console.log("\n" + "=".repeat(70));
  console.log("VERIFICATION REPORT");
  console.log("=".repeat(70));

  console.log("\n📊 SUMMARY:");
  console.log(`  Passed:  ${results.summary.passed}`);
  console.log(`  Failed:  ${results.summary.failed}`);
  console.log(`  Blocked: ${results.summary.blocked}`);
  console.log(`  Skipped: ${results.summary.skipped}`);

  console.log("\n🎯 CRITICAL GATES:");
  const gates = results.critical_gates;
  console.log(`  Migration:     ${gates.migration_verified ? "✓" : "✗"}`);
  console.log(`  CRUD:          ${gates.crud_verified ? "✓" : "✗"}`);
  console.log(`  Overlap:       ${gates.overlap_verified ? "✓" : "✗"}`);
  console.log(`  Concurrency:   ${gates.concurrency_verified ? "✓" : "✗"}`);
  console.log(`  Status Machine: ${gates.status_machine_verified ? "✓" : "✗"}`);
  console.log(`  Authorization: ${gates.authorization_verified ? "✓" : "✗"}`);

  const criticalGatesPassed = Object.values(gates).filter(v => v).length;
  const totalCriticalGates = Object.keys(gates).length;

  console.log("\n🏁 FINAL VERDICT:");
  if (results.summary.failed === 0 && criticalGatesPassed === totalCriticalGates) {
    console.log("  🟢 GREEN - 100% PRODUCTION READY");
    console.log("  All tests passed. Booking system is production ready.");
  } else if (results.summary.failed > 0) {
    console.log("  🔴 RED - PRODUCTION BLOCKED");
    console.log(`  ${results.summary.failed} test(s) failed.`);
  } else {
    console.log("  🟡 YELLOW - PARTIAL VERIFICATION");
    console.log(`  ${totalCriticalGates - criticalGatesPassed} critical gate(s) not verified.`);
  }

  if (results.errors.length > 0) {
    console.log("\n❌ ERRORS:");
    results.errors.forEach(({ phase, error }) => {
      console.log(`  [${phase}] ${error}`);
    });
  }

  console.log("\n" + "=".repeat(70) + "\n");

  // Save JSON report
  const reportPath = path.join(rootDir, "BOOKING_RUNTIME_VERIFICATION_RESULTS.json");
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`📄 Full report saved to: ${reportPath}\n`);

  // Exit with appropriate code
  process.exit(results.summary.failed > 0 ? 1 : 0);
}

// Run
main().catch((error) => {
  console.error("\n❌ UNHANDLED ERROR:", error);
  process.exit(1);
});
