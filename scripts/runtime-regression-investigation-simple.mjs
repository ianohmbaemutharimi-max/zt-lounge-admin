#!/usr/bin/env node

/**
 * RUNTIME REGRESSION INVESTIGATION - SIMPLIFIED
 * Focus on database schema and immediate errors
 */

import { createClient } from '@supabase/supabase-js';
import { writeFile } from 'fs/promises';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const report = {
  timestamp: new Date().toISOString(),
  findings: {}
};

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  RUNTIME REGRESSION INVESTIGATION - SIMPLIFIED                 ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// ============================================================
// 1. SERVICES SCHEMA - LIVE DATABASE
// ============================================================
console.log('═══ 1. SERVICES SCHEMA - LIVE DATABASE ===\n');

const { data: services, error: servicesError } = await supabase
  .from('services')
  .select('*')
  .limit(1)
  .single();

if (servicesError) {
  console.log(`   ❌ Failed to query services: ${servicesError.message}`);
  report.findings.services_schema = { error: servicesError.message };
} else if (services) {
  const columns = Object.keys(services);
  console.log('Services table columns:');
  columns.forEach(col => console.log(`   • ${col}`));
  
  report.findings.services_schema = {
    columns,
    has_active: columns.includes('active'),
    has_is_active: columns.includes('is_active'),
    sample_service: services.name || services.slug
  };
  
  console.log(`\n   ${columns.includes('is_active') ? '✅' : '❌'} has is_active column`);
  console.log(`   ${columns.includes('active') ? '✅' : '❌'} has active column\n`);
}

// ============================================================
// 2. TEST is_active QUERY
// ============================================================
console.log('═══ 2. TESTING is_active QUERY ===\n');

const { data: activeServices, error: activeError } = await supabase
  .from('services')
  .select('*')
  .eq('is_active', true);

if (activeError) {
  console.log(`   ❌ Query failed: ${activeError.message}`);
  console.log(`   Error code: ${activeError.code}`);
  console.log(`   Details: ${activeError.details}\n`);
  report.findings.is_active_query = {
    success: false,
    error: activeError.message,
    code: activeError.code,
    details: activeError.details
  };
} else {
  console.log(`   ✅ Query succeeded (${activeServices?.length || 0} results)`);
  report.findings.is_active_query = {
    success: true,
    count: activeServices?.length || 0
  };
}

// ============================================================
// 3. TEST ALL SERVICES QUERY
// ============================================================
console.log('═══ 3. TESTING ALL SERVICES QUERY ===\n');

const { data: allServices, error: allError } = await supabase
  .from('services')
  .select('id, slug, name');

if (allError) {
  console.log(`   ❌ Query failed: ${allError.message}\n`);
  report.findings.all_services = { error: allError.message };
} else {
  console.log(`   ✅ Found ${allServices?.length || 0} services:`);
  allServices?.forEach(s => console.log(`      • ${s.slug} (${s.name})`));
  console.log('');
  report.findings.all_services = {
    count: allServices?.length || 0,
    services: allServices
  };
}

// ============================================================
// 4. CHECK BOOKINGS FUNCTION
// ============================================================
console.log('═══ 4. CHECKING create_booking FUNCTION ===\n');

try {
  // Try to call with minimal valid data
  const { data, error } = await supabase.rpc('create_booking', {
    p_full_name: 'Test User',
    p_phone: '+254799999999',
    p_booking_date: '2026-12-25',
    p_start_time: '14:00',
    p_guests: 2
  });
  
  if (error) {
    console.log(`   ⚠️  Function exists but failed: ${error.message}`);
    console.log(`   (This may be expected if phone validation is strict)\n`);
    report.findings.create_booking = {
      exists: true,
      callable: false,
      error: error.message
    };
  } else {
    console.log(`   ✅ Function callable and returned data\n`);
    report.findings.create_booking = {
      exists: true,
      callable: true
    };
  }
} catch (e) {
  console.log(`   ❌ Function may not exist: ${e.message}\n`);
  report.findings.create_booking = {
    exists: false,
    error: e.message
  };
}

// ============================================================
// SAVE REPORT
// ============================================================
const reportPath = `RUNTIME_REGRESSION_SIMPLE_${Date.now()}.json`;
await writeFile(reportPath, JSON.stringify(report, null, 2));

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  INVESTIGATION COMPLETE                                        ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

console.log(`📄 Report saved: ${reportPath}\n`);

// ============================================================
// SUMMARY & DIAGNOSIS
// ============================================================
console.log('SUMMARY & DIAGNOSIS:\n');

const issues = [];
const findings = [];

// Check services schema
if (!report.findings.services_schema?.has_is_active) {
  issues.push('❌ services table missing is_active column');
  console.log('\n🔍 ROOT CAUSE: services table missing is_active column');
  console.log('   The frontend queries services?is_active=eq.true');
  console.log('   But the live database does NOT have an is_active column\n');
  console.log('   FIX: Either add is_active column to database OR');
  console.log('        update frontend to use the correct column\n');
} else {
  findings.push('✅ services table has is_active column');
}

// Check query
if (!report.findings.is_active_query?.success) {
  issues.push('❌ Query for is_active=true fails');
} else {
  findings.push('✅ Query for is_active=true works');
}

// Check services exist
if (report.findings.all_services?.count > 0) {
  findings.push(`✅ Found ${report.findings.all_services.count} services`);
} else {
  issues.push('❌ No services found in database');
}

// Check booking function
if (report.findings.create_booking?.callable) {
  findings.push('✅ create_booking() function is callable');
} else if (report.findings.create_booking?.exists) {
  findings.push('⚠️  create_booking() exists but has validation issues');
} else {
  issues.push('❌ create_booking() function missing or broken');
}

findings.forEach(f => console.log(f));
console.log('');
issues.forEach(i => console.log(i));

console.log(`\n${issues.length} CRITICAL ISSUES FOUND\n`);

if (issues.length > 0) {
  console.log('NEXT STEPS:');
  console.log('1. Review the findings above');
  console.log('2. Fix database schema issues first');
  console.log('3. Then address frontend/repository contract issues\n');
}

process.exit(issues.length > 0 ? 1 : 0);
