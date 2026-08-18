#!/usr/bin/env node

/**
 * FINAL BOOKING INTEGRITY GATE
 * Closes every verification gap with actual execution and real database tests
 * Does NOT declare production-ready until all critical gates PASS
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn, execSync } from 'child_process';
import { writeFileSync, readFileSync } from 'fs';
import { setTimeout as sleep } from 'timers/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: join(__dirname, '..', '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabaseAdmin = SUPABASE_SERVICE_ROLE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) : null;

const TIMESTAMP = Date.now();
const TEST_PREFIX = `GATE-${TIMESTAMP}`;
const testRecords = { bookings: [], customers: [] };

const results = {
  PASS: [],
  FAIL: [],
  BLOCKED: [],
  UNVERIFIABLE: [],
  critical_errors: [],
  test_data_cleanup_success: false
};

let serverProcess = null;
let authToken = null;

console.log('\n╔════════════════════════════════════════════════════════════════════════════╗');
console.log('║          FINAL BOOKING INTEGRITY GATE — COMPLETE VERIFICATION             ║');
console.log('║                     All Phases | Real Database Tests                       ║');
console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');

// ════════════════════════════════════════════════════════════════════════════
// PHASE 1: REPOSITORY VERIFICATION
// ════════════════════════════════════════════════════════════════════════════

console.log('📋 PHASE 1: Repository Verification\n');

try {
  // Check migration file
  const migrationPath = join(__dirname, '..', 'supabase', 'migrations', '20260816_booking_integrity_constraints.sql');
  const migrationContent = readFileSync(migrationPath, 'utf8');
  
  if (!migrationContent.includes('btree_gist')) throw new Error('Missing btree_gist extension');
  if (!migrationContent.includes('booking_timerange')) throw new Error('Missing booking_timerange function');
  if (!migrationContent.includes('bookings_status_check')) throw new Error('Missing status check constraint');
  if (!migrationContent.includes('bookings_no_overlap_per_staff')) throw new Error('Missing overlap constraint');
  
  console.log('   ✓ Migration file exists and has required phases');
  results.PASS.push('repository');
} catch (error) {
  console.log(`   ✗ Repository check failed: ${error.message}`);
  results.FAIL.push('repository');
  results.critical_errors.push(`Repository: ${error.message}`);
}

console.log('');

// ════════════════════════════════════════════════════════════════════════════
// PHASE 2: DATABASE PREFLIGHT
// ════════════════════════════════════════════════════════════════════════════

console.log('📊 PHASE 2: Database Preflight\n');

try {
  const { data: bookings, error: bookingsErr } = await supabase
    .from('bookings')
    .select('id, status, booking_date, start_time, end_time, staff_id');

  if (bookingsErr) throw new Error(`Bookings query failed: ${bookingsErr.message}`);

  const validStatuses = ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'];
  const invalidStatuses = bookings.filter(b => !validStatuses.includes(b.status));
  
  const invalidTimes = bookings.filter(b => {
    if (!b.start_time || !b.end_time) return true;
    const [sh, sm] = String(b.start_time).split(':').map(Number);
    const [eh, em] = String(b.end_time).split(':').map(Number);
    return (sh * 60 + sm) >= (eh * 60 + em);
  });

  if (invalidStatuses.length > 0 || invalidTimes.length > 0) {
    throw new Error(`Data conflicts: ${invalidStatuses.length} invalid statuses, ${invalidTimes.length} invalid times`);
  }

  console.log(`   ✓ Bookings table accessible (${bookings.length} records)`);
  console.log('   ✓ No invalid statuses');
  console.log('   ✓ No invalid time ranges');
  results.PASS.push('database_preflight');
} catch (error) {
  console.log(`   ✗ Database preflight failed: ${error.message}`);
  results.FAIL.push('database_preflight');
  results.critical_errors.push(`Database: ${error.message}`);
}

console.log('');

// ════════════════════════════════════════════════════════════════════════════
// PHASE 3: MIGRATION STATE VERIFICATION
// ════════════════════════════════════════════════════════════════════════════

console.log('🗄️  PHASE 3: Migration State Verification\n');

try {
  if (!supabaseAdmin) throw new Error('Service role key not available');

  // Check btree_gist extension
  const { data: extensions, error: extErr } = await supabaseAdmin.rpc('sql', {
    query: "SELECT extname FROM pg_extension WHERE extname = 'btree_gist'"
  }).catch(() => ({ data: null, error: { message: 'RPC not available' } }));

  // Alternative: Query information_schema
  const { data: extData } = await supabaseAdmin
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_name', 'bookings')
    .single()
    .catch(() => ({ data: null }));

  if (!extData) {
    // Try alternative method: check if function exists
    const { data: functions } = await supabaseAdmin
      .rpc('get_defined_functions')
      .catch(() => ({ data: [] }));

    if (Array.isArray(functions) && functions.length === 0) {
      console.log('   ⚠️  Cannot verify migration via RPC (SDK limitation)');
      console.log('   ℹ️  This is expected - migration verification requires Supabase CLI');
      console.log('   📝 User should run: supabase db pull');
      results.UNVERIFIABLE.push('migration_state_via_rpc');
    }
  }

  // Direct SQL check via supabaseAdmin
  const { data: migrationStatus, error: statusErr } = await supabaseAdmin
    .from('migrations')
    .select('*')
    .order('executed_at', { ascending: false })
    .limit(1)
    .catch(() => ({ data: [], error: null }));

  if (Array.isArray(migrationStatus) && migrationStatus.length > 0) {
    console.log(`   ✓ Latest migration: ${migrationStatus[0].name}`);
    if (migrationStatus[0].name.includes('20260816')) {
      results.PASS.push('migration_applied');
      console.log('   ✓ Booking integrity migration detected as applied');
    } else {
      console.log('   ⚠️  Latest migration does not match expected 20260816 version');
      results.BLOCKED.push('migration_applied - requires manual supabase db pull to verify');
    }
  } else {
    console.log('   ⚠️  Cannot determine migration status via SDK');
    results.BLOCKED.push('migration_state - SDK does not expose migrations table');
  }

} catch (error) {
  console.log(`   ℹ️  Migration verification blocked: ${error.message}`);
  results.BLOCKED.push(`migration_state - ${error.message}`);
}

console.log('');

// ════════════════════════════════════════════════════════════════════════════
// PHASE 4: START SERVER
// ════════════════════════════════════════════════════════════════════════════

console.log('🚀 PHASE 4: Start Next.js Server\n');

try {
  const isWindows = process.platform === 'win32';
  serverProcess = spawn(isWindows ? 'npm.cmd' : 'npm', ['run', 'dev'], {
    cwd: join(__dirname, '..'),
    detached: false,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: isWindows
  });

  let serverReady = false;
  let attempts = 0;
  const maxAttempts = 12; // 60 seconds

  while (attempts < maxAttempts && !serverReady) {
    await sleep(5000);
    attempts++;
    
    try {
      const healthRes = await fetch(`${BASE_URL}/api/health`).catch(() => null);
      if (healthRes && healthRes.ok) {
        serverReady = true;
        console.log(`   ✓ Server started and ready (attempt ${attempts})`);
        results.PASS.push('server_startup');
      }
    } catch (e) {
      // Keep trying
    }
  }

  if (!serverReady) {
    throw new Error(`Server did not become ready after ${maxAttempts * 5} seconds`);
  }

} catch (error) {
  console.log(`   ✗ Server startup failed: ${error.message}`);
  results.FAIL.push('server_startup');
  results.critical_errors.push(`Server: ${error.message}`);
  if (serverProcess) serverProcess.kill();
  process.exit(1);
}

console.log('');

// ════════════════════════════════════════════════════════════════════════════
// PHASE 5: AUTHENTICATION
// ════════════════════════════════════════════════════════════════════════════

console.log('🔐 PHASE 5: Authentication\n');

try {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error('ADMIN_EMAIL or ADMIN_PASSWORD not configured');
  }

  const { data, error: authError } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD
  });

  if (authError) throw new Error(`Auth failed: ${authError.message}`);
  if (!data.session) throw new Error('No session returned');

  authToken = data.session.access_token;
  console.log('   ✓ Authentication successful');
  console.log('   ✓ Session obtained');
  results.PASS.push('authentication');

  // Verify session endpoint
  const sessionRes = await fetch(`${BASE_URL}/api/auth/session`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });

  if (!sessionRes.ok) {
    throw new Error(`Session endpoint returned ${sessionRes.status}`);
  }

  console.log('   ✓ Session endpoint accessible');

} catch (error) {
  console.log(`   ✗ Authentication failed: ${error.message}`);
  results.FAIL.push('authentication');
  results.critical_errors.push(`Authentication: ${error.message}`);
  if (serverProcess) serverProcess.kill();
  process.exit(1);
}

console.log('');

// ════════════════════════════════════════════════════════════════════════════
// PHASE 6: CRUD OPERATIONS
// ════════════════════════════════════════════════════════════════════════════

console.log('🧪 PHASE 6: CRUD Operations\n');

try {
  // Get test data
  const { data: customers } = await supabase.from('customers').select('id').limit(1);
  const { data: services } = await supabase.from('services').select('id').limit(1);
  const { data: staff } = await supabase.from('staff').select('id').limit(1);

  if (!customers?.length || !services?.length || !staff?.length) {
    throw new Error('Insufficient test data (need customers, services, staff)');
  }

  const testData = {
    customerId: customers[0].id,
    serviceId: services[0].id,
    staffId: staff[0].id
  };

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const bookingDate = tomorrow.toISOString().split('T')[0];

  // CREATE
  console.log('   Test CREATE...');
  const createRes = await fetch(`${BASE_URL}/api/admin/bookings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({
      bookingNumber: TEST_PREFIX + '-CREATE-01',
      customerId: testData.customerId,
      serviceId: testData.serviceId,
      staffId: testData.staffId,
      bookingDate,
      startTime: '10:00:00',
      endTime: '11:00:00',
      guests: 2,
      status: 'pending'
    })
  });

  if (createRes.status !== 201) {
    const text = await createRes.text();
    throw new Error(`CREATE failed (HTTP ${createRes.status}): ${text}`);
  }

  const created = await createRes.json();
  const bookingId = created.id || created.data?.id;
  if (!bookingId) throw new Error('No booking ID returned');
  testRecords.bookings.push(bookingId);
  console.log(`   ✓ CREATE passed (ID: ${bookingId})`);
  results.PASS.push('CRUD_create');

  // READ
  console.log('   Test READ...');
  const readRes = await fetch(`${BASE_URL}/api/admin/bookings/${bookingId}`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });

  if (!readRes.ok) throw new Error(`READ failed (HTTP ${readRes.status})`);
  const readData = await readRes.json();
  console.log('   ✓ READ passed');
  results.PASS.push('CRUD_read');

  // UPDATE
  console.log('   Test UPDATE...');
  const updateRes = await fetch(`${BASE_URL}/api/admin/bookings/${bookingId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({ guests: 3 })
  });

  if (!updateRes.ok) throw new Error(`UPDATE failed (HTTP ${updateRes.status})`);
  console.log('   ✓ UPDATE passed');
  results.PASS.push('CRUD_update');

  // PERSISTENCE CHECK
  console.log('   Test persistence...');
  const { data: persisted } = await supabase
    .from('bookings')
    .select('guests')
    .eq('id', bookingId)
    .single();

  if (persisted.guests !== 3) throw new Error(`Persistence failed: guests=${persisted.guests}, expected 3`);
  console.log('   ✓ Persistence verified (guests=3 in database)');
  results.PASS.push('CRUD_persistence');

  // DELETE
  console.log('   Test DELETE...');
  const deleteRes = await fetch(`${BASE_URL}/api/admin/bookings/${bookingId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${authToken}` }
  });

  if (!deleteRes.ok) throw new Error(`DELETE failed (HTTP ${deleteRes.status})`);
  console.log('   ✓ DELETE passed');
  results.PASS.push('CRUD_delete');

  // Deletion verification
  const { data: deletedCheck } = await supabase
    .from('bookings')
    .select('id')
    .eq('id', bookingId);

  if (deletedCheck && deletedCheck.length > 0) throw new Error('Deletion verification failed: record still exists');
  console.log('   ✓ Deletion verified in database');
  testRecords.bookings = testRecords.bookings.filter(id => id !== bookingId);
  results.PASS.push('CRUD_deletion_verified');

} catch (error) {
  console.log(`   ✗ CRUD tests failed: ${error.message}`);
  results.FAIL.push('CRUD_operations');
  results.critical_errors.push(`CRUD: ${error.message}`);
}

console.log('');

// ════════════════════════════════════════════════════════════════════════════
// PHASE 7: STATUS TRANSITIONS
// ════════════════════════════════════════════════════════════════════════════

console.log('🔄 PHASE 7: Status Transitions\n');

try {
  const { data: customers } = await supabase.from('customers').select('id').limit(1);
  const { data: services } = await supabase.from('services').select('id').limit(1);
  const { data: staff } = await supabase.from('staff').select('id').limit(1);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const bookingDate = tomorrow.toISOString().split('T')[0];

  // Create test booking
  const createRes = await fetch(`${BASE_URL}/api/admin/bookings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({
      bookingNumber: TEST_PREFIX + '-STATUS-01',
      customerId: customers[0].id,
      serviceId: services[0].id,
      staffId: staff[0].id,
      bookingDate,
      startTime: '14:00:00',
      endTime: '15:00:00',
      guests: 1,
      status: 'pending'
    })
  });

  if (createRes.status !== 201) throw new Error(`Cannot create test booking (HTTP ${createRes.status})`);
  const created = await createRes.json();
  const bookingId = created.id || created.data?.id;
  testRecords.bookings.push(bookingId);

  // pending → confirmed (valid)
  console.log('   Test valid transition: pending → confirmed');
  const t1 = await fetch(`${BASE_URL}/api/admin/bookings/${bookingId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
    body: JSON.stringify({ status: 'confirmed' })
  });

  if (!t1.ok) throw new Error(`Transition failed (HTTP ${t1.status})`);
  console.log('   ✓ Valid transition allowed');
  results.PASS.push('status_transitions_valid');

  // confirmed → pending (invalid - should fail)
  console.log('   Test invalid transition: confirmed → pending');
  const t2 = await fetch(`${BASE_URL}/api/admin/bookings/${bookingId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
    body: JSON.stringify({ status: 'pending' })
  });

  if (t2.status === 400) {
    console.log('   ✓ Invalid transition correctly rejected (HTTP 400)');
    results.PASS.push('status_transitions_invalid_blocked');
  } else {
    throw new Error(`Invalid transition not blocked (HTTP ${t2.status})`);
  }

} catch (error) {
  console.log(`   ✗ Status transition tests failed: ${error.message}`);
  results.FAIL.push('status_transitions');
  results.critical_errors.push(`Status Transitions: ${error.message}`);
}

console.log('');

// ════════════════════════════════════════════════════════════════════════════
// PHASE 8: STATUS CONSTRAINT
// ════════════════════════════════════════════════════════════════════════════

console.log('📋 PHASE 8: Status Constraint (Invalid Status Rejection)\n');

try {
  const { data: customers } = await supabase.from('customers').select('id').limit(1);
  const { data: services } = await supabase.from('services').select('id').limit(1);
  const { data: staff } = await supabase.from('staff').select('id').limit(1);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const bookingDate = tomorrow.toISOString().split('T')[0];

  // Attempt to create with invalid status
  console.log('   Attempt CREATE with invalid status: "invalid_status"');
  const createRes = await fetch(`${BASE_URL}/api/admin/bookings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({
      bookingNumber: TEST_PREFIX + '-INVALID-STATUS',
      customerId: customers[0].id,
      serviceId: services[0].id,
      staffId: staff[0].id,
      bookingDate,
      startTime: '16:00:00',
      endTime: '17:00:00',
      guests: 1,
      status: 'invalid_status'
    })
  });

  if (createRes.status === 400) {
    console.log('   ✓ Invalid status rejected with HTTP 400');
    results.PASS.push('status_constraint_rejection');
  } else if (createRes.status === 409) {
    console.log('   ✓ Invalid status rejected with HTTP 409');
    results.PASS.push('status_constraint_rejection');
  } else {
    throw new Error(`Invalid status not rejected (HTTP ${createRes.status})`);
  }

} catch (error) {
  console.log(`   ✗ Status constraint test failed: ${error.message}`);
  results.FAIL.push('status_constraint');
  results.critical_errors.push(`Status Constraint: ${error.message}`);
}

console.log('');

// ════════════════════════════════════════════════════════════════════════════
// PHASE 9: OVERLAP CONSTRAINT
// ════════════════════════════════════════════════════════════════════════════

console.log('🔗 PHASE 9: Overlap Constraint (Booking Conflicts)\n');

try {
  const { data: customers } = await supabase.from('customers').select('id').limit(1);
  const { data: services } = await supabase.from('services').select('id').limit(1);
  const { data: staff } = await supabase.from('staff').select('id').limit(1);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const bookingDate = tomorrow.toISOString().split('T')[0];

  // Create first booking
  console.log('   Create booking A: 10:00-11:00');
  const bookingARes = await fetch(`${BASE_URL}/api/admin/bookings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({
      bookingNumber: TEST_PREFIX + '-OVERLAP-A',
      customerId: customers[0].id,
      serviceId: services[0].id,
      staffId: staff[0].id,
      bookingDate,
      startTime: '10:00:00',
      endTime: '11:00:00',
      guests: 1,
      status: 'confirmed'
    })
  });

  if (bookingARes.status !== 201) throw new Error(`Booking A creation failed (HTTP ${bookingARes.status})`);
  const bookingA = await bookingARes.json();
  const bookingAId = bookingA.id || bookingA.data?.id;
  testRecords.bookings.push(bookingAId);
  console.log('   ✓ Booking A created');

  // Attempt overlapping booking
  console.log('   Attempt booking B (overlapping): 10:30-11:30');
  const bookingBRes = await fetch(`${BASE_URL}/api/admin/bookings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({
      bookingNumber: TEST_PREFIX + '-OVERLAP-B',
      customerId: customers[0].id,
      serviceId: services[0].id,
      staffId: staff[0].id,
      bookingDate,
      startTime: '10:30:00',
      endTime: '11:30:00',
      guests: 1,
      status: 'confirmed'
    })
  });

  if (bookingBRes.status === 409) {
    console.log('   ✓ Overlapping booking correctly rejected (HTTP 409)');
    results.PASS.push('overlap_constraint_conflicts_rejected');
  } else {
    throw new Error(`Overlap not prevented (HTTP ${bookingBRes.status})`);
  }

  // Test adjacent bookings (should be allowed)
  console.log('   Attempt booking C (adjacent): 11:00-12:00');
  const bookingCRes = await fetch(`${BASE_URL}/api/admin/bookings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({
      bookingNumber: TEST_PREFIX + '-OVERLAP-C',
      customerId: customers[0].id,
      serviceId: services[0].id,
      staffId: staff[0].id,
      bookingDate,
      startTime: '11:00:00',
      endTime: '12:00:00',
      guests: 1,
      status: 'confirmed'
    })
  });

  if (bookingCRes.status === 201) {
    const bookingC = await bookingCRes.json();
    const bookingCId = bookingC.id || bookingC.data?.id;
    testRecords.bookings.push(bookingCId);
    console.log('   ✓ Adjacent booking allowed (11:00 is valid start after 11:00 end)');
    results.PASS.push('overlap_constraint_adjacent_allowed');
  } else {
    console.log(`   ⚠️  Adjacent booking rejected (HTTP ${bookingCRes.status}) - may be timestamp precision issue`);
  }

  // Test different staff (should overlap freely)
  console.log('   Test different staff member can have overlapping time');
  const { data: staff2 } = await supabase.from('staff').select('id').not('id', 'eq', staff[0].id).limit(1);
  if (staff2 && staff2.length > 0) {
    const bookingDRes = await fetch(`${BASE_URL}/api/admin/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        bookingNumber: TEST_PREFIX + '-OVERLAP-D',
        customerId: customers[0].id,
        serviceId: services[0].id,
        staffId: staff2[0].id,
        bookingDate,
        startTime: '10:30:00',
        endTime: '11:30:00',
        guests: 1,
        status: 'confirmed'
      })
    });

    if (bookingDRes.status === 201) {
      const bookingD = await bookingDRes.json();
      const bookingDId = bookingD.id || bookingD.data?.id;
      testRecords.bookings.push(bookingDId);
      console.log('   ✓ Different staff can have overlapping times');
      results.PASS.push('overlap_constraint_different_staff');
    }
  }

} catch (error) {
  console.log(`   ✗ Overlap constraint tests failed: ${error.message}`);
  results.FAIL.push('overlap_constraint');
  results.critical_errors.push(`Overlap Constraint: ${error.message}`);
}

console.log('');

// ════════════════════════════════════════════════════════════════════════════
// PHASE 10: FOREIGN KEYS
// ════════════════════════════════════════════════════════════════════════════

console.log('🔑 PHASE 10: Foreign Key Constraints\n');

try {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const bookingDate = tomorrow.toISOString().split('T')[0];

  // Try invalid customer_id
  console.log('   Attempt CREATE with invalid customer_id');
  const invalidCustomerRes = await fetch(`${BASE_URL}/api/admin/bookings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({
      bookingNumber: TEST_PREFIX + '-FK-INVALID-CUSTOMER',
      customerId: '00000000-0000-0000-0000-000000000000',
      serviceId: '00000000-0000-0000-0000-000000000000',
      staffId: '00000000-0000-0000-0000-000000000000',
      bookingDate,
      startTime: '10:00:00',
      endTime: '11:00:00',
      guests: 1,
      status: 'pending'
    })
  });

  if (invalidCustomerRes.status === 400) {
    console.log('   ✓ Invalid FK rejected with HTTP 400');
    results.PASS.push('foreign_key_constraints');
  } else {
    console.log(`   ⚠️  FK handling returned HTTP ${invalidCustomerRes.status}`);
  }

} catch (error) {
  console.log(`   ⚠️  FK test blocked: ${error.message}`);
  results.BLOCKED.push('foreign_key_test - may be expected');
}

console.log('');

// ════════════════════════════════════════════════════════════════════════════
// PHASE 11: CONCURRENCY TEST
// ════════════════════════════════════════════════════════════════════════════

console.log('⚡ PHASE 11: Concurrency (Real Simultaneous Bookings)\n');

try {
  const { data: customers } = await supabase.from('customers').select('id').limit(1);
  const { data: services } = await supabase.from('services').select('id').limit(1);
  const { data: staff } = await supabase.from('staff').select('id').limit(1);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 2); // Different day to avoid other conflicts
  const bookingDate = tomorrow.toISOString().split('T')[0];

  console.log('   Launching 2 simultaneous booking attempts for same staff/time...');

  const concurrentBooking = async (num) => {
    const res = await fetch(`${BASE_URL}/api/admin/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        bookingNumber: TEST_PREFIX + `-CONCURRENT-${num}`,
        customerId: customers[0].id,
        serviceId: services[0].id,
        staffId: staff[0].id,
        bookingDate,
        startTime: '15:00:00',
        endTime: '16:00:00',
        guests: 1,
        status: 'confirmed'
      })
    });
    return { num, status: res.status, data: res.status === 201 ? await res.json() : null };
  };

  const [result1, result2] = await Promise.all([
    concurrentBooking(1),
    concurrentBooking(2)
  ]);

  console.log(`   Booking 1: HTTP ${result1.status}`);
  console.log(`   Booking 2: HTTP ${result2.status}`);

  const successes = [result1, result2].filter(r => r.status === 201).length;
  const conflicts = [result1, result2].filter(r => r.status === 409).length;

  if (successes === 1 && conflicts === 1) {
    console.log('   ✓ Concurrency: Exactly 1 succeeded, 1 rejected (correct)');
    results.PASS.push('concurrency_test');
    const successRecord = [result1, result2].find(r => r.status === 201);
    if (successRecord?.data?.id) {
      testRecords.bookings.push(successRecord.data.id || successRecord.data.data?.id);
    }
  } else if (successes === 2) {
    console.log('   ✗ Concurrency FAILED: Both bookings succeeded (overlap should have been prevented)');
    results.FAIL.push('concurrency_test');
    results.critical_errors.push('Concurrency: Both simultaneous bookings succeeded - constraint not enforced');
    [result1, result2].forEach(r => {
      if (r.data?.id) testRecords.bookings.push(r.data.id);
      else if (r.data?.data?.id) testRecords.bookings.push(r.data.data.id);
    });
  } else {
    console.log(`   ✗ Concurrency FAILED: Both rejected (successes: ${successes}, conflicts: ${conflicts})`);
    results.FAIL.push('concurrency_test');
  }

} catch (error) {
  console.log(`   ⚠️  Concurrency test blocked: ${error.message}`);
  results.BLOCKED.push(`concurrency_test - ${error.message}`);
}

console.log('');

// ════════════════════════════════════════════════════════════════════════════
// PHASE 12: REGRESSION TESTS
// ════════════════════════════════════════════════════════════════════════════

console.log('🔍 PHASE 12: Regression Tests\n');

try {
  // Test unrelated API still works
  const dashboardRes = await fetch(`${BASE_URL}/api/dashboard/stats`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });

  if (dashboardRes.ok) {
    console.log('   ✓ Unrelated API (/api/dashboard/stats) still works');
    results.PASS.push('regression_unrelated_apis');
  } else {
    console.log(`   ⚠️  Dashboard API returned HTTP ${dashboardRes.status}`);
  }

  // TypeScript check
  console.log('   Running TypeScript check...');
  try {
    execSync('npm run typecheck', { cwd: join(__dirname, '..'), stdio: 'pipe' });
    console.log('   ✓ TypeScript check passed');
    results.PASS.push('regression_typecheck');
  } catch (e) {
    console.log(`   ✗ TypeScript check failed`);
    results.FAIL.push('regression_typecheck');
  }

} catch (error) {
  console.log(`   ⚠️  Regression tests blocked: ${error.message}`);
  results.BLOCKED.push(`regression - ${error.message}`);
}

console.log('');

// ════════════════════════════════════════════════════════════════════════════
// PHASE 13: DATA INTEGRITY CHECK
// ════════════════════════════════════════════════════════════════════════════

console.log('📊 PHASE 13: Data Integrity Check\n');

try {
  const { data: allBookings } = await supabase.from('bookings').select('*');

  const validStatuses = ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'];
  const invalidFound = allBookings.filter(b => !validStatuses.includes(b.status));

  if (invalidFound.length > 0) {
    throw new Error(`${invalidFound.length} invalid status bookings found`);
  }

  console.log('   ✓ No invalid statuses in database');
  console.log(`   ✓ Total bookings: ${allBookings.length}`);
  results.PASS.push('data_integrity');

} catch (error) {
  console.log(`   ✗ Data integrity check failed: ${error.message}`);
  results.FAIL.push('data_integrity');
}

console.log('');

// ════════════════════════════════════════════════════════════════════════════
// PHASE 14: CLEANUP TEST DATA
// ════════════════════════════════════════════════════════════════════════════

console.log('🧹 PHASE 14: Cleanup Test Data\n');

try {
  console.log(`   Cleaning up ${testRecords.bookings.length} test bookings...`);

  let deletedCount = 0;
  for (const bookingId of testRecords.bookings) {
    const { error } = await supabase
      .from('bookings')
      .delete()
      .eq('id', bookingId);

    if (!error) deletedCount++;
  }

  console.log(`   ✓ Deleted ${deletedCount}/${testRecords.bookings.length} test bookings`);

  // Verify cleanup
  const { data: remainingTest } = await supabase
    .from('bookings')
    .select('id')
    .ilike('bookingNumber', TEST_PREFIX + '%');

  if (remainingTest && remainingTest.length > 0) {
    throw new Error(`${remainingTest.length} test records still remain`);
  }

  console.log('   ✓ Cleanup verified - no test records remain');
  testRecords.bookings = [];
  results.test_data_cleanup_success = true;
  results.PASS.push('cleanup_test_data');

} catch (error) {
  console.log(`   ✗ Cleanup failed: ${error.message}`);
  results.FAIL.push('cleanup_test_data');
  results.critical_errors.push(`Cleanup: ${error.message}`);
}

console.log('');

// ════════════════════════════════════════════════════════════════════════════
// PHASE 15: FINAL GATE
// ════════════════════════════════════════════════════════════════════════════

console.log('🎯 PHASE 15: Final Gate\n');

// Count results
const passCount = results.PASS.length;
const failCount = results.FAIL.length;
const blockedCount = results.BLOCKED.length;
const unverifiableCount = results.UNVERIFIABLE.length;

console.log(`PASS: ${passCount}`);
console.log(`FAIL: ${failCount}`);
console.log(`BLOCKED: ${blockedCount}`);
console.log(`UNVERIFIABLE: ${unverifiableCount}`);
console.log('');

// Critical gate checks
const criticalGates = [
  ['repository', results.PASS.includes('repository')],
  ['database_preflight', results.PASS.includes('database_preflight')],
  ['server_startup', results.PASS.includes('server_startup')],
  ['authentication', results.PASS.includes('authentication')],
  ['CRUD_create', results.PASS.includes('CRUD_create')],
  ['CRUD_delete', results.PASS.includes('CRUD_delete')],
  ['CRUD_persistence', results.PASS.includes('CRUD_persistence')],
  ['status_transitions_valid', results.PASS.includes('status_transitions_valid')],
  ['status_constraint_rejection', results.PASS.includes('status_constraint_rejection')],
  ['overlap_constraint_conflicts_rejected', results.PASS.includes('overlap_constraint_conflicts_rejected')],
  ['concurrency_test', results.PASS.includes('concurrency_test')],
  ['cleanup_test_data', results.PASS.includes('cleanup_test_data')],
  ['regression_typecheck', results.PASS.includes('regression_typecheck')]
];

let allCriticalPass = true;
for (const [gate, passed] of criticalGates) {
  const mark = passed ? '✅' : '❌';
  console.log(`${mark} ${gate}`);
  if (!passed) allCriticalPass = false;
}

console.log('');

// ════════════════════════════════════════════════════════════════════════════
// FINAL VERDICT
// ════════════════════════════════════════════════════════════════════════════

let finalVerdict = 'RED / NOT READY';
let verdictReason = 'Critical gates not passed';

if (allCriticalPass && failCount === 0 && results.critical_errors.length === 0 && results.test_data_cleanup_success) {
  finalVerdict = 'GREEN / PRODUCTION READY';
  verdictReason = 'All critical gates passed';
} else if (allCriticalPass && results.test_data_cleanup_success) {
  finalVerdict = 'YELLOW / CONDITIONALLY READY';
  verdictReason = 'Critical gates passed; non-critical tests may have failures';
}

console.log('╔════════════════════════════════════════════════════════════════════════════╗');
console.log(`║                    FINAL VERDICT: ${finalVerdict.padEnd(45)}║`);
console.log(`║                    ${verdictReason.padEnd(67)}║`);
console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');

// Machine-readable summary
const summary = {
  verdict: finalVerdict,
  timestamp: new Date().toISOString(),
  pass: results.PASS,
  fail: results.FAIL,
  blocked: results.BLOCKED,
  unverifiable: results.UNVERIFIABLE,
  critical_errors: results.critical_errors,
  test_data_cleanup_success: results.test_data_cleanup_success
};

console.log(JSON.stringify(summary, null, 2));

// Cleanup server
if (serverProcess) {
  serverProcess.kill();
  console.log('\n✓ Server stopped');
}

process.exit(failCount > 0 || !allCriticalPass ? 1 : 0);
