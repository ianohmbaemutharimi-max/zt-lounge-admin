// Verify CMS reads actual rows from live Supabase
// Uses anon key (public read) + service role (admin simulation)
const { createClient } = require('@supabase/supabase-js');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jczwilrysvnhcjzjztbi.supabase.co';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', url ? '✓' : '✗');
  console.error('   NEXT_PUBLIC_SUPABASE_ANON_KEY:', anonKey ? '✓' : '✗');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', serviceKey ? '✓' : '✗');
  process.exit(1);
}

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