// Verify CMS reads actual rows from live Supabase
// Uses anon key (public read) + service role (admin simulation)
const { createClient } = require('@supabase/supabase-js');

const url = 'https://jczwilrysvnhcjzjztbi.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjendpbHJ5c3ZuaGNqemp6dGJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NDEyNTAsImV4cCI6MjA5OTUxNzI1MH0.TooU0gjA4VcKsGBF07O1hpiCvJgACLxvZY09bukpXhw';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjendpbHJ5c3ZuaGNqemp6dGJpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Mzk0MTI1MCwiZXhwIjoyMDk5NTE3MjUwfQ.nj7YBr_EixrTdv5hqIzJVu3L7kFWVD15RJka4u7UgwM';

const anon = createClient(url, anonKey);
const admin = createClient(url, serviceKey);

// Same mapping as RESOURCE_CONFIG
const tableMap = {
  'business-settings': 'business_settings',
  'website-pages': 'website_pages',
  'hero-slides': 'hero_slides',
  'gallery': 'gallery',
};

async function main() {
  console.log('=== LIVE SUPABASE CMS VERIFICATION ===\n');

  for (const [resource, table] of Object.entries(tableMap)) {
    console.log(`--- ${resource} -> ${table} ---`);

    // 1. Public read (anon key - what the public website uses)
    const pub = await anon.from(table).select('*').limit(3);
    console.log(`  anon read: ${pub.error ? 'ERROR ' + pub.error.message : pub.data.length + ' rows'}`);
    if (pub.data && pub.data[0]) {
      console.log(`  first row keys: ${Object.keys(pub.data[0]).slice(0, 8).join(', ')}`);
    }

    // 2. Admin read (service role - simulates authenticated admin)
    const adm = await admin.from(table).select('*').limit(3);
    console.log(`  admin read: ${adm.error ? 'ERROR ' + adm.error.message : adm.data.length + ' rows'}`);

    // 3. Row count
    const cnt = await admin.from(table).select('*', { count: 'exact', head: true });
    console.log(`  total rows: ${cnt.count}`);
    console.log('');
  }

  // 4. Verify table name resolution (hyphenated fails, underscore works)
  console.log('=== TABLE NAME RESOLUTION ===');
  const bad = await anon.from('business-settings').select('*').limit(1);
  console.log(`  hyphenated 'business-settings': ${bad.error ? 'FAILS (' + bad.error.code + ')' : 'WORKS'}`);
  const good = await anon.from('business_settings').select('*').limit(1);
  console.log(`  underscore 'business_settings': ${good.error ? 'FAILS' : 'WORKS'}`);
}

main().catch(console.error);