#!/usr/bin/env node

/**
 * ZT LOUNGE — CUSTOMER LIFECYCLE & BOOKING ARCHITECTURE AUDIT
 * READ-ONLY INSPECTION — NO MODIFICATIONS
 * 
 * Traces complete customer lifecycle from public booking through admin confirmation
 */

import { createClient } from '@supabase/supabase-js';
import { writeFile, readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
try {
  const envPath = join(__dirname, '..', '.env.local');
  const envContent = await readFile(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...values] = trimmed.split('=');
      if (key && values.length > 0) {
        process.env[key.trim()] = values.join('=').trim();
      }
    }
  });
} catch (error) {
  console.error('⚠️  Could not load .env.local');
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

const audit = {
  timestamp: new Date().toISOString(),
  phases: {}
};

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  CUSTOMER LIFECYCLE & BOOKING ARCHITECTURE AUDIT               ║');
console.log('║  READ-ONLY INSPECTION                                          ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// ============================================================
// PHASE 1: TRACE COMPLETE DATA FLOW
// ============================================================
console.log('📍 PHASE 1: TRACING COMPLETE DATA FLOW\n');

// Check create_booking RPC implementation
console.log('[1.1] Inspecting create_booking() RPC...');
const { data: createBookingDef } = await supabase.rpc('exec_sql', {
  sql: `SELECT pg_get_functiondef(oid) AS definition
        FROM pg_proc
        WHERE proname = 'create_booking'
          AND pronamespace = 'public'::regnamespace;`
});

audit.phases.phase1_data_flow = {
  create_booking_function: createBookingDef?.[0]?.definition || 'NOT_FOUND'
};

console.log('   ✓ RPC definition captured\n');

// ============================================================
// PHASE 2: CUSTOMER CREATION SEMANTICS
// ============================================================
console.log('📍 PHASE 2: CUSTOMER CREATION SEMANTICS\n');

// Extract customer creation logic from RPC
const rpcCode = createBookingDef?.[0]?.definition || '';
const customerCreationPattern = /INSERT INTO.*customers|SELECT.*FROM.*customers|UPSERT|ON CONFLICT/gi;
const customerLogic = rpcCode.match(customerCreationPattern) || [];

console.log('[2.1] Customer creation timing analysis:');
const hasCustomerLookup = rpcCode.toLowerCase().includes('select') && rpcCode.toLowerCase().includes('customers');
const hasCustomerInsert = rpcCode.toLowerCase().includes('insert') && rpcCode.toLowerCase().includes('customers');
const hasConflictHandling = rpcCode.toLowerCase().includes('on conflict');

console.log(`   Customer lookup: ${hasCustomerLookup ? '✓' : '✗'}`);
console.log(`   Customer insert: ${hasCustomerInsert ? '✓' : '✗'}`);
console.log(`   Conflict handling: ${hasConflictHandling ? '✓' : '✗'}`);

audit.phases.phase2_customer_semantics = {
  has_customer_lookup: hasCustomerLookup,
  has_customer_insert: hasCustomerInsert,
  has_conflict_handling: hasConflictHandling,
  customer_logic_snippets: customerLogic
};

// Get sample bookings with customer data
const { data: sampleBookings } = await supabase
  .from('bookings')
  .select(`
    id,
    status,
    created_at,
    customer_id,
    customers (
      id,
      full_name,
      phone,
      email
    )
  `)
  .order('created_at', { ascending: false })
  .limit(5);

console.log(`\n[2.2] Sample booking → customer relationships:`);
sampleBookings?.forEach((b, i) => {
  console.log(`   ${i + 1}. Status: ${b.status} | Customer ID: ${b.customer_id?.substring(0, 8)}...`);
});

audit.phases.phase2_customer_semantics.sample_relationships = sampleBookings;

console.log('');

// ============================================================
// PHASE 3: CUSTOMER IDENTITY MODEL
// ============================================================
console.log('📍 PHASE 3: CUSTOMER IDENTITY MODEL\n');

// Get customers table schema
const { data: customersSchema } = await supabase.rpc('exec_sql', {
  sql: `
    SELECT 
      column_name,
      data_type,
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'customers'
    ORDER BY ordinal_position;
  `
});

console.log('[3.1] Customers table schema:');
customersSchema?.forEach(col => {
  console.log(`   - ${col.column_name}: ${col.data_type}${col.is_nullable === 'NO' ? ' NOT NULL' : ''}`);
});

// Get unique constraints
const { data: customerConstraints } = await supabase.rpc('exec_sql', {
  sql: `
    SELECT
      con.conname AS constraint_name,
      pg_get_constraintdef(con.oid) AS definition
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'customers'
      AND rel.relnamespace = 'public'::regnamespace
      AND con.contype IN ('u', 'p')
    ORDER BY con.conname;
  `
});

console.log(`\n[3.2] Customer constraints:`);
customerConstraints?.forEach(c => {
  console.log(`   - ${c.constraint_name}: ${c.definition}`);
});

// Sample phone formats
const { data: phoneFormats } = await supabase
  .from('customers')
  .select('phone')
  .not('phone', 'is', null)
  .limit(20);

const formatAnalysis = {};
phoneFormats?.forEach(({ phone }) => {
  let format = 'unknown';
  if (phone.startsWith('+254')) format = 'international (+254)';
  else if (phone.startsWith('07') || phone.startsWith('01')) format = 'local (07/01)';
  else if (phone.startsWith('254')) format = 'country-code (254)';
  else if (phone.startsWith('7') || phone.startsWith('1')) format = 'short (7/1)';
  
  formatAnalysis[format] = (formatAnalysis[format] || 0) + 1;
});

console.log(`\n[3.3] Phone format distribution:`);
Object.entries(formatAnalysis).forEach(([format, count]) => {
  console.log(`   - ${format}: ${count} records`);
});

audit.phases.phase3_identity = {
  schema: customersSchema,
  constraints: customerConstraints,
  phone_format_distribution: formatAnalysis,
  phone_samples: phoneFormats?.slice(0, 5).map(p => p.phone)
};

console.log('');

// ============================================================
// PHASE 4: BOOKING → CUSTOMER RELATIONSHIP
// ============================================================
console.log('📍 PHASE 4: BOOKING → CUSTOMER RELATIONSHIP\n');

// Verify FK constraint
const { data: bookingFK } = await supabase.rpc('exec_sql', {
  sql: `
    SELECT
      con.conname AS constraint_name,
      pg_get_constraintdef(con.oid) AS definition
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'bookings'
      AND con.contype = 'f'
      AND pg_get_constraintdef(con.oid) LIKE '%customer%';
  `
});

console.log('[4.1] Booking → Customer foreign key:');
bookingFK?.forEach(fk => {
  console.log(`   ${fk.constraint_name}: ${fk.definition}`);
});

// Check for orphaned bookings
const { data: orphanCheck } = await supabase.rpc('exec_sql', {
  sql: `
    SELECT COUNT(*) as count
    FROM bookings b
    LEFT JOIN customers c ON c.id = b.customer_id
    WHERE c.id IS NULL;
  `
});

console.log(`\n[4.2] Orphaned bookings (missing customer): ${orphanCheck?.[0]?.count || 0}`);

// Check customer reuse
const { data: customerReuse } = await supabase.rpc('exec_sql', {
  sql: `
    SELECT 
      customer_id,
      COUNT(*) as booking_count
    FROM bookings
    GROUP BY customer_id
    HAVING COUNT(*) > 1
    ORDER BY booking_count DESC
    LIMIT 5;
  `
});

console.log(`\n[4.3] Customers with multiple bookings:`);
customerReuse?.forEach((c, i) => {
  console.log(`   ${i + 1}. Customer ${c.customer_id.substring(0, 8)}...: ${c.booking_count} bookings`);
});

audit.phases.phase4_relationship = {
  foreign_key: bookingFK,
  orphaned_bookings: orphanCheck?.[0]?.count || 0,
  multi_booking_customers: customerReuse
};

console.log('');

// ============================================================
// PHASE 5: CONFIRMATION SEMANTICS
// ============================================================
console.log('📍 PHASE 5: CONFIRMATION SEMANTICS\n');

// Check booking_status enum
const { data: statusEnum } = await supabase.rpc('exec_sql', {
  sql: `
    SELECT enumlabel
    FROM pg_enum
    WHERE enumtypid = 'booking_status'::regtype
    ORDER BY enumsortorder;
  `
});

console.log('[5.1] Booking status values:');
statusEnum?.forEach(s => {
  console.log(`   - ${s.enumlabel}`);
});

// Status distribution
const { data: statusDist } = await supabase
  .from('bookings')
  .select('status')
  .order('created_at', { ascending: false });

const statusCount = {};
statusDist?.forEach(({ status }) => {
  statusCount[status] = (statusCount[status] || 0) + 1;
});

console.log(`\n[5.2] Status distribution in live data:`);
Object.entries(statusCount).forEach(([status, count]) => {
  console.log(`   - ${status}: ${count} bookings`);
});

audit.phases.phase5_confirmation = {
  available_statuses: statusEnum?.map(s => s.enumlabel),
  status_distribution: statusCount
};

console.log('');

// ============================================================
// PHASE 6: ADMIN CUSTOMERS PAGE
// ============================================================
console.log('📍 PHASE 6: ADMIN CUSTOMERS PAGE\n');

// Check if there's a customers endpoint/API
console.log('[6.1] Checking customer query patterns...');

// Sample customers with booking counts
const { data: customersWithBookings } = await supabase.rpc('exec_sql', {
  sql: `
    SELECT 
      c.id,
      c.full_name,
      c.phone,
      COUNT(b.id) as total_bookings,
      COUNT(CASE WHEN b.status = 'confirmed' THEN 1 END) as confirmed_bookings,
      COUNT(CASE WHEN b.status = 'completed' THEN 1 END) as completed_bookings,
      COUNT(CASE WHEN b.status = 'pending' THEN 1 END) as pending_bookings
    FROM customers c
    LEFT JOIN bookings b ON b.customer_id = c.id
    GROUP BY c.id, c.full_name, c.phone
    ORDER BY total_bookings DESC
    LIMIT 10;
  `
});

console.log(`\n[6.2] Customers with booking status breakdown:`);
customersWithBookings?.forEach((c, i) => {
  console.log(`   ${i + 1}. ${c.full_name}: Total=${c.total_bookings}, Confirmed=${c.confirmed_bookings}, Completed=${c.completed_bookings}, Pending=${c.pending_bookings}`);
});

audit.phases.phase6_admin_customers = {
  sample_customers_with_bookings: customersWithBookings
};

console.log('');

// ============================================================
// PHASE 7: DASHBOARD CUSTOMER METRIC
// ============================================================
console.log('📍 PHASE 7: DASHBOARD CUSTOMER METRIC\n');

// Check various customer metrics
const { data: metrics } = await supabase.rpc('exec_sql', {
  sql: `
    SELECT
      (SELECT COUNT(*) FROM customers) as total_customer_records,
      (SELECT COUNT(DISTINCT customer_id) FROM bookings) as customers_with_bookings,
      (SELECT COUNT(DISTINCT customer_id) FROM bookings WHERE status = 'pending') as customers_with_pending,
      (SELECT COUNT(DISTINCT customer_id) FROM bookings WHERE status = 'confirmed') as customers_with_confirmed,
      (SELECT COUNT(DISTINCT customer_id) FROM bookings WHERE status = 'completed') as customers_with_completed,
      (SELECT COUNT(DISTINCT customer_id) FROM bookings WHERE status IN ('confirmed', 'completed')) as customers_confirmed_or_completed;
  `
});

console.log('[7.1] Customer metric analysis:');
if (metrics?.[0]) {
  console.log(`   Total customer records: ${metrics[0].total_customer_records}`);
  console.log(`   Customers with any booking: ${metrics[0].customers_with_bookings}`);
  console.log(`   Customers with pending: ${metrics[0].customers_with_pending}`);
  console.log(`   Customers with confirmed: ${metrics[0].customers_with_confirmed}`);
  console.log(`   Customers with completed: ${metrics[0].customers_with_completed}`);
  console.log(`   Customers with confirmed OR completed: ${metrics[0].customers_confirmed_or_completed}`);
}

audit.phases.phase7_metrics = metrics?.[0] || {};

console.log('');

// ============================================================
// PHASE 8: SIX PUBLIC BOOKING FORMS
// ============================================================
console.log('📍 PHASE 8: SIX PUBLIC BOOKING FORMS\n');

// Check services table
const { data: services } = await supabase
  .from('services')
  .select('id, name, slug, is_active')
  .order('name');

console.log('[8.1] Available services:');
services?.forEach(s => {
  console.log(`   - ${s.name} (${s.slug}): ${s.is_active ? 'ACTIVE' : 'INACTIVE'}`);
});

// Check booking distribution by service
const { data: serviceBookings } = await supabase.rpc('exec_sql', {
  sql: `
    SELECT 
      s.name,
      s.slug,
      COUNT(b.id) as booking_count,
      COUNT(CASE WHEN b.status = 'confirmed' THEN 1 END) as confirmed_count
    FROM services s
    LEFT JOIN bookings b ON b.service_id = s.id
    GROUP BY s.id, s.name, s.slug
    ORDER BY booking_count DESC;
  `
});

console.log(`\n[8.2] Bookings by service:`);
serviceBookings?.forEach(s => {
  console.log(`   - ${s.name}: ${s.booking_count} total (${s.confirmed_count} confirmed)`);
});

audit.phases.phase8_forms = {
  services: services,
  service_booking_distribution: serviceBookings
};

console.log('');

// ============================================================
// SAVE AUDIT REPORT
// ============================================================
const reportPath = `CUSTOMER_LIFECYCLE_ARCHITECTURE_AUDIT_${Date.now()}.json`;
await writeFile(reportPath, JSON.stringify(audit, null, 2));

console.log('═══════════════════════════════════════════════════════════════');
console.log('📊 AUDIT COMPLETE');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log(`📄 Full audit saved: ${reportPath}\n`);

console.log('✅ Read-only audit completed successfully');
console.log('   No modifications were made to the system\n');

process.exit(0);
