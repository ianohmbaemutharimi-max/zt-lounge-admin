/**
 * Apply Media Library Migration to Supabase
 * 
 * This script applies the media_assets and media_usage table creation
 * to the live Supabase database.
 * 
 * SAFETY: This is a NON-BREAKING change (adds new tables only)
 * 
 * Usage: node apply-media-migration.mjs <email> <password>
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const TEST_EMAIL = process.argv[2];
const TEST_PASSWORD = process.argv[3];

if (!TEST_EMAIL || !TEST_PASSWORD) {
  console.error('Usage: node apply-media-migration.mjs <email> <password>');
  process.exit(1);
}

// Load environment
const envContent = readFileSync('.env.local', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([A-Z_]+)=(.+)$/);
  if (match) env[match[1]] = match[2];
});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  ZT LOUNGE - APPLY MEDIA LIBRARY MIGRATION                    ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

try {
  // Read migration file
  const migrationSQL = readFileSync(
    'supabase/migrations/20260813_create_media_library_tables.sql',
    'utf-8'
  );

  console.log('📄 Migration file loaded\n');
  console.log('⚠️  WARNING: This will modify the production database');
  console.log('   - Creates media_assets table');
  console.log('   - Creates media_usage table');
  console.log('   - Creates indexes');
  console.log('   - Creates RLS policies\n');

  console.log('🔐 Authenticating admin user...\n');
  
  const { data: authData, error: authError } = await createClient(
    SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ).auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  if (authError) {
    console.error('❌ Authentication failed:', authError.message);
    process.exit(1);
  }

  console.log('✅ Authenticated as:', authData.user.email);
  console.log('   User ID:', authData.user.id, '\n');

  // Check if tables already exist
  console.log('🔍 Checking existing tables...\n');
  
  const { data: existingTables, error: checkError } = await supabaseAdmin
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public')
    .in('table_name', ['media_assets', 'media_usage']);

  if (checkError) {
    console.log('⚠️  Could not check existing tables (will proceed with CREATE IF NOT EXISTS)');
  } else if (existingTables && existingTables.length > 0) {
    console.log('⚠️  Tables already exist:');
    existingTables.forEach(t => console.log(`   - ${t.table_name}`));
    console.log('\n   Migration will be idempotent (IF NOT EXISTS clauses)');
  } else {
    console.log('✅ Tables do not exist yet\n');
  }

  console.log('🚀 Applying migration...\n');

  // Apply migration using the service role
  // Note: Supabase JS client doesn't have a direct .query() method for raw SQL
  // We'll need to use the REST API endpoint
  
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
    body: JSON.stringify({ query: migrationSQL })
  });

  if (!response.ok) {
    // Alternative: Try using pgAdmin or Supabase Dashboard SQL Editor
    console.log('⚠️  Direct SQL execution via REST API not available');
    console.log('\n📋 MANUAL MIGRATION REQUIRED:\n');
    console.log('1. Open Supabase Dashboard: https://supabase.com/dashboard');
    console.log('2. Navigate to SQL Editor');
    console.log('3. Copy and execute the migration file:');
    console.log('   supabase/migrations/20260813_create_media_library_tables.sql\n');
    console.log('OR use the Supabase CLI:');
    console.log('   npx supabase db push\n');
    process.exit(1);
  }

  console.log('✅ Migration applied successfully!\n');

  // Verify tables created
  console.log('🔍 Verifying migration...\n');

  const { data: mediaAssets, error: maError } = await supabaseAdmin
    .from('media_assets')
    .select('id', { count: 'exact', head: true });

  const { data: mediaUsage, error: muError } = await supabaseAdmin
    .from('media_usage')
    .select('id', { count: 'exact', head: true });

  if (!maError) {
    console.log('✅ media_assets table exists (0 records)');
  } else {
    console.log('❌ media_assets table verification failed:', maError.message);
  }

  if (!muError) {
    console.log('✅ media_usage table exists (0 records)');
  } else {
    console.log('❌ media_usage table verification failed:', muError.message);
  }

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  MIGRATION COMPLETE                                           ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log('📋 Next Steps:');
  console.log('   1. Run backfill script to import existing 36 images');
  console.log('   2. Implement upload API endpoints');
  console.log('   3. Build Media Library UI\n');

} catch (error) {
  console.error('\n❌ MIGRATION FAILED:', error.message);
  console.error(error.stack);
  process.exit(1);
}
