const { createClient } = require('@supabase/supabase-js');

const url = 'https://jczwilrysvnhcjzjztbi.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjendpbHJ5c3ZuaGNqemp6dGJpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Mzk0MTI1MCwiZXhwIjoyMDk5NTE3MjUwfQ.nj7YBr_EixrTdv5hqIzJVu3L7kFWVD15RJka4u7UgwM';

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