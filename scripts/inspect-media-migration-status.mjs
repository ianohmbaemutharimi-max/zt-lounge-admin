#!/usr/bin/env node

/**
 * ZT LOUNGE ADMIN — CANONICAL MEDIA ID MIGRATION STATUS INSPECTOR
 * 
 * READ-ONLY inspection of:
 * - Database schema state
 * - media_assets records
 * - CMS tables with images
 * - Existing media_id population
 * - Missing media_assets records
 * - Ambiguous matches
 * 
 * DOES NOT MODIFY DATABASE
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

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║   ZT LOUNGE — MEDIA MIGRATION STATUS INSPECTOR (READ-ONLY)   ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

const report = {
  timestamp: new Date().toISOString(),
  database_schema: {},
  media_assets: {},
  cms_tables: {},
  recommendations: []
};

// ============================================================
// STEP 1: Inspect database schema
// ============================================================
console.log('📋 STEP 1: Inspecting database schema...\n');

try {
  // Check if migrations are applied
  const { data: columns, error } = await supabase.rpc('exec_sql', {
    query: `
      SELECT 
        table_name,
        column_name,
        data_type,
        is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('menu_items', 'services', 'gallery', 'hero_slides', 'business_settings', 'media_assets')
        AND column_name IN ('media_id', 'logo_media_id', 'favicon_media_id', 'image_url', 'logo_url', 'favicon_url')
      ORDER BY table_name, column_name;
    `
  }).catch(() => ({
    // Fallback: direct query
    data: null,
    error: 'RPC not available - using direct query'
  }));

  if (error || !columns) {
    // Alternative: Query tables directly
    const tables = ['menu_items', 'services', 'gallery', 'hero_slides', 'business_settings'];
    
    for (const table of tables) {
      const { data: sample, error: sampleError } = await supabase
        .from(table)
        .select('*')
        .limit(1)
        .single();
      
      if (!sampleError && sample) {
        const cols = Object.keys(sample);
        report.database_schema[table] = {
          has_media_id: cols.includes('media_id'),
          has_logo_media_id: cols.includes('logo_media_id'),
          has_favicon_media_id: cols.includes('favicon_media_id'),
          has_image_url: cols.includes('image_url'),
          has_logo_url: cols.includes('logo_url'),
          has_favicon_url: cols.includes('favicon_url'),
          columns: cols
        };
      }
    }
  } else {
    // Process column info
    columns.forEach(col => {
      if (!report.database_schema[col.table_name]) {
        report.database_schema[col.table_name] = {};
      }
      report.database_schema[col.table_name][col.column_name] = {
        data_type: col.data_type,
        nullable: col.is_nullable === 'YES'
      };
    });
  }

  console.log('  ✓ Schema inspection complete');
  console.log(`  Tables checked: ${Object.keys(report.database_schema).length}`);
} catch (error) {
  console.error(`  ✗ Schema inspection error: ${error.message}`);
  report.recommendations.push(`Schema inspection failed: ${error.message}`);
}

// ============================================================
// STEP 2: Inspect media_assets
// ============================================================
console.log('\n📋 STEP 2: Inspecting media_assets table...\n');

try {
  const { data: assets, error, count } = await supabase
    .from('media_assets')
    .select('id, bucket, path, public_url, original_name, mime_type', { count: 'exact' });

  if (error) throw error;

  report.media_assets = {
    total_count: count || assets?.length || 0,
    assets: assets || [],
    by_bucket: {}
  };

  (assets || []).forEach(asset => {
    if (!report.media_assets.by_bucket[asset.bucket]) {
      report.media_assets.by_bucket[asset.bucket] = 0;
    }
    report.media_assets.by_bucket[asset.bucket]++;
  });

  console.log(`  ✓ Found ${report.media_assets.total_count} media assets`);
  console.log(`  Buckets: ${Object.keys(report.media_assets.by_bucket).join(', ')}`);
} catch (error) {
  console.error(`  ✗ Media assets inspection error: ${error.message}`);
  report.recommendations.push(`Media assets inspection failed: ${error.message}`);
}

// ============================================================
// STEP 3: Inspect CMS tables
// ============================================================
console.log('\n📋 STEP 3: Inspecting CMS tables...\n');

const cmsTables = [
  { name: 'menu_items', imageCol: 'image_url' },
  { name: 'services', imageCol: 'image_url' },
  { name: 'gallery', imageCol: 'image_url' },
  { name: 'hero_slides', imageCol: 'image_url' }
];

for (const table of cmsTables) {
  try {
    const { data: records, error, count } = await supabase
      .from(table.name)
      .select('id, media_id, ' + table.imageCol, { count: 'exact' });

    if (error) throw error;

    const withMediaId = records?.filter(r => r.media_id != null).length || 0;
    const withImageUrl = records?.filter(r => r[table.imageCol] != null).length || 0;
    const withBoth = records?.filter(r => r.media_id != null && r[table.imageCol] != null).length || 0;
    const withNeither = records?.filter(r => r.media_id == null && r[table.imageCol] == null).length || 0;

    report.cms_tables[table.name] = {
      total: count || records?.length || 0,
      with_media_id: withMediaId,
      with_image_url: withImageUrl,
      with_both: withBoth,
      with_neither: withNeither,
      migration_progress: count > 0 ? Math.round((withMediaId / count) * 100) : 0
    };

    console.log(`  ${table.name}:`);
    console.log(`    Total: ${report.cms_tables[table.name].total}`);
    console.log(`    With media_id: ${withMediaId}`);
    console.log(`    With image_url: ${withImageUrl}`);
    console.log(`    Migration progress: ${report.cms_tables[table.name].migration_progress}%`);
  } catch (error) {
    console.error(`  ✗ ${table.name} inspection error: ${error.message}`);
    report.cms_tables[table.name] = { error: error.message };
  }
}

// ============================================================
// STEP 4: Inspect business_settings
// ============================================================
console.log('\n📋 STEP 4: Inspecting business_settings...\n');

try {
  const { data: settings, error } = await supabase
    .from('business_settings')
    .select('logo_url, favicon_url, logo_media_id, favicon_media_id')
    .single();

  if (error) throw error;

  report.cms_tables.business_settings = {
    has_logo_url: !!settings?.logo_url,
    has_favicon_url: !!settings?.favicon_url,
    has_logo_media_id: !!settings?.logo_media_id,
    has_favicon_media_id: !!settings?.favicon_media_id
  };

  console.log(`  Logo: URL=${!!settings?.logo_url}, media_id=${!!settings?.logo_media_id}`);
  console.log(`  Favicon: URL=${!!settings?.favicon_url}, media_id=${!!settings?.favicon_media_id}`);
} catch (error) {
  console.error(`  ✗ business_settings inspection error: ${error.message}`);
  report.cms_tables.business_settings = { error: error.message };
}

// ============================================================
// STEP 5: Generate recommendations
// ============================================================
console.log('\n📋 STEP 5: Generating recommendations...\n');

// Check if migrations need to be applied
let migrationsNeeded = false;

if (!report.database_schema.menu_items?.media_id) {
  report.recommendations.push('⚠️  Migration 20260817_add_media_id_to_cms_tables.sql needs to be applied');
  migrationsNeeded = true;
}

if (!report.database_schema.business_settings?.logo_media_id) {
  report.recommendations.push('⚠️  Migration 20260819_add_brand_assets_media_id.sql needs to be applied');
  migrationsNeeded = true;
}

// Check migration progress
Object.entries(report.cms_tables).forEach(([table, stats]) => {
  if (stats.total > 0 && stats.migration_progress < 100) {
    report.recommendations.push(`📌 ${table}: ${stats.with_image_url - stats.with_media_id} records need media_id linking`);
  }
});

// ============================================================
// FINAL REPORT
// ============================================================
console.log('\n');
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║   INSPECTION COMPLETE                                        ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

console.log('📊 Summary:\n');
console.log(`  Media Assets: ${report.media_assets.total_count}`);
console.log(`  CMS Tables Inspected: ${Object.keys(report.cms_tables).length}`);

if (report.recommendations.length > 0) {
  console.log('\n📋 Recommendations:\n');
  report.recommendations.forEach(rec => console.log(`  ${rec}`));
} else {
  console.log('\n  ✅ No immediate actions required');
}

console.log(`\n📄 Full report saved to: MEDIA_MIGRATION_INSPECTION.json\n`);

// Save report
import { writeFileSync } from 'fs';
writeFileSync(
  join(ROOT, 'MEDIA_MIGRATION_INSPECTION.json'),
  JSON.stringify(report, null, 2),
  'utf-8'
);

process.exit(0);
