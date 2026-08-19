// Inspect live Supabase schema for CMS tables
const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jczwilrysvnhcjzjztbi.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('❌ Missing required environment variables:');
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', url ? '✓' : '✗');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', key ? '✓' : '✗');
  process.exit(1);
}

const supabase = createClient(url, key);
const tables = ['business_settings', 'website_pages', 'hero_slides', 'gallery'];

async function main() {
  // Sample data from each table
  for (const t of tables) {
    console.log('\n=== ' + t + ': SAMPLE ===');
    const { data, error } = await supabase.from(t).select('*').limit(1);
    if (error) console.log('ERROR:', error.message);
    else console.log(JSON.stringify(data[0], null, 2));
  }

  // RLS status via pg_tables
  console.log('\n=== RLS ENABLED ===');
  for (const t of tables) {
    const { data: rls, error: rlsErr } = await supabase
      .from('pg_tables')
      .select('tablename, rowsecurity')
      .eq('schemaname', 'public')
      .eq('tablename', t);
    if (rlsErr) console.log(t + ': error ' + rlsErr.message);
    else console.log(t + ': ' + (rls && rls.length ? rls[0].rowsecurity : 'unknown'));
  }

  // RLS policies via pg_policies
  console.log('\n=== RLS POLICIES ===');
  for (const t of tables) {
    const { data: policies, error: polErr } = await supabase
      .from('pg_policies')
      .select('policyname, cmd, qual, with_check, roles')
      .eq('schemaname', 'public')
      .eq('tablename', t);
    if (polErr) {
      console.log(t + ': error ' + polErr.message);
      continue;
    }
    console.log('\n' + t + ': ' + policies.length + ' policies');
    policies.forEach((p) => {
      console.log('  - ' + p.policyname + ' | cmd: ' + p.cmd + ' | roles: ' + JSON.stringify(p.roles));
      console.log('    using: ' + p.qual);
      console.log('    check: ' + p.with_check);
    });
  }

  // Count rows
  console.log('\n=== ROW COUNTS ===');
  for (const t of tables) {
    const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
    if (error) console.log(t + ': ERROR ' + error.message);
    else console.log(t + ': ' + count + ' rows');
  }
}

main().catch(console.error);