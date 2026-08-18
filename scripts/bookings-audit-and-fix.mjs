#!/usr/bin/env node
/**
 * BOOKINGS MANAGEMENT AUDIT & FIX
 * 
 * Comprehensive audit of the bookings system to ensure:
 * 1. Frontend/database schema alignment
 * 2. API contract correctness
 * 3. Status enum validation
 * 4. Security compliance
 * 5. No payment/totalAmount invention
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: join(__dirname, '..', '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  BOOKINGS MANAGEMENT AUDIT & FIX                             ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

const issues = [];
const fixes = [];

// ─── Phase 1: Database Schema Verification ───────────────────────────

console.log('📊 PHASE 1: DATABASE SCHEMA VERIFICATION\n');

const { data: bookingsSchema, error: schemaError } = await supabase
  .from('bookings')
  .select('*')
  .limit(1);

if (schemaError) {
  console.error('❌ Failed to query bookings table:', schemaError.message);
  process.exit(1);
}

// Expected actual schema from user specification
const expectedSchema = {
  id: 'uuid',
  booking_number: 'varchar',
  customer_id: 'uuid',
  service_id: 'uuid',
  staff_id: 'uuid (nullable)',
  booking_date: 'date',
  start_time: 'time',
  end_time: 'time',
  guests: 'smallint',
  status: 'booking_status enum',
  special_requests: 'text (nullable)',
  internal_notes: 'text (nullable)',
  cancellation_reason: 'text (nullable)',
  created_by: 'uuid (nullable)',
  created_at: 'timestamptz',
  updated_at: 'timestamptz',
  during: 'tsrange (nullable)'
};

const validStatuses = ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'];

console.log('✅ Database table exists and is queryable');
console.log(`   Expected columns: ${Object.keys(expectedSchema).join(', ')}\n`);

// Check for invalid totalAmount column
const { data: sampleBooking } = await supabase
  .from('bookings')
  .select('*')
  .limit(1)
  .single();

if (sampleBooking && 'total_amount' in sampleBooking) {
  issues.push({
    severity: 'CRITICAL',
    component: 'Database Schema',
    issue: 'total_amount column exists in bookings table',
    impact: 'Payment logic bleeding into bookings when payments are NOT implemented',
    fix: 'User specified NO total_amount should exist - schema drift detected'
  });
  console.log('⚠️  WARNING: total_amount column found in database (user said it should NOT exist)\n');
} else {
  console.log('✅ Confirmed: NO total_amount column (correct per user specification)\n');
}

// ─── Phase 2: Drizzle Schema Alignment ──────────────────────────────

console.log('📝 PHASE 2: DRIZZLE SCHEMA ALIGNMENT\n');

const drizzleSchemaPath = join(__dirname, '..', 'src', 'db', 'schema.ts');
const drizzleSchema = readFileSync(drizzleSchemaPath, 'utf-8');

// Check Drizzle schema issues
const drizzleIssues = [];

if (drizzleSchema.includes('totalAmount:')) {
  drizzleIssues.push('totalAmount field defined in Drizzle schema');
}

if (drizzleSchema.includes('customerId: uuid') || drizzleSchema.includes('serviceId: uuid')) {
  drizzleIssues.push('Using incorrect snake_case to camelCase conversion');
}

if (drizzleSchema.includes('partySize') || drizzleSchema.includes('bookingTime')) {
  drizzleIssues.push('Using frontend field names instead of database column names');
}

if (drizzleIssues.length > 0) {
  issues.push({
    severity: 'HIGH',
    component: 'Drizzle Schema (src/db/schema.ts)',
    issue: drizzleIssues.join('; '),
    impact: 'Schema drift between Drizzle ORM and actual database',
    fix: 'Align Drizzle schema with actual database columns'
  });
  console.log('❌ Drizzle schema misalignment detected:');
  drizzleIssues.forEach(issue => console.log(`   - ${issue}`));
  console.log();
} else {
  console.log('✅ Drizzle schema appears aligned\n');
}

// ─── Phase 3: Frontend Component Audit ──────────────────────────────

console.log('🎨 PHASE 3: FRONTEND COMPONENT AUDIT\n');

const bookingsViewPath = join(__dirname, '..', 'src', 'features', 'bookings', 'bookings-view.tsx');
const bookingsView = readFileSync(bookingsViewPath, 'utf-8');

const frontendIssues = [];

// Check for field name mismatches
if (bookingsView.includes('partySize:')) {
  frontendIssues.push('Using partySize instead of guests');
}

if (bookingsView.includes('bookingTime:')) {
  frontendIssues.push('Using bookingTime instead of start_time/end_time');
}

if (bookingsView.includes('customerId: z.coerce.number()')) {
  frontendIssues.push('Treating UUIDs as numbers');
}

if (bookingsView.includes('totalAmount: service?.price')) {
  frontendIssues.push('Calculating totalAmount from service price (payment logic leak)');
}

if (bookingsView.includes('"unread"') || bookingsView.includes('"read"')) {
  frontendIssues.push('Using message status values as booking status');
}

// Check status enum
const statusMatch = bookingsView.match(/z\.enum\(\[(.*?)\]\)/s);
if (statusMatch) {
  const definedStatuses = statusMatch[1].split(',').map(s => s.trim().replace(/['"]/g, ''));
  const missingStatuses = validStatuses.filter(s => !definedStatuses.includes(s));
  const extraStatuses = definedStatuses.filter(s => !validStatuses.includes(s));
  
  if (missingStatuses.length > 0) {
    frontendIssues.push(`Missing valid statuses: ${missingStatuses.join(', ')}`);
  }
  if (extraStatuses.length > 0) {
    frontendIssues.push(`Invalid statuses defined: ${extraStatuses.join(', ')}`);
  }
}

if (frontendIssues.length > 0) {
  issues.push({
    severity: 'CRITICAL',
    component: 'Frontend (src/features/bookings/bookings-view.tsx)',
    issue: frontendIssues.join('; '),
    impact: 'Runtime errors, API failures, invalid database writes',
    fix: 'Align frontend fields with actual database schema'
  });
  console.log('❌ Frontend component issues:');
  frontendIssues.forEach(issue => console.log(`   - ${issue}`));
  console.log();
} else {
  console.log('✅ Frontend component fields appear correct\n');
}

// ─── Phase 4: API Contract Verification ─────────────────────────────

console.log('🔌 PHASE 4: API CONTRACT VERIFICATION\n');

try {
  // Test list endpoint (no auth needed for audit, will fail but shows contract)
  const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL.replace('/v1', '')}/api/admin/bookings`);
  console.log(`   GET /api/admin/bookings: ${response.status}`);
  
  if (response.status === 401) {
    console.log('✅ Authentication required (correct)\n');
  }
} catch (e) {
  console.log('⚠️  Cannot test API endpoints without running dev server\n');
}

// ─── Phase 5: Status Management Audit ────────────────────────────────

console.log('📋 PHASE 5: STATUS MANAGEMENT AUDIT\n');

const { data: bookings, error: bookingsError } = await supabase
  .from('bookings')
  .select('id, booking_number, status')
  .limit(100);

if (bookingsError) {
  console.log('❌ Failed to fetch bookings:', bookingsError.message);
} else {
  console.log(`✅ Found ${bookings.length} bookings in database`);
  
  const statusCounts = {};
  const invalidStatuses = [];
  
  bookings.forEach(b => {
    const status = b.status;
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    
    if (!validStatuses.includes(status)) {
      invalidStatuses.push({ id: b.id, booking_number: b.booking_number, status });
    }
  });
  
  console.log('\n   Status distribution:');
  Object.entries(statusCounts).forEach(([status, count]) => {
    const valid = validStatuses.includes(status) ? '✅' : '❌';
    console.log(`   ${valid} ${status}: ${count}`);
  });
  
  if (invalidStatuses.length > 0) {
    issues.push({
      severity: 'HIGH',
      component: 'Database Data',
      issue: `${invalidStatuses.length} bookings with invalid status values`,
      impact: 'Frontend filters/validation will reject these bookings',
      fix: 'Update invalid statuses to valid enum values'
    });
    console.log(`\n❌ Found ${invalidStatuses.length} bookings with invalid status:`);
    invalidStatuses.slice(0, 5).forEach(b => {
      console.log(`   - ${b.booking_number}: "${b.status}"`);
    });
    if (invalidStatuses.length > 5) {
      console.log(`   ... and ${invalidStatuses.length - 5} more`);
    }
  }
  console.log();
}

// ─── Phase 6: Test Data Verification ────────────────────────────────

console.log('🧪 PHASE 6: TEST DATA VERIFICATION\n');

const testBookingNumbers = ['ZT-9CC3161E', 'ZT-65E538AA', 'ZT-9A129CF7', 'ZT-8572578B'];

for (const bookingNum of testBookingNumbers) {
  const { data, error } = await supabase
    .from('bookings')
    .select('id, booking_number, status')
    .eq('booking_number', bookingNum)
    .maybeSingle();
  
  if (data) {
    console.log(`✅ Test booking preserved: ${bookingNum} (status: ${data.status})`);
  } else {
    console.log(`⚠️  Test booking not found: ${bookingNum}`);
  }
}

console.log();

// ─── Phase 7: Security Checks ────────────────────────────────────────

console.log('🔒 PHASE 7: SECURITY CHECKS\n');

// Check RLS policies
try {
  const { data: policies } = await supabase.rpc('get_table_policies', { table_name: 'bookings' });
  if (policies) {
    console.log(`✅ RLS policies exist for bookings table`);
  } else {
    console.log('⚠️  Unable to verify RLS policies');
  }
} catch (e) {
  console.log('⚠️  Unable to verify RLS policies (function may not exist)');
}

// Check for service role key exposure
if (bookingsView.includes('SUPABASE_SERVICE_ROLE_KEY') || bookingsView.includes('service_role')) {
  issues.push({
    severity: 'CRITICAL',
    component: 'Frontend Component',
    issue: 'Service role key reference in client code',
    impact: 'SECURITY BREACH - privileged key exposed to browser',
    fix: 'Remove all service role key references from frontend code'
  });
  console.log('❌ CRITICAL: Service role key reference found in frontend\n');
} else {
  console.log('✅ No service role key exposure detected\n');
}

// ─── Phase 8: Field Mapping Analysis ────────────────────────────────

console.log('🗺️  PHASE 8: FIELD MAPPING ANALYSIS\n');

const fieldMapping = {
  frontend: {
    customerId: 'customer_id',
    serviceId: 'service_id',
    staffId: 'staff_id',
    bookingDate: 'booking_date',
    bookingTime: 'start_time / end_time',
    partySize: 'guests',
    totalAmount: 'NOT IN DATABASE'
  }
};

console.log('Field mapping (Frontend → Database):');
Object.entries(fieldMapping.frontend).forEach(([frontend, database]) => {
  const status = database === 'NOT IN DATABASE' ? '❌' : '✅';
  console.log(`   ${status} ${frontend} → ${database}`);
});

console.log();

// ─── Final Report ────────────────────────────────────────────────────

console.log('═══════════════════════════════════════════════════════════════\n');
console.log('📊 AUDIT SUMMARY\n');

if (issues.length === 0) {
  console.log('✅ No critical issues found\n');
} else {
  console.log(`❌ Found ${issues.length} issue(s):\n`);
  
  issues.forEach((issue, i) => {
    console.log(`${i + 1}. [${issue.severity}] ${issue.component}`);
    console.log(`   Issue: ${issue.issue}`);
    console.log(`   Impact: ${issue.impact}`);
    console.log(`   Fix: ${issue.fix}\n`);
  });
}

console.log('═══════════════════════════════════════════════════════════════\n');

// Generate fix recommendations
if (issues.length > 0) {
  console.log('🔧 RECOMMENDED FIXES:\n');
  
  const criticalIssues = issues.filter(i => i.severity === 'CRITICAL');
  const highIssues = issues.filter(i => i.severity === 'HIGH');
  
  if (criticalIssues.length > 0) {
    console.log('CRITICAL (must fix before deployment):');
    criticalIssues.forEach((issue, i) => {
      console.log(`${i + 1}. ${issue.component}: ${issue.fix}`);
    });
    console.log();
  }
  
  if (highIssues.length > 0) {
    console.log('HIGH (fix soon):');
    highIssues.forEach((issue, i) => {
      console.log(`${i + 1}. ${issue.component}: ${issue.fix}`);
    });
    console.log();
  }
}

console.log('NEXT STEPS:');
console.log('1. Review issues above');
console.log('2. Fix frontend field mapping');
console.log('3. Remove totalAmount calculation');
console.log('4. Add no_show to status enum');
console.log('5. Run: npm run typecheck');
console.log('6. Run: npm run build');
console.log('7. Test bookings CRUD in browser\n');

process.exit(issues.length > 0 ? 1 : 0);
