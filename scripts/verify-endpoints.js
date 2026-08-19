const { createClient } = require('@supabase/supabase-js');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jczwilrysvnhcjzjztbi.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', url ? '✓' : '✗');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', serviceRoleKey ? '✓' : '✗');
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey);

async function test() {
  const resources = ['business-settings', 'website-pages', 'hero-slides'];
  const tableMap = { 'business-settings': 'business_settings', 'website-pages': 'website_pages', 'hero-slides': 'hero_slides' };

  for (const resource of resources) {
    const table = tableMap[resource];
    console.log(`\n=== ${resource} => ${table} ===`);
    
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      console.error('ERROR:', error.message);
    } else {
      console.log('OK, rows:', data?.length ?? 0);
      if (data && data[0]) {
        console.log('Sample keys:', Object.keys(data[0]).slice(0, 10).join(', '));
      }
    }
  }
}

test().catch(console.error);