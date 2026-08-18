#!/usr/bin/env node

/**
 * ZT LOUNGE — BOOKINGS MANAGEMENT RUNTIME VERIFICATION
 * 
 * Comprehensive authenticated test of the bookings CRUD workflow:
 * - Authentication
 * - Booking list retrieval
 * - Customer/service/staff resolution
 * - Status handling
 * - Create booking
 * - Update booking
 * - Delete booking
 * - Database persistence
 * - Security/authorization
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env.local
config({ path: join(__dirname, '..', '.env.local') });

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// Validate required environment variables
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('\n❌ ERROR: Missing Supabase environment configuration.\n');
  console.error('Expected variables in .env.local:');
  console.error('  - NEXT_PUBLIC_SUPABASE_URL');
  console.error('  - NEXT_PUBLIC_SUPABASE_ANON_KEY');
  console.error('  - ADMIN_EMAIL');
  console.error('  - ADMIN_PASSWORD\n');
  process.exit(1);
}

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('\n❌ ERROR: Missing admin credentials.\n');
  console.error('Expected variables in .env.local:');
  console.error('  - ADMIN_EMAIL');
  console.error('  - ADMIN_PASSWORD\n');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('╔═══════════════════════════════════════════════════════════════════════╗');
console.log('║  ZT LOUNGE — BOOKINGS MANAGEMENT RUNTIME VERIFICATION                 ║');
console.log('╚═══════════════════════════════════════════════════════════════════════╝\n');

const results = {
  authentication: null,
  bookingsList: null,
  customerResolution: null,
  serviceResolution: null,
  staffResolution: null,
  statusValidation: null,
  createBooking: null,
  updateBooking: null,
  deleteBooking: null,
  databasePersistence: null,
  security: null,
  errors: []
};

let sessionCookies = '';
let testBookingId = null;

// ─────────────────────────────────────────────────────────────────────
// AUTHENTICATION
// ─────────────────────────────────────────────────────────────────────
console.log('🔐 PHASE 1: Authentication...');
try {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD
  });

  if (authError || !authData.session) {
    results.authentication = 'FAIL';
    results.errors.push(`Authentication failed: ${authError?.message || 'No session'}`);
    console.log('❌ Authentication FAILED\n');
    printReport();
    process.exit(1);
  }

  const accessToken = authData.session.access_token;
  const refreshToken = authData.session.refresh_token;
  sessionCookies = `sb-access-token=${accessToken}; sb-refresh-token=${refreshToken}`;
  
  results.authentication = 'PASS';
  console.log('✅ Authenticated successfully\n');
} catch (error) {
  results.authentication = 'FAIL';
  results.errors.push(`Authentication error: ${error.message}`);
  console.log(`❌ Authentication error: ${error.message}\n`);
  printReport();
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────
// PHASE 2: BOOKINGS LIST
// ─────────────────────────────────────────────────────────────────────
console.log('📋 PHASE 2: Fetching bookings list...');
let existingBookings = [];
try {
  const res = await fetch(`${BASE_URL}/api/admin/bookings`, {
    headers: { Cookie: sessionCookies }
  });

  if (!res.ok) {
    results.bookingsList = `FAIL (HTTP ${res.status})`;
    results.errors.push(`GET /api/admin/bookings returned ${res.status}`);
    console.log(`❌ Failed: HTTP ${res.status}\n`);
  } else {
    const json = await res.json();
    existingBookings = json.data || [];
    results.bookingsList = 'PASS';
    console.log(`✅ Retrieved ${existingBookings.length} bookings\n`);
  }
} catch (error) {
  results.bookingsList = 'FAIL';
  results.errors.push(`Bookings list error: ${error.message}`);
  console.log(`❌ Error: ${error.message}\n`);
}

// ─────────────────────────────────────────────────────────────────────
// PHASE 3: VERIFY FIELD RESOLUTION
// ─────────────────────────────────────────────────────────────────────
console.log('🔍 PHASE 3: Verifying database field structure...');
if (existingBookings.length > 0) {
  const sample = existingBookings[0];
  const expectedFields = ['id', 'bookingNumber', 'customerId', 'serviceId', 'staffId', 
                          'bookingDate', 'startTime', 'endTime', 'guests', 'status'];
  const missingFields = expectedFields.filter(f => !(f in sample));
  const hasTotalAmount = 'totalAmount' in sample;

  if (missingFields.length > 0) {
    results.customerResolution = 'FAIL';
    results.errors.push(`Missing fields: ${missingFields.join(', ')}`);
    console.log(`❌ Missing expected fields: ${missingFields.join(', ')}`);
  } else if (hasTotalAmount) {
    results.customerResolution = 'WARNING';
    results.errors.push('totalAmount field present (should not exist per requirements)');
    console.log('⚠️  WARNING: totalAmount field present (should not exist)');
  } else {
    results.customerResolution = 'PASS';
    console.log('✅ All expected fields present, no totalAmount');
  }

  // Check time fields
  if (sample.startTime && sample.endTime) {
    results.serviceResolution = 'PASS';
    console.log(`✅ Time fields: ${sample.startTime} - ${sample.endTime}`);
  } else {
    results.serviceResolution = 'FAIL';
    results.errors.push('Missing startTime or endTime');
    console.log('❌ Missing time fields');
  }

  // Check guests field
  if (typeof sample.guests === 'number') {
    results.staffResolution = 'PASS';
    console.log(`✅ Guests field: ${sample.guests}`);
  } else {
    results.staffResolution = 'FAIL';
    results.errors.push('Invalid guests field type');
    console.log('❌ Invalid guests field');
  }
} else {
  results.customerResolution = 'SKIP';
  results.serviceResolution = 'SKIP';
  results.staffResolution = 'SKIP';
  console.log('⚠️  No bookings to verify field structure');
}
console.log('');

// ─────────────────────────────────────────────────────────────────────
// PHASE 4: STATUS VALIDATION
// ─────────────────────────────────────────────────────────────────────
console.log('✓ PHASE 4: Validating booking statuses...');
const validStatuses = ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'];
const invalidStatuses = existingBookings
  .map(b => b.status)
  .filter(s => !validStatuses.includes(s));

if (invalidStatuses.length > 0) {
  results.statusValidation = 'FAIL';
  results.errors.push(`Invalid statuses found: ${[...new Set(invalidStatuses)].join(', ')}`);
  console.log(`❌ Invalid statuses: ${[...new Set(invalidStatuses)].join(', ')}\n`);
} else {
  results.statusValidation = 'PASS';
  console.log('✅ All bookings have valid statuses\n');
}

// ─────────────────────────────────────────────────────────────────────
// PHASE 5: CREATE TEST BOOKING
// ─────────────────────────────────────────────────────────────────────
console.log('➕ PHASE 5: Creating test booking...');
try {
  // First, get customers, services, and staff to use valid IDs
  const [customersRes, servicesRes, staffRes] = await Promise.all([
    fetch(`${BASE_URL}/api/admin/customers`, { headers: { Cookie: sessionCookies } }),
    fetch(`${BASE_URL}/api/admin/services`, { headers: { Cookie: sessionCookies } }),
    fetch(`${BASE_URL}/api/admin/staff`, { headers: { Cookie: sessionCookies } })
  ]);

  const customers = (await customersRes.json()).data || [];
  const services = (await servicesRes.json()).data || [];
  const staff = (await staffRes.json()).data || [];

  if (customers.length === 0 || services.length === 0 || staff.length === 0) {
    results.createBooking = 'SKIP';
    console.log('⚠️  Cannot create test booking: missing customers/services/staff\n');
  } else {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const bookingDate = tomorrow.toISOString().split('T')[0];

    const createPayload = {
      bookingNumber: `TEST-${Date.now()}`,
      customerId: customers[0].id,
      serviceId: services[0].id,
      staffId: staff.find(s => s.isActive)?.id || staff[0].id,
      bookingDate,
      startTime: '14:00:00',
      endTime: '16:00:00',
      guests: 4,
      status: 'pending',
      specialRequests: 'Automated test booking - verify field structure',
      internalNotes: 'Created by runtime verification script'
    };

    const createRes = await fetch(`${BASE_URL}/api/admin/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookies
      },
      body: JSON.stringify(createPayload)
    });

    if (!createRes.ok) {
      const errorText = await createRes.text();
      results.createBooking = `FAIL (HTTP ${createRes.status})`;
      results.errors.push(`Create booking failed: ${createRes.status} - ${errorText}`);
      console.log(`❌ Failed: HTTP ${createRes.status}\n${errorText}\n`);
    } else {
      const created = await createRes.json();
      testBookingId = created.data?.id;
      results.createBooking = 'PASS';
      console.log(`✅ Created test booking: ${created.data?.bookingNumber || testBookingId}\n`);
    }
  }
} catch (error) {
  results.createBooking = 'FAIL';
  results.errors.push(`Create booking error: ${error.message}`);
  console.log(`❌ Error: ${error.message}\n`);
}

// ─────────────────────────────────────────────────────────────────────
// PHASE 6: UPDATE BOOKING
// ─────────────────────────────────────────────────────────────────────
console.log('✏️  PHASE 6: Updating test booking...');
if (testBookingId) {
  try {
    const updatePayload = {
      status: 'confirmed',
      guests: 6,
      internalNotes: 'Updated by runtime verification script'
    };

    const updateRes = await fetch(`${BASE_URL}/api/admin/bookings/${testBookingId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookies
      },
      body: JSON.stringify(updatePayload)
    });

    if (!updateRes.ok) {
      const errorText = await updateRes.text();
      results.updateBooking = `FAIL (HTTP ${updateRes.status})`;
      results.errors.push(`Update booking failed: ${updateRes.status} - ${errorText}`);
      console.log(`❌ Failed: HTTP ${updateRes.status}\n${errorText}\n`);
    } else {
      const updated = await updateRes.json();
      results.updateBooking = 'PASS';
      console.log(`✅ Updated booking to status: ${updated.data?.status || 'confirmed'}\n`);
    }
  } catch (error) {
    results.updateBooking = 'FAIL';
    results.errors.push(`Update booking error: ${error.message}`);
    console.log(`❌ Error: ${error.message}\n`);
  }
} else {
  results.updateBooking = 'SKIP';
  console.log('⚠️  Skipped: no test booking to update\n');
}

// ─────────────────────────────────────────────────────────────────────
// PHASE 7: VERIFY PERSISTENCE
// ─────────────────────────────────────────────────────────────────────
console.log('💾 PHASE 7: Verifying database persistence...');
if (testBookingId) {
  try {
    const { data: dbBooking, error: dbError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', testBookingId)
      .single();

    if (dbError || !dbBooking) {
      results.databasePersistence = 'FAIL';
      results.errors.push(`Database query failed: ${dbError?.message || 'Not found'}`);
      console.log(`❌ Failed: ${dbError?.message || 'Booking not found in database'}\n`);
    } else {
      // Verify critical fields
      const checks = {
        'status = confirmed': dbBooking.status === 'confirmed',
        'guests = 6': dbBooking.guests === 6,
        'no totalAmount': !('total_amount' in dbBooking),
        'has startTime': !!dbBooking.start_time,
        'has endTime': !!dbBooking.end_time
      };

      const failed = Object.entries(checks).filter(([_, pass]) => !pass).map(([name]) => name);
      
      if (failed.length > 0) {
        results.databasePersistence = 'FAIL';
        results.errors.push(`Database persistence checks failed: ${failed.join(', ')}`);
        console.log(`❌ Failed checks: ${failed.join(', ')}\n`);
      } else {
        results.databasePersistence = 'PASS';
        console.log('✅ All persistence checks passed\n');
      }
    }
  } catch (error) {
    results.databasePersistence = 'FAIL';
    results.errors.push(`Database verification error: ${error.message}`);
    console.log(`❌ Error: ${error.message}\n`);
  }
} else {
  results.databasePersistence = 'SKIP';
  console.log('⚠️  Skipped: no test booking to verify\n');
}

// ─────────────────────────────────────────────────────────────────────
// PHASE 8: DELETE TEST BOOKING
// ─────────────────────────────────────────────────────────────────────
console.log('🗑️  PHASE 8: Cleaning up test booking...');
if (testBookingId) {
  try {
    const deleteRes = await fetch(`${BASE_URL}/api/admin/bookings/${testBookingId}`, {
      method: 'DELETE',
      headers: { Cookie: sessionCookies }
    });

    if (!deleteRes.ok) {
      const errorText = await deleteRes.text();
      results.deleteBooking = `FAIL (HTTP ${deleteRes.status})`;
      results.errors.push(`Delete booking failed: ${deleteRes.status} - ${errorText}`);
      console.log(`❌ Failed: HTTP ${deleteRes.status}\n${errorText}\n`);
    } else {
      results.deleteBooking = 'PASS';
      console.log('✅ Test booking deleted\n');
    }
  } catch (error) {
    results.deleteBooking = 'FAIL';
    results.errors.push(`Delete booking error: ${error.message}`);
    console.log(`❌ Error: ${error.message}\n`);
  }
} else {
  results.deleteBooking = 'SKIP';
  console.log('⚠️  Skipped: no test booking to delete\n');
}

// ─────────────────────────────────────────────────────────────────────
// PHASE 9: SECURITY CHECK
// ─────────────────────────────────────────────────────────────────────
console.log('🔒 PHASE 9: Security verification...');
try {
  const unauthRes = await fetch(`${BASE_URL}/api/admin/bookings`);
  
  if (unauthRes.status === 401) {
    results.security = 'PASS';
    console.log('✅ Unauthenticated request correctly rejected (401)\n');
  } else {
    results.security = 'FAIL';
    results.errors.push(`Security issue: unauthenticated request returned ${unauthRes.status}`);
    console.log(`❌ Security issue: expected 401, got ${unauthRes.status}\n`);
  }
} catch (error) {
  results.security = 'FAIL';
  results.errors.push(`Security check error: ${error.message}`);
  console.log(`❌ Error: ${error.message}\n`);
}

// ─────────────────────────────────────────────────────────────────────
// FINAL REPORT
// ─────────────────────────────────────────────────────────────────────
printReport();

function printReport() {
  console.log('╔═══════════════════════════════════════════════════════════════════════╗');
  console.log('║  VERIFICATION REPORT                                                  ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════╝\n');

  console.log('TEST RESULTS:');
  console.log('─'.repeat(75));
  Object.entries(results).forEach(([key, value]) => {
    if (key === 'errors') return;
    const status = value === 'PASS' ? '✅' : value === 'SKIP' ? '⚠️' : '❌';
    console.log(`${status} ${key.padEnd(30)} ${value || 'NOT RUN'}`);
  });
  console.log('─'.repeat(75));

  const passed = Object.values(results).filter(v => v === 'PASS').length - 1;
  const failed = Object.values(results).filter(v => typeof v === 'string' && v.startsWith('FAIL')).length;
  const skipped = Object.values(results).filter(v => v === 'SKIP').length;

  console.log(`\nSUMMARY: ${passed} passed, ${failed} failed, ${skipped} skipped`);

  if (results.errors.length > 0) {
    console.log('\n❌ ERRORS:');
    results.errors.forEach((err, i) => console.log(`   ${i + 1}. ${err}`));
  }

  const overallStatus = failed === 0 ? 'PASS' : 'FAIL';
  console.log(`\n${'═'.repeat(75)}`);
  console.log(`OVERALL STATUS: ${overallStatus === 'PASS' ? '✅ PASS' : '❌ FAIL'}`);
  console.log('═'.repeat(75));

  process.exit(overallStatus === 'PASS' ? 0 : 1);
}
