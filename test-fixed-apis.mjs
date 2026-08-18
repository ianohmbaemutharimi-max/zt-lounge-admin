import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const BASE_URL = 'http://localhost:3000';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function getAdminUser() {
  // Get the test admin user - assuming there's one in your test data
  const { data: users, error } = await supabase
    .from('profiles')
    .select('id, email, role')
    .eq('role', 'admin')
    .limit(1);
  
  if (error || !users || users.length === 0) {
    console.error('Failed to find admin user:', error);
    return null;
  }
  
  return users[0];
}

async function getAuthToken(userId) {
  // Create a session token for the admin user
  const { data, error } = await supabase.auth.admin.createUser({
    email: `test-admin-${Date.now()}@test.com`,
    password: 'TestPassword123!',
    email_confirm: true,
    user_metadata: { role: 'admin' }
  });
  
  if (error) {
    console.log('Creating new test user...');
    // Try signing in with existing test user
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: 'admin@example.com',
      password: 'password123'
    });
    
    if (signInError) {
      console.error('Failed to get auth token:', signInError);
      return null;
    }
    
    return signInData.session?.access_token;
  }
  
  return data?.user?.id;
}

async function testAPI(method, endpoint, token) {
  try {
    const url = `${BASE_URL}${endpoint}`;
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      }
    };
    
    console.log(`\n📡 ${method} ${endpoint}`);
    const response = await fetch(url, options);
    const status = response.status;
    const text = await response.text();
    let body;
    
    try {
      body = text ? JSON.parse(text) : null;
    } catch (e) {
      body = text;
    }
    
    console.log(`   Status: ${status}`);
    console.log(`   Response: ${JSON.stringify(body).substring(0, 200)}`);
    
    return { status, body };
  } catch (error) {
    console.error(`   Error: ${error.message}`);
    return { status: 0, body: null, error: error.message };
  }
}

async function main() {
  console.log('🧪 Testing ZT Lounge APIs\n');
  console.log('='.repeat(50));
  
  // First test without auth (should return 401)
  console.log('\n🔒 Testing WITHOUT authentication (expecting 401):');
  await testAPI('GET', '/api/admin/menu-items');
  await testAPI('GET', '/api/admin/hero-slides');
  
  // Now get a token
  console.log('\n\n🔑 Getting authentication token...');
  let token = null;
  
  // Try to get existing session
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    token = session.access_token;
    console.log('✅ Using existing session');
  } else {
    console.log('⚠️  No existing session, using anonymous key for API testing');
    // For now, we'll test with the ANON_KEY as Authorization header
    token = SUPABASE_ANON_KEY;
  }
  
  // Test WITH auth (should return 200)
  console.log('\n🔓 Testing WITH authentication (expecting 200):');
  await testAPI('GET', '/api/admin/menu-items', token);
  await testAPI('GET', '/api/admin/hero-slides', token);
  
  // Test related endpoints
  console.log('\n📊 Testing related endpoints:');
  await testAPI('GET', '/api/admin/menu-categories', token);
  await testAPI('GET', '/api/admin/website-pages', token);
  await testAPI('GET', '/api/admin/business-settings', token);
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ Test complete\n');
}

main().catch(console.error);
