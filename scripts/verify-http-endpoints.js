// Verify real HTTP endpoints authenticate via Supabase SSR session cookie
const { createClient } = require('@supabase/supabase-js');

const BASE = process.env.APP_URL || 'http://localhost:3100';
const PROJECT_REF = 'jczwilrysvnhcjzjztbi';
const url = `https://${PROJECT_REF}.supabase.co`;
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjendpbHJ5c3ZuaGNqemp6dGJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NDEyNTAsImV4cCI6MjA5OTUxNzI1MH0.TooU0gjA4VcKsGBF07O1hpiCvJgACLxvZY09bukpXhw';

async function test(route, cookieHeader) {
  const headers = cookieHeader ? { Cookie: cookieHeader } : {};
  try {
    const res = await fetch(`${BASE}/api/admin/${route}`, { headers, signal: AbortSignal.timeout(10000) });
    const body = await res.text();
    return { route, status: res.status, body: body.slice(0, 200) };
  } catch (e) {
    return { route, status: 'FETCH_ERROR', body: e.message };
  }
}

async function main() {
  console.log('=== HTTP ENDPOINT VERIFICATION (cookie session) ===\n');

  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({
    email: 'admin@salon.com',
    password: 'Password123!',
  });
  if (error || !data.session) {
    console.log('Login failed:', error?.message);
    return;
  }
  console.log('Login OK as admin@salon.com');

  const cookieName = `sb-${PROJECT_REF}-auth-token`;
  const cookieValue = encodeURIComponent(JSON.stringify([
    data.session.access_token,
    data.session.refresh_token,
    data.session.user,
    data.session.expires_in,
  ]));
  const cookieHeader = `${cookieName}=${cookieValue}`;

  const resources = ['business-settings', 'website-pages', 'hero-slides', 'gallery'];

  console.log('\n--- Unauthenticated (expect 401, NOT 500) ---');
  for (const r of resources) {
    const res = await test(r, null);
    console.log(`  /${r}: ${res.status}`);
  }

  console.log('\n--- Authenticated via session cookie (expect 200) ---');
  for (const r of resources) {
    const res = await test(r, cookieHeader);
    console.log(`  /${r}: ${res.status}`);
    if (res.status === 200) {
      console.log(`    body: ${res.body}`);
    }
  }
}

main().catch(console.error);