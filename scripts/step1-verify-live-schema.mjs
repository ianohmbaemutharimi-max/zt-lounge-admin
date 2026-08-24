#!/usr/bin/env node

/**
 * STEP 1 ONLY — LIVE SCHEMA VERIFICATION
 * 
 * Inspects the live database to verify the exact current state of media_id columns.
 * Does NOT modify anything.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

// Load environment variables
const envPath = join(ROOT, '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, ...values] = line.split('=');
  if (key && values.length) {
    env[key.trim()] = values.join('=').trim().replace(/^["']|["']$/g, '');
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║   STEP 1 — LIVE SCHEMA VERIFICATION (READ-ONLY)             ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

const results = {
  columns_found: [],
  columns_missing: [],
  foreign_keys: [],
  indexes: [],
  errors: []
};

// ============================================================
// Helper: Check if column exists by querying the table
// ============================================================
async function checkColumn(tableName, columnName) {
  try {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .limit(1)
      .maybeSingle();
    
    if (error) {
      console.log(`  ⚠️  ${tableName}.${columnName}: Cannot query table (${error.message})`);
      results.errors.push(`${tableName}.${columnName}: ${error.message}`);
      return false;
    }
    
    const exists = data && columnName in data;
    
    if (exists) {
      console.log(`  ✅ ${tableName}.${columnName}: EXISTS`);
      results.columns_found.push(`${tableName}.${columnName}`);
    } else {
      console.log(`  ❌ ${tableName}.${columnName}: MISSING`);
      results.columns_missing.push(`${tableName}.${columnName}`);
    }
    
    return exists;
  } catch (error) {
    console.log(`  ⚠️  ${tableName}.${columnName}: Error checking (${error.message})`);
    results.errors.push(`${tableName}.${columnName}: ${error.message}`);
    return false;
  }
}

// ============================================================
// Check CMS table columns
// ============================================================
console.log('📋 Verifying CMS table columns...\n');

await checkColumn('menu_items', 'media_id');
await checkColumn('services', 'media_id');
await checkColumn('gallery', 'media_id');
await checkColumn('hero_slides', 'media_id');

// ============================================================
// Check brand assets columns
// ============================================================
console.log('\n📋 Verifying brand assets columns...\n');

await checkColumn('business_settings', 'logo_media_id');
await checkColumn('business_settings', 'favicon_media_id');

// ============================================================
// Check existing data to understand current state
// ============================================================
console.log('\n📋 Checking current data state...\n');

try {
  const { data: menuItems, error: menuError } = await supabase
    .from('menu_items')
    .select('id, name, image_url, media_id')
    .limit(5);
  
  if (!menuError && menuItems) {
    const withMediaId = menuItems.filter(item => item.media_id).length;
    const withImageUrl = menuItems.filter(item => item.image_url).length;
    console.log(`  menu_items: ${menuItems.length} rows sampled`);
    console.log(`    • With media_id: ${withMediaId}`);
    console.log(`    • With image_url: ${withImageUrl}`);
  }
} catch (e) {
  console.log(`  ⚠️  Cannot sample menu_items: ${e.message}`);
}

try {
  const { data: services, error: servicesError } = await supabase
    .from('services')
    .select('id, name, image_url, media_id')
    .limit(5);
  
  if (!servicesError && services) {
    const withMediaId = services.filter(item => item.media_id).length;
    const withImageUrl = services.filter(item => item.image_url).length;
    console.log(`\n  services: ${services.length} rows sampled`);
    console.log(`    • With media_id: ${withMediaId}`);
    console.log(`    • With image_url: ${withImageUrl}`);
  }
} catch (e) {
  console.log(`  ⚠️  Cannot sample services: ${e.message}`);
}

try {
  const { data: gallery, error: galleryError } = await supabase
    .from('gallery')
    .select('id, title, image_url, media_id')
    .limit(5);
  
  if (!galleryError && gallery) {
    const withMediaId = gallery.filter(item => item.media_id).length;
    const withImageUrl = gallery.filter(item => item.image_url).length;
    console.log(`\n  gallery: ${gallery.length} rows sampled`);
    console.log(`    • With media_id: ${withMediaId}`);
    console.log(`    • With image_url: ${withImageUrl}`);
  }
} catch (e) {
  console.log(`  ⚠️  Cannot sample gallery: ${e.message}`);
}

try {
  const { data: heroSlides, error: heroError } = await supabase
    .from('hero_slides')
    .select('id, title, image_url, media_id')
    .limit(5);
  
  if (!heroError && heroSlides) {
    const withMediaId = heroSlides.filter(item => item.media_id).length;
    const withImageUrl = heroSlides.filter(item => item.image_url).length;
    console.log(`\n  hero_slides: ${heroSlides.length} rows sampled`);
    console.log(`    • With media_id: ${withMediaId}`);
    console.log(`    • With image_url: ${withImageUrl}`);
  }
} catch (e) {
  console.log(`  ⚠️  Cannot sample hero_slides: ${e.message}`);
}

try {
  const { data: settings, error: settingsError } = await supabase
    .from('business_settings')
    .select('*')
    .single();
  
  if (!settingsError && settings) {
    console.log(`\n  business_settings: 1 row`);
    console.log(`    • logo_url: ${settings.logo_url ? '✓' : '✗'}`);
    console.log(`    • logo_media_id: ${settings.logo_media_id ? '✓' : '✗'}`);
    console.log(`    • favicon_url: ${settings.favicon_url ? '✓' : '✗'}`);
    console.log(`    • favicon_media_id: ${settings.favicon_media_id ? '✓' : '✗'}`);
  }
} catch (e) {
  console.log(`  ⚠️  Cannot query business_settings: ${e.message}`);
}

// ============================================================
// Check media_assets table
// ============================================================
console.log('\n📋 Verifying media_assets table...\n');

try {
  const { count, error: countError } = await supabase
    .from('media_assets')
    .select('*', { count: 'exact', head: true });
  
  if (!countError) {
    console.log(`  ✅ media_assets table: ${count} assets`);
  } else {
    console.log(`  ❌ media_assets table: ${countError.message}`);
    results.errors.push(`media_assets: ${countError.message}`);
  }
} catch (e) {
  console.log(`  ❌ media_assets table: ${e.message}`);
  results.errors.push(`media_assets: ${e.message}`);
}

// ============================================================
// FINAL REPORT
// ============================================================
console.log('\n');
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║   STEP 1 VERIFICATION COMPLETE                               ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

console.log(`📊 Summary:\n`);

console.log(`  ✅ Columns found: ${results.columns_found.length}`);
results.columns_found.forEach(c => console.log(`    • ${c}`));

console.log(`\n  ❌ Columns missing: ${results.columns_missing.length}`);
results.columns_missing.forEach(c => console.log(`    • ${c}`));

if (results.errors.length > 0) {
  console.log(`\n  ⚠️  Errors encountered: ${results.errors.length}`);
  results.errors.forEach(e => console.error(`    • ${e}`));
}

console.log('\n');

// ============================================================
// Next steps recommendation
// ============================================================
if (results.columns_missing.length === 0) {
  console.log('✅ ALL REQUIRED COLUMNS EXIST');
  console.log('\nNext step: Proceed to mapping existing data to media_id columns\n');
  process.exit(0);
} else if (results.columns_missing.length === 2 && 
           results.columns_missing.includes('business_settings.logo_media_id') &&
           results.columns_missing.includes('business_settings.favicon_media_id')) {
  console.log('⚠️  BRAND ASSETS COLUMNS MISSING');
  console.log('\nNext step: Apply migration to add business_settings.logo_media_id and favicon_media_id\n');
  process.exit(1);
} else {
  console.log('⚠️  SCHEMA INCOMPLETE');
  console.log('\nNext step: Apply full schema migration\n');
  process.exit(1);
}
