import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://jczwilrysvnhcjzjztbi.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjendpbHJ5c3ZuaGNqemp6dGJpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Mzk0MTI1MCwiZXhwIjoyMDk5NTE3MjUwfQ.nj7YBr_EixrTdv5hqIzJVu3L7kFWVD15RJka4u7UgwM';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

console.log('\n=== BUSINESS SETTINGS API TRACE ===\n');

// Step 1: Direct database query
console.log('1. DIRECT DATABASE QUERY:');
const { data: rawData, error: rawError } = await supabase
  .from('business_settings')
  .select('*');

console.log('   Count:', rawData?.length ?? 0);
console.log('   Error:', rawError?.message ?? 'None');
console.log('   Data exists:', !!rawData?.[0]);
console.log('   First row ID:', rawData?.[0]?.id);
console.log('   business_name:', rawData?.[0]?.business_name);
console.log('');

// Step 2: Simulated repository response filter
console.log('2. REPOSITORY RESPONSE ALLOWLIST:');
const RESPONSE_ALLOWLISTS = {
  business_settings: ["id", "business_name", "email", "phone", "address", "google_maps_url", "whatsapp", "facebook", "instagram", "opening_hours", "logo_url", "favicon_url", "logo_media_id", "favicon_media_id", "timezone", "currency", "tagline", "description", "twitter", "youtube", "city", "country", "latitude", "longitude", "created_at", "updated_at"]
};

function filterResponse(table, row) {
  if (!row) return null;
  const allowlist = RESPONSE_ALLOWLISTS[table];
  if (!allowlist) return row;
  
  const result = {};
  for (const col of allowlist) {
    if (col in row) {
      result[col] = row[col];
    }
  }
  return result;
}

const filtered = rawData?.[0] ? filterResponse('business_settings', rawData[0]) : null;
console.log('   Filtered data exists:', !!filtered);
console.log('   Filtered business_name:', filtered?.business_name);
console.log('');

// Step 3: Simulated API response wrapper
console.log('3. API RESPONSE WRAPPER:');
const apiResponse = {
  data: rawData ? rawData.map(r => filterResponse('business_settings', r)) : [],
  pagination: {
    page: 1,
    limit: 10,
    total: rawData?.length ?? 0,
    totalPages: 1,
    hasNext: false,
    hasPrev: false
  }
};

console.log('   apiResponse.data length:', apiResponse.data.length);
console.log('   apiResponse.data[0] exists:', !!apiResponse.data[0]);
console.log('   apiResponse.data[0].business_name:', apiResponse.data[0]?.business_name);
console.log('');

// Step 4: Simulated api.list() extraction
console.log('4. API CLIENT api.list() EXTRACTION:');
const listResult = apiResponse.data || [];
console.log('   listResult length:', listResult.length);
console.log('   listResult[0] exists:', !!listResult[0]);
console.log('   listResult[0].business_name:', listResult[0]?.business_name);
console.log('');

// Step 5: UI extraction
console.log('5. UI EXTRACTION (settings.data?.[0]):');
const biz = listResult?.[0];
console.log('   biz exists:', !!biz);
console.log('   biz?.business_name:', biz?.business_name);
console.log('   !biz triggers EmptyState:', !biz);
console.log('');

// Step 6: Check if field names match what UI expects
console.log('6. FIELD NAME VERIFICATION:');
if (biz) {
  const expectedFields = [
    'business_name', 'description', 'phone', 'whatsapp', 
    'email', 'address', 'city', 'country', 
    'google_maps_url', 'latitude', 'longitude', 
    'currency', 'timezone'
  ];
  
  for (const field of expectedFields) {
    const exists = field in biz;
    const value = biz[field];
    console.log(`   ${field}: ${exists ? '✓' : '✗'} (${typeof value})`);
  }
}

console.log('\n=== VERDICT ===');
if (!biz) {
  console.log('🔴 FAILURE: biz is falsy, triggers "No business settings found"');
  console.log('   Root cause: Data flow broken somewhere in the chain');
} else {
  console.log('✅ SUCCESS: biz exists, should NOT show empty state');
  console.log('   If UI still shows empty state, issue is in:');
  console.log('   - Authentication/session');
  console.log('   - API route permissions');
  console.log('   - Network request failure');
}

console.log('\n');
