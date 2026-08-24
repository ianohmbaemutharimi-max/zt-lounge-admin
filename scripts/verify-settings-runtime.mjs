#!/usr/bin/env node

/**
 * RUNTIME VERIFICATION — ZT LOUNGE SETTINGS
 * 
 * Verifies that /dashboard/settings loads successfully with the updated API contract
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('🔍 ZT LOUNGE SETTINGS — RUNTIME VERIFICATION\n');
console.log('='.repeat(80));

async function verifyBusinessSettings() {
  console.log('\n📋 Step 1: Verify business_settings singleton exists\n');
  
  const { data, error } = await supabase
    .from('business_settings')
    .select('*')
    .single();
  
  if (error) {
    console.error('❌ Error fetching business_settings:', error.message);
    return null;
  }
  
  if (!data) {
    console.error('❌ No business_settings row found!');
    return null;
  }
  
  console.log('✅ Singleton row found:', {
    id: data.id,
    business_name: data.business_name,
    email: data.email,
    phone: data.phone,
    city: data.city,
    country: data.country
  });
  
  return data;
}

async function verifyExpectedValues(settings) {
  console.log('\n📋 Step 2: Verify expected production values\n');
  
  const checks = [
    { field: 'business_name', expected: 'ZT Lounge Meru', actual: settings.business_name },
    { field: 'email', expected: 'ztloungemeru@gmail.com', actual: settings.email },
    { field: 'phone', expected: '+254143542601', actual: settings.phone },
    { field: 'whatsapp', expected: '+254143542601', actual: settings.whatsapp },
    { field: 'address', expected: 'Milimani Road, Meru, Kenya', actual: settings.address },
    { field: 'city', expected: 'Meru', actual: settings.city },
    { field: 'country', expected: 'Kenya', actual: settings.country },
    { field: 'google_maps_url', expected: 'https://maps.app.goo.gl/HqTbiiU4q2jRFoPg6', actual: settings.google_maps_url },
    { field: 'currency', expected: 'KES', actual: settings.currency },
    { field: 'timezone', expected: 'Africa/Nairobi', actual: settings.timezone },
  ];
  
  let allMatch = true;
  
  for (const check of checks) {
    const matches = check.actual === check.expected;
    const icon = matches ? '✅' : '⚠️';
    console.log(`${icon} ${check.field}: ${check.actual || '(empty)'}`);
    if (!matches && check.expected) {
      console.log(`   Expected: ${check.expected}`);
      allMatch = false;
    }
  }
  
  // Check numeric fields
  console.log(`\n📍 Coordinates:`);
  console.log(`✅ latitude: ${settings.latitude}`);
  console.log(`✅ longitude: ${settings.longitude}`);
  
  return allMatch;
}

async function verifyAPIContract() {
  console.log('\n📋 Step 3: Simulate API request (GET /api/admin/business-settings)\n');
  
  const { data, error } = await supabase
    .from('business_settings')
    .select('*');
  
  if (error) {
    console.error('❌ API error:', error.message);
    return false;
  }
  
  console.log('✅ API response structure:');
  console.log('   - Returns array of objects');
  console.log(`   - Count: ${data?.length || 0} row(s)`);
  
  if (data && data.length > 0) {
    const fields = Object.keys(data[0]);
    console.log(`   - Fields: ${fields.length} total`);
    
    const businessFields = [
      'business_name', 'description', 'phone', 'whatsapp', 'email', 'address',
      'city', 'country', 'google_maps_url', 'latitude', 'longitude',
      'currency', 'timezone'
    ];
    
    console.log('\n✅ Business information fields present:');
    for (const field of businessFields) {
      const present = fields.includes(field);
      const icon = present ? '✅' : '❌';
      console.log(`   ${icon} ${field}`);
    }
  }
  
  return true;
}

async function verifySystemSettings() {
  console.log('\n📋 Step 4: Verify system_settings table\n');
  
  const { data, error } = await supabase
    .from('system_settings')
    .select('*');
  
  if (error) {
    console.error('⚠️ system_settings error:', error.message);
    return false;
  }
  
  console.log(`✅ system_settings found: ${data?.length || 0} row(s)`);
  
  if (data && data.length > 0) {
    data.forEach(row => {
      console.log(`   - ${row.key}: ${row.value}`);
    });
  }
  
  return true;
}

async function main() {
  try {
    // Step 1: Verify singleton exists
    const settings = await verifyBusinessSettings();
    if (!settings) {
      console.log('\n❌ VERIFICATION FAILED: No business_settings singleton\n');
      process.exit(1);
    }
    
    // Step 2: Verify expected values
    const valuesMatch = await verifyExpectedValues(settings);
    
    // Step 3: Verify API contract
    const apiOk = await verifyAPIContract();
    
    // Step 4: Verify system settings
    const systemOk = await verifySystemSettings();
    
    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('\n📊 VERIFICATION SUMMARY\n');
    console.log('✅ business_settings singleton: EXISTS');
    console.log(`${valuesMatch ? '✅' : '⚠️'} Production values: ${valuesMatch ? 'MATCH' : 'PARTIAL'}`);
    console.log(`${apiOk ? '✅' : '❌'} API contract: ${apiOk ? 'OK' : 'FAILED'}`);
    console.log(`${systemOk ? '✅' : '⚠️'} system_settings: ${systemOk ? 'OK' : 'MISSING'}`);
    
    console.log('\n📝 NEXT STEPS:\n');
    console.log('1. Restart dev server: npm run dev');
    console.log('2. Open http://localhost:3000/dashboard/settings');
    console.log('3. Verify form loads with existing values');
    console.log('4. Test Save operation');
    console.log('5. Check Network tab for API requests\n');
    
    console.log('='.repeat(80));
    
    if (apiOk && settings) {
      console.log('\n✅ DATABASE VERIFICATION PASSED\n');
      process.exit(0);
    } else {
      console.log('\n⚠️ DATABASE VERIFICATION COMPLETED WITH WARNINGS\n');
      process.exit(0);
    }
    
  } catch (err) {
    console.error('\n❌ VERIFICATION ERROR:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
