/**
 * Test different cookie formats to find what @supabase/ssr expects
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Load environment
const envContent = readFileSync('.env.local', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([A-Z_]+)=(.+)$/);
  if (match) env[match[1]] = match[2];
});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const BASE_URL = 'http://localhost:3000';
const projectRef = SUPABASE_URL.split('//')[1].split('.')[0];

const TEST_EMAIL = process.argv[2];
const TEST_PASSWORD = process.argv[3];

if (!TEST_EMAIL || !TEST_PASSWORD) {
  console.error('Usage: node test-cookie-format.mjs <email> <password>');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('Testing different cookie formats...\n');

// Login
const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
  email: TEST_EMAIL,
  password: TEST_PASSWORD,
});

if (authError || !authData.session) {
  console.error('❌ Login failed:', authError?.message);
  process.exit(1);
}

console.log('✅ Login successful\n');

// Test Format 1: Base64-encoded full session
console.log('═══ Format 1: Base64 Full Session ═══');
const format1 = Buffer.from(JSON.stringify(authData.session)).toString('base64');
let res = await fetch(`${BASE_URL}/api/auth/session`, {
  headers: { Cookie: `sb-${projectRef}-auth-token=${format1}` }
});
console.log(`Result: HTTP ${res.status}`);
if (res.ok) console.log('✅ SUCCESS!');
else console.log('❌ Failed\n');

// Test Format 2: Base64-encoded minimal session
console.log('═══ Format 2: Base64 Minimal Session ═══');
const minimal = {
  access_token: authData.session.access_token,
  refresh_token: authData.session.refresh_token,
  expires_at: authData.session.expires_at,
  expires_in: authData.session.expires_in,
  token_type: authData.session.token_type,
  user: authData.session.user,
};
const format2 = Buffer.from(JSON.stringify(minimal)).toString('base64');
res = await fetch(`${BASE_URL}/api/auth/session`, {
  headers: { Cookie: `sb-${projectRef}-auth-token=${format2}` }
});
console.log(`Result: HTTP ${res.status}`);
if (res.ok) console.log('✅ SUCCESS!');
else console.log('❌ Failed\n');

// Test Format 3: URL-encoded JSON
console.log('═══ Format 3: URL-encoded JSON ═══');
const format3 = encodeURIComponent(JSON.stringify(authData.session));
res = await fetch(`${BASE_URL}/api/auth/session`, {
  headers: { Cookie: `sb-${projectRef}-auth-token=${format3}` }
});
console.log(`Result: HTTP ${res.status}`);
if (res.ok) console.log('✅ SUCCESS!');
else console.log('❌ Failed\n');

// Test Format 4: Check what cookies the browser would have
console.log('═══ Format 4: Inspecting Actual Session Structure ═══');
console.log('Access Token (first 50 chars):', authData.session.access_token.substring(0, 50) + '...');
console.log('Refresh Token (first 50 chars):', authData.session.refresh_token.substring(0, 50) + '...');
console.log('Token Type:', authData.session.token_type);
console.log('Expires At:', authData.session.expires_at);
console.log('\nSession keys:', Object.keys(authData.session));
console.log('User keys:', Object.keys(authData.session.user));

// Test Format 5: Try using multiple cookies as chunked storage
console.log('\n═══ Format 5: Chunked Storage Approach ═══');
const sessionStr = JSON.stringify(authData.session);
const base64Full = Buffer.from(sessionStr).toString('base64');

// Split into chunks of 3800 chars (browser cookie limit is ~4096)
const chunkSize = 3800;
const chunks = [];
for (let i = 0; i < base64Full.length; i += chunkSize) {
  chunks.push(base64Full.substring(i, i + chunkSize));
}

console.log(`Session would need ${chunks.length} chunk(s)`);
if (chunks.length === 1) {
  // Single cookie
  res = await fetch(`${BASE_URL}/api/auth/session`, {
    headers: { Cookie: `sb-${projectRef}-auth-token=${chunks[0]}` }
  });
  console.log(`Result: HTTP ${res.status}`);
  if (res.ok) console.log('✅ SUCCESS!');
} else {
  // Multiple cookies
  const cookieHeader = chunks.map((chunk, i) => 
    `sb-${projectRef}-auth-token-${i}=${chunk}`
  ).join('; ') + `; sb-${projectRef}-auth-token=${chunks.length}`;
  
  res = await fetch(`${BASE_URL}/api/auth/session`, {
    headers: { Cookie: cookieHeader }
  });
  console.log(`Result: HTTP ${res.status}`);
  if (res.ok) console.log('✅ SUCCESS!');
}

await supabase.auth.signOut();
console.log('\n✅ Test complete');
