/**
 * Direct database verification - bypasses PostgREST to check actual Postgres state
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const TEST_EMAIL = process.argv[2];
const TEST_PASSWORD = process.argv[3];

if (!TEST_EMAIL || !TEST_PASSWORD) {
  console.error('Usage: node direct-db-check.mjs <email> <password>');
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

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║  DIRECT DATABASE STATE CHECK                            ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

async function checkDatabase() {
  try {
    // Check media_assets
    console.log('📊 Checking media_assets...');
    const { data: assetsData, error: assetsError, count: assetsCount } = await supabaseAdmin
      .from('media_assets')
      .select('*', { count: 'exact' });

    if (assetsError) {
      console.log('❌ Error:', assetsError.message);
      console.log('   Code:', assetsError.code);
      console.log('   Details:', assetsError.details);
    } else {
      console.log('✅ media_assets accessible');
      console.log('   Count:', assetsCount);
      if (assetsCount > 0) {
        console.log('   Sample:', assetsData[0]);
      }
    }
    console.log();

    // Check media_usage
    console.log('📊 Checking media_usage...');
    const { data: usageData, error: usageError, count: usageCount } = await supabaseAdmin
      .from('media_usage')
      .select('*', { count: 'exact' });

    if (usageError) {
      console.log('❌ Error:', usageError.message);
      console.log('   Code:', usageError.code);
      console.log('   Details:', usageError.details);
    } else {
      console.log('✅ media_usage accessible');
      console.log('   Count:', usageCount);
      if (usageCount > 0) {
        console.log('   Sample:', usageData[0]);
      }
    }
    console.log();

    // Test INSERT capability
    console.log('🧪 Testing INSERT capability...');
    const testRecord = {
      bucket: 'test-direct-check',
      storage_path: `test-${Date.now()}.webp`,
      public_url: `https://test.example.com/test-${Date.now()}.webp`,
      filename: `test-${Date.now()}.webp`,
      mime_type: 'image/webp',
      file_size: 1024,
      category: 'test',
      uploaded_by: '0c03fc39-c8ff-4906-a1ab-9b6cb9313539'
    };

    const { data: insertData, error: insertError } = await supabaseAdmin
      .from('media_assets')
      .insert(testRecord)
      .select()
      .single();

    if (insertError) {
      console.log('❌ INSERT failed:', insertError.message);
      console.log('   Code:', insertError.code);
      if (insertError.message.includes('schema cache')) {
        console.log('\n⚠️  PostgREST SCHEMA CACHE NOT REFRESHED');
        console.log('   Tables exist in database but PostgREST cannot see them');
        console.log('   Manual action required: Reload schema in Supabase Dashboard');
      }
    } else {
      console.log('✅ INSERT successful!');
      console.log('   Record ID:', insertData.id);
      
      // Clean up
      await supabaseAdmin
        .from('media_assets')
        .delete()
        .eq('id', insertData.id);
      console.log('   Test record cleaned up');
    }
    console.log();

    // Check existing content tables
    console.log('📋 Checking content tables...');
    const contentChecks = [
      { table: 'menu_items', column: 'image_url' },
      { table: 'services', column: 'image_url' },
      { table: 'gallery', column: 'image_url' },
      { table: 'hero_slides', column: 'image_url' },
    ];

    for (const { table, column } of contentChecks) {
      const { data, error } = await supabaseAdmin
        .from(table)
        .select(column);
      
      if (!error) {
        const withImages = data.filter(r => r[column]).length;
        console.log(`   ${table}.${column}: ${withImages} records`);
      }
    }

    const { data: settings } = await supabaseAdmin
      .from('business_settings')
      .select('logo_url, favicon_url')
      .single();
    
    if (settings) {
      console.log(`   business_settings.logo_url: ${settings.logo_url ? '1' : '0'} record`);
      console.log(`   business_settings.favicon_url: ${settings.favicon_url ? '1' : '0'} record`);
    }

  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

checkDatabase();
