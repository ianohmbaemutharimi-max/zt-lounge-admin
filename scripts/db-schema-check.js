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

async function checkSchema() {
  // Check tables
  const { data: tables, error: tablesError } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public')
    .order('table_name');
  
  console.log('\n=== PUBLIC TABLES ===');
  if (tablesError) {
    console.error('Error fetching tables:', tablesError);
  } else {
    console.log(tables.map(t => t.table_name).join('\n'));
  }

  // Check columns for the three failing tables
  const targetTables = ['business_settings', 'website_pages', 'hero_slides'];
  
  for (const table of targetTables) {
    const { data: columns, error: colsError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type, is_nullable')
      .eq('table_schema', 'public')
      .eq('table_name', table)
      .order('ordinal_position');
    
    console.log(`\n=== COLUMNS FOR ${table} ===`);
    if (colsError) {
      console.error('Error:', colsError.message);
    } else if (columns && columns.length > 0) {
      columns.forEach(c => console.log(`${c.column_name} (${c.data_type}) ${c.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`));
    } else {
      console.log('TABLE NOT FOUND OR NO COLUMNS');
    }
  }

  // Test actual queries
  console.log('\n=== TEST QUERIES ===');
  
  const { data: bsData, error: bsError } = await supabase.from('business_settings').select('*').limit(1);
  console.log('business_settings:', bsError ? `ERROR: ${bsError.message}` : `OK (${bsData?.length || 0} rows)`);
  
  const { data: wpData, error: wpError } = await supabase.from('website_pages').select('*').limit(1);
  console.log('website_pages:', wpError ? `ERROR: ${wpError.message}` : `OK (${wpData?.length || 0} rows)`);
  
  const { data: hsData, error: hsError } = await supabase.from('hero_slides').select('*').limit(1);
  console.log('hero_slides:', hsError ? `ERROR: ${hsError.message}` : `OK (${hsData?.length || 0} rows)`);

  // Test with hyphens (what the code might be sending)
  console.log('\n=== TEST WITH HYPHENATED NAMES ===');
  const { data: bsData2, error: bsError2 } = await supabase.from('business-settings').select('*').limit(1);
  console.log('business-settings:', bsError2 ? `ERROR: ${bsError2.message}` : `OK`);
  
  const { data: wpData2, error: wpError2 } = await supabase.from('website-pages').select('*').limit(1);
  console.log('website-pages:', wpError2 ? `ERROR: ${wpError2.message}` : `OK`);
  
  const { data: hsData2, error: hsError2 } = await supabase.from('hero-slides').select('*').limit(1);
  console.log('hero-slides:', hsError2 ? `ERROR: ${hsError2.message}` : `OK`);
}

checkSchema().catch(console.error);