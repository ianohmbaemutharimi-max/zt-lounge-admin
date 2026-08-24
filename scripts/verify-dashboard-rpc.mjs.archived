#!/usr/bin/env node

/**
 * ZT LOUNGE ADMIN — VERIFY DASHBOARD STATS RPC
 * 
 * Checks if get_dashboard_stats() function exists and works correctly
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase configuration');
  process.exit(1);
}

if (!adminEmail || !adminPassword) {
  console.error('❌ Missing admin credentials (ADMIN_EMAIL, ADMIN_PASSWORD)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

console.log('🔍 ZT LOUNGE ADMIN — DASHBOARD RPC VERIFICATION\n');
console.log('=' .repeat(70));

async function verifyDashboardRPC() {
  const results = {
    authSuccess: false,
    rpcExists: false,
    rpcExecutes: false,
    dataValid: false,
    performanceMeasured: false,
    latencyMs: null,
    responseData: null,
    error: null
  };

  try {
    // Step 1: Authenticate
    console.log('\n1️⃣  Authenticating as admin...');
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: adminEmail,
      password: adminPassword
    });

    if (authError) {
      results.error = `Auth failed: ${authError.message}`;
      console.error(`❌ ${results.error}`);
      return results;
    }

    console.log('✅ Authenticated successfully');
    results.authSuccess = true;

    // Step 2: Check if RPC exists and execute it
    console.log('\n2️⃣  Calling get_dashboard_stats() RPC...');
    
    const startTime = Date.now();
    const { data, error } = await supabase.rpc('get_dashboard_stats');
    const endTime = Date.now();
    const latency = endTime - startTime;

    results.latencyMs = latency;
    results.performanceMeasured = true;

    if (error) {
      // Check if error indicates function doesn't exist
      if (error.message.includes('function') && error.message.includes('does not exist')) {
        results.error = 'RPC function does not exist';
        console.error('❌ RPC function get_dashboard_stats() DOES NOT EXIST');
        console.error(`   Error: ${error.message}`);
        console.error('\n⚠️  MIGRATION NEEDS TO BE APPLIED');
        return results;
      }
      
      results.error = `RPC execution failed: ${error.message}`;
      console.error(`❌ ${results.error}`);
      return results;
    }

    console.log(`✅ RPC executed successfully (${latency}ms)`);
    results.rpcExists = true;
    results.rpcExecutes = true;
    results.responseData = data;

    // Step 3: Validate response structure
    console.log('\n3️⃣  Validating response structure...');
    
    const expectedFields = [
      'totalBookings',
      'pendingBookings',
      'confirmedBookings',
      'completedBookings',
      'cancelledBookings',
      'todayBookings',
      'totalCustomers',
      'activeCustomers',
      'totalMenuItems',
      'availableMenuItems',
      'totalServices',
      'activeServices',
      'totalGalleryItems',
      'totalTestimonials',
      'approvedTestimonials',
      'unreadNotifications',
      'totalRevenue',
      'monthRevenue',
      'todayRevenue'
    ];

    const missingFields = [];
    for (const field of expectedFields) {
      if (!(field in data)) {
        missingFields.push(field);
      }
    }

    if (missingFields.length > 0) {
      results.error = `Missing fields: ${missingFields.join(', ')}`;
      console.error(`❌ ${results.error}`);
      return results;
    }

    console.log('✅ All expected fields present');
    results.dataValid = true;

    // Step 4: Display results
    console.log('\n4️⃣  Dashboard Stats Summary:');
    console.log('   ┌─────────────────────────────────────────┐');
    console.log(`   │ Total Bookings:         ${String(data.totalBookings).padStart(14)} │`);
    console.log(`   │ Total Customers:        ${String(data.totalCustomers).padStart(14)} │`);
    console.log(`   │ Total Menu Items:       ${String(data.totalMenuItems).padStart(14)} │`);
    console.log(`   │ Total Services:         ${String(data.totalServices).padStart(14)} │`);
    console.log(`   │ Total Gallery Items:    ${String(data.totalGalleryItems).padStart(14)} │`);
    console.log(`   │ Total Testimonials:     ${String(data.totalTestimonials).padStart(14)} │`);
    console.log(`   │ Unread Notifications:   ${String(data.unreadNotifications).padStart(14)} │`);
    console.log(`   │ Total Revenue:          ${String(data.totalRevenue).padStart(14)} │`);
    console.log('   └─────────────────────────────────────────┘');

    // Performance assessment
    console.log('\n5️⃣  Performance Assessment:');
    if (latency < 100) {
      console.log(`   ✅ EXCELLENT: ${latency}ms (target: <100ms)`);
    } else if (latency < 250) {
      console.log(`   ✅ GOOD: ${latency}ms (target: <100ms)`);
    } else if (latency < 500) {
      console.log(`   ⚠️  ACCEPTABLE: ${latency}ms (consider optimization)`);
    } else {
      console.log(`   ❌ SLOW: ${latency}ms (needs optimization)`);
    }

    return results;

  } catch (err) {
    results.error = err.message;
    console.error(`\n❌ Unexpected error: ${err.message}`);
    return results;
  } finally {
    // Cleanup
    await supabase.auth.signOut();
  }
}

// Run verification
const results = await verifyDashboardRPC();

console.log('\n' + '='.repeat(70));
console.log('\n📊 VERIFICATION RESULTS:\n');
console.log(`   Authentication:     ${results.authSuccess ? '✅ PASS' : '❌ FAIL'}`);
console.log(`   RPC Exists:         ${results.rpcExists ? '✅ YES' : '❌ NO'}`);
console.log(`   RPC Executes:       ${results.rpcExecutes ? '✅ PASS' : '❌ FAIL'}`);
console.log(`   Data Valid:         ${results.dataValid ? '✅ PASS' : '❌ FAIL'}`);
console.log(`   Performance:        ${results.performanceMeasured ? `✅ ${results.latencyMs}ms` : '❌ NOT MEASURED'}`);

if (results.error) {
  console.log(`\n   Error: ${results.error}`);
}

console.log('\n' + '='.repeat(70));

// Exit with appropriate code
if (results.rpcExists && results.rpcExecutes && results.dataValid) {
  console.log('\n✅ DASHBOARD RPC VERIFICATION: PASS\n');
  process.exit(0);
} else if (!results.rpcExists) {
  console.log('\n⚠️  DASHBOARD RPC VERIFICATION: MIGRATION REQUIRED\n');
  process.exit(2); // Special exit code for "migration needed"
} else {
  console.log('\n❌ DASHBOARD RPC VERIFICATION: FAIL\n');
  process.exit(1);
}
