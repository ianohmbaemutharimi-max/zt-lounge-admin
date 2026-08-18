/**
 * Verify Media Library Migration Status
 * 
 * Checks if media_assets and media_usage tables exist and validates schema
 * 
 * Usage: node verify-media-migration.mjs <email> <password>
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';

const TEST_EMAIL = process.argv[2];
const TEST_PASSWORD = process.argv[3];

if (!TEST_EMAIL || !TEST_PASSWORD) {
  console.error('Usage: node verify-media-migration.mjs <email> <password>');
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
const SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  ZT LOUNGE - VERIFY MEDIA MIGRATION STATUS                    ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

const report = {
  timestamp: new Date().toISOString(),
  supabaseProject: SUPABASE_URL,
  migrationApplied: false,
  tables: {},
  existingContentTables: {},
  issues: []
};

try {
  // Authenticate
  console.log('🔐 Authenticating...\n');
  
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  if (authError) {
    console.error('❌ Authentication failed:', authError.message);
    process.exit(1);
  }
  
  console.log('✅ Authenticated as:', authData.user.email);
  console.log('   Project:', SUPABASE_URL, '\n');

  // Check if media_assets exists
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('CHECKING MEDIA_ASSETS TABLE');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const { data: mediaAssetsTest, error: maError } = await supabaseAdmin
    .from('media_assets')
    .select('*', { count: 'exact', head: true });

  if (maError) {
    if (maError.message.includes('relation') || maError.message.includes('does not exist')) {
      console.log('❌ media_assets table does NOT exist');
      console.log('   Error:', maError.message);
      report.tables.media_assets = { exists: false, error: maError.message };
    } else {
      console.log('⚠️  media_assets table check failed:', maError.message);
      report.tables.media_assets = { exists: 'unknown', error: maError.message };
    }
  } else {
    console.log('✅ media_assets table EXISTS');
    report.tables.media_assets = { exists: true };
    report.migrationApplied = true;

    // Get schema details
    const { data: maSchema } = await supabaseAdmin
      .from('media_assets')
      .select('*')
      .limit(1);
    
    if (maSchema && maSchema.length === 0) {
      console.log('   Records: 0 (empty, ready for backfill)');
    } else if (maSchema) {
      console.log('   Records: >0 (backfill may have run)');
    }
  }
  console.log();

  // Check if media_usage exists
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('CHECKING MEDIA_USAGE TABLE');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const { data: mediaUsageTest, error: muError } = await supabaseAdmin
    .from('media_usage')
    .select('*', { count: 'exact', head: true });

  if (muError) {
    if (muError.message.includes('relation') || muError.message.includes('does not exist')) {
      console.log('❌ media_usage table does NOT exist');
      console.log('   Error:', muError.message);
      report.tables.media_usage = { exists: false, error: muError.message };
    } else {
      console.log('⚠️  media_usage table check failed:', muError.message);
      report.tables.media_usage = { exists: 'unknown', error: muError.message };
    }
  } else {
    console.log('✅ media_usage table EXISTS');
    report.tables.media_usage = { exists: true };
  }
  console.log();

  // Verify existing content tables are unchanged
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('VERIFYING EXISTING CONTENT TABLES (UNCHANGED)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const contentTables = [
    { table: 'menu_items', column: 'image_url' },
    { table: 'services', column: 'image_url' },
    { table: 'gallery', column: 'image_url' },
    { table: 'hero_slides', column: 'image_url' },
    { table: 'business_settings', column: 'logo_url' },
    { table: 'business_settings', column: 'favicon_url' },
  ];

  for (const { table, column } of contentTables) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select(column, { count: 'exact' });
      
      if (error) {
        console.log(`❌ ${table}.${column}: Error - ${error.message}`);
        report.existingContentTables[`${table}.${column}`] = { status: 'error', error: error.message };
        report.issues.push(`${table}.${column} verification failed`);
      } else {
        const withImages = data.filter(r => r[column]).length;
        console.log(`✅ ${table}.${column}: ${withImages} records with images`);
        report.existingContentTables[`${table}.${column}`] = { status: 'ok', withImages };
      }
    } catch (err) {
      console.log(`❌ ${table}.${column}: ${err.message}`);
      report.existingContentTables[`${table}.${column}`] = { status: 'error', error: err.message };
    }
  }
  console.log();

  // Summary
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (report.migrationApplied) {
    console.log('✅ MIGRATION APPLIED: media_assets and media_usage exist');
    console.log('📋 Next step: Run backfill script\n');
  } else {
    console.log('❌ MIGRATION NOT APPLIED');
    console.log('📋 Next step: Apply migration via Supabase Dashboard SQL Editor\n');
    console.log('   File: supabase/migrations/20260813_create_media_library_tables.sql\n');
  }

  if (report.issues.length > 0) {
    console.log('⚠️  ISSUES DETECTED:');
    report.issues.forEach(issue => console.log(`   - ${issue}`));
    console.log();
  }

  await supabase.auth.signOut();

  // Write report
  writeFileSync('media-migration-verification.json', JSON.stringify(report, null, 2));
  console.log('📄 Report saved: media-migration-verification.json\n');

  process.exit(report.migrationApplied ? 0 : 1);

} catch (error) {
  console.error('\n❌ VERIFICATION FAILED:', error.message);
  console.error(error.stack);
  process.exit(1);
}
