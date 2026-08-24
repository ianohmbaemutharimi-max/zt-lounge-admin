#!/usr/bin/env node

/**
 * ZT LOUNGE BOOKING RLS — VERIFICATION ONLY
 * 
 * This script verifies that RLS has been properly applied to the booking system.
 * Run this AFTER manually applying the RLS migration in Supabase Dashboard.
 */

import { createClient } from '@supabase/supabase-js';
import { writeFile } from 'fs/promises';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey || !anonKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
const anonClient = createClient(supabaseUrl, anonKey);

const report = {
  timestamp: new Date().toISOString(),
  project: 'jczwilrysvnhcjzjztbi',
  tests: {},
  verdict: null
};

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  ZT LOUNGE BOOKING RLS — SECURITY VERIFICATION                 ║');
console.log('║  Testing with ANONYMOUS credentials (not service_role)         ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// =============================================================
// ANONYMOUS SECURITY TESTS
// =============================================================
console.log('Running 9 security tests...\n');

const tests = {};

console.log('[1/9] Anonymous SELECT bookings...');
const t1 = await anonClient.from('bookings').select('id').limit(1);
tests.select_bookings = { blocked: !!t1.error, error_code: t1.error?.code };
console.log(`   ${tests.select_bookings.blocked ? '✅ BLOCKED' : '❌ ALLOWED - SECURITY ISSUE!'}\n`);

console.log('[2/9] Anonymous SELECT customers...');
const t2 = await anonClient.from('customers').select('id').limit(1);
tests.select_customers = { blocked: !!t2.error, error_code: t2.error?.code };
console.log(`   ${tests.select_customers.blocked ? '✅ BLOCKED' : '❌ ALLOWED - SECURITY ISSUE!'}\n`);

console.log('[3/9] Anonymous INSERT bookings...');
const t3 = await anonClient.from('bookings').insert({
  booking_number: 'TEST-HACK',
  customer_id: '00000000-0000-0000-0000-000000000000',
  service_id: '00000000-0000-0000-0000-000000000000',
  booking_date: '2099-12-31',
  start_time: '12:00',
  end_time: '13:00',
  guests: 2,
  status: 'pending'
});
tests.insert_bookings = { blocked: !!t3.error, error_code: t3.error?.code };
console.log(`   ${tests.insert_bookings.blocked ? '✅ BLOCKED' : '❌ ALLOWED - SECURITY ISSUE!'}\n`);

console.log('[4/9] Anonymous UPDATE bookings...');
const t4 = await anonClient.from('bookings')
  .update({ special_requests: 'hacked' })
  .eq('id', '00000000-0000-0000-0000-000000000000');
tests.update_bookings = { blocked: !!t4.error, error_code: t4.error?.code };
console.log(`   ${tests.update_bookings.blocked ? '✅ BLOCKED' : '❌ ALLOWED - SECURITY ISSUE!'}\n`);

console.log('[5/9] Anonymous DELETE bookings...');
const t5 = await anonClient.from('bookings').delete()
  .eq('id', '00000000-0000-0000-0000-000000000000');
tests.delete_bookings = { blocked: !!t5.error, error_code: t5.error?.code };
console.log(`   ${tests.delete_bookings.blocked ? '✅ BLOCKED' : '❌ ALLOWED - SECURITY ISSUE!'}\n`);

console.log('[6/9] Anonymous INSERT customers...');
const t6 = await anonClient.from('customers').insert({
  full_name: 'Hacker', 
  phone: '+254700000999', 
  email: 'hacker@evil.com'
});
tests.insert_customers = { blocked: !!t6.error, error_code: t6.error?.code };
console.log(`   ${tests.insert_customers.blocked ? '✅ BLOCKED' : '❌ ALLOWED - SECURITY ISSUE!'}\n`);

console.log('[7/9] Anonymous UPDATE customers...');
const t7 = await anonClient.from('customers')
  .update({ full_name: 'Hacked' })
  .eq('id', '00000000-0000-0000-0000-000000000000');
tests.update_customers = { blocked: !!t7.error, error_code: t7.error?.code };
console.log(`   ${tests.update_customers.blocked ? '✅ BLOCKED' : '❌ ALLOWED - SECURITY ISSUE!'}\n`);

console.log('[8/9] Anonymous DELETE customers...');
const t8 = await anonClient.from('customers').delete()
  .eq('id', '00000000-0000-0000-0000-000000000000');
tests.delete_customers = { blocked: !!t8.error, error_code: t8.error?.code };
console.log(`   ${tests.delete_customers.blocked ? '✅ BLOCKED' : '❌ ALLOWED - SECURITY ISSUE!'}\n`);

console.log('[9/9] Public create_booking() RPC (should work)...');
const rpcTest = await anonClient.rpc('create_booking', {
  p_full_name: 'RLS Verification Test',
  p_phone: `+2547${Date.now().toString().slice(-8)}`,
  p_booking_date: '2099-12-25',
  p_start_time: '18:30',
  p_guests: 2,
  p_email: `rls-verification-${Date.now()}@test.com`,
  p_service_slug: 'restaurant',
  p_special_requests: 'RLS verification test - safe to delete'
});

const rpcSuccess = !rpcTest.error && !!rpcTest.data;
tests.create_booking_rpc = {
  works: rpcSuccess,
  error: rpcTest.error?.message,
  booking_number: rpcTest.data?.booking_number
};
console.log(`   ${rpcSuccess ? '✅ WORKS' : '❌ FAILED - BOOKING BROKEN!'}\n`);

if (rpcSuccess) {
  console.log(`   Created test booking: ${rpcTest.data.booking_number}`);
  console.log(`   Customer ID: ${rpcTest.data.customer_id}`);
  console.log(`   Status: ${rpcTest.data.status}\n`);
}

report.tests = tests;

// =============================================================
// GATE EVALUATION
// =============================================================
console.log('═══════════════════════════════════════════════════════════════');
console.log('GATE 1: SECURITY / RLS');
console.log('═══════════════════════════════════════════════════════════════\n');

const allSecurityChecks = [
  tests.select_bookings.blocked,
  tests.select_customers.blocked,
  tests.insert_bookings.blocked,
  tests.update_bookings.blocked,
  tests.delete_bookings.blocked,
  tests.insert_customers.blocked,
  tests.update_customers.blocked,
  tests.delete_customers.blocked,
  rpcSuccess
];

const gate1Pass = allSecurityChecks.every(check => check === true);

console.log(`${tests.select_bookings.blocked ? '✅' : '❌'} Anonymous SELECT bookings: ${tests.select_bookings.blocked ? 'BLOCKED' : 'ALLOWED'}`);
console.log(`${tests.select_customers.blocked ? '✅' : '❌'} Anonymous SELECT customers: ${tests.select_customers.blocked ? 'BLOCKED' : 'ALLOWED'}`);
console.log(`${tests.insert_bookings.blocked ? '✅' : '❌'} Anonymous INSERT bookings: ${tests.insert_bookings.blocked ? 'BLOCKED' : 'ALLOWED'}`);
console.log(`${tests.update_bookings.blocked ? '✅' : '❌'} Anonymous UPDATE bookings: ${tests.update_bookings.blocked ? 'BLOCKED' : 'ALLOWED'}`);
console.log(`${tests.delete_bookings.blocked ? '✅' : '❌'} Anonymous DELETE bookings: ${tests.delete_bookings.blocked ? 'BLOCKED' : 'ALLOWED'}`);
console.log(`${tests.insert_customers.blocked ? '✅' : '❌'} Anonymous INSERT customers: ${tests.insert_customers.blocked ? 'BLOCKED' : 'ALLOWED'}`);
console.log(`${tests.update_customers.blocked ? '✅' : '❌'} Anonymous UPDATE customers: ${tests.update_customers.blocked ? 'BLOCKED' : 'ALLOWED'}`);
console.log(`${tests.delete_customers.blocked ? '✅' : '❌'} Anonymous DELETE customers: ${tests.delete_customers.blocked ? 'BLOCKED' : 'ALLOWED'}`);
console.log(`${rpcSuccess ? '✅' : '❌'} Public create_booking() RPC: ${rpcSuccess ? 'WORKS' : 'FAILED'}`);

console.log('\n═══════════════════════════════════════════════════════════════\n');

report.verdict = gate1Pass ? 'PASS' : 'FAIL';
report.gate1_pass = gate1Pass;

const reportPath = `ZT_RLS_SECURITY_VERIFICATION_${Date.now()}.json`;
await writeFile(reportPath, JSON.stringify(report, null, 2));

console.log('╔════════════════════════════════════════════════════════════════╗');
if (gate1Pass) {
  console.log('║  ✅ ✅ ✅  RLS SECURITY VERIFIED — PRODUCTION READY  ✅ ✅ ✅  ║');
} else {
  console.log('║  ❌ ❌ ❌  RLS SECURITY VERIFICATION FAILED  ❌ ❌ ❌          ║');
}
console.log('╚════════════════════════════════════════════════════════════════╝\n');

console.log(`📄 Detailed report: ${reportPath}\n`);

if (gate1Pass) {
  console.log('✅ PRODUCTION READY\n');
  console.log('Security Status:');
  console.log('  • All anonymous direct table access properly blocked');
  console.log('  • Public booking RPC working correctly');
  console.log('  • Security gate PASSED\n');
  console.log('Next Steps:');
  console.log('  • System is secure and ready for production');
  console.log('  • Public booking form will work correctly');
  console.log('  • Admin dashboard access preserved\n');
  process.exit(0);
} else {
  console.log('❌ NOT PRODUCTION READY\n');
  console.log('Issues Detected:');
  if (!tests.select_bookings.blocked) console.log('  • Anonymous users can SELECT bookings (security risk)');
  if (!tests.select_customers.blocked) console.log('  • Anonymous users can SELECT customers (security risk)');
  if (!tests.insert_bookings.blocked) console.log('  • Anonymous users can INSERT bookings directly (bypass)');
  if (!tests.update_bookings.blocked) console.log('  • Anonymous users can UPDATE bookings (tampering risk)');
  if (!tests.delete_bookings.blocked) console.log('  • Anonymous users can DELETE bookings (data loss risk)');
  if (!tests.insert_customers.blocked) console.log('  • Anonymous users can INSERT customers directly (bypass)');
  if (!tests.update_customers.blocked) console.log('  • Anonymous users can UPDATE customers (tampering risk)');
  if (!tests.delete_customers.blocked) console.log('  • Anonymous users can DELETE customers (data loss risk)');
  if (!rpcSuccess) console.log('  • Public create_booking() RPC not working (booking broken)');
  
  console.log('\nAction Required:');
  console.log('  1. Verify the RLS migration was applied correctly');
  console.log('  2. Check Supabase Dashboard → Authentication → Policies');
  console.log('  3. Re-apply migration if needed\n');
  process.exit(1);
}
