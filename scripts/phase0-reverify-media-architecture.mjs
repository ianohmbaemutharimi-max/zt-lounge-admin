#!/usr/bin/env node
/**
 * PHASE 0 RE-VERIFICATION — Canonical Media ID Architecture
 * 
 * DO NOT TRUST PREVIOUS AUDIT BLINDLY.
 * 
 * Inspect actual production state:
 * - Database schema
 * - Existing data
 * - Code paths
 * - Media resolver
 * - Admin CMS
 * - Public website (if accessible)
 * 
 * Report contradictions before making destructive changes.
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

// Load environment variables from .env.local
config({ path: join(ROOT, '.env.local') });

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing required environment variables:');
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅' : '❌');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅' : '❌');
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log(`
═══════════════════════════════════════════════════════════
  ZT LOUNGE — PHASE 0 RE-VERIFICATION
  CANONICAL MEDIA ID ARCHITECTURE
═══════════════════════════════════════════════════════════
`);

const report = {
  timestamp: new Date().toISOString(),
  database: {},
  codebase: {},
  contradictions: [],
  verification_table: []
};

// ============================================================
// 1. VERIFY DATABASE SCHEMA
// ============================================================

console.log('📋 [1/13] Verifying Database Schema...\n');

async function verifySchema() {
  const tables = [
    'media_assets',
    'business_settings',
    'menu_items',
    'services',
    'gallery_items',
    'hero_slides',
    'testimonials'
  ];

  for (const table of tables) {
    console.log(`   Checking ${table}...`);
    
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(1);

      if (error) {
        report.database[table] = { exists: false, error: error.message };
        console.log(`   ❌ ${table}: ${error.message}`);
      } else {
        const sample = data?.[0] || null;
        const columns = sample ? Object.keys(sample) : [];
        
        report.database[table] = {
          exists: true,
          has_media_id: columns.includes('media_id'),
          has_image_url: columns.includes('image_url'),
          has_logo_url: columns.includes('logo_url'),
          has_favicon_url: columns.includes('favicon_url'),
          has_logo_media_id: columns.includes('logo_media_id'),
          has_favicon_media_id: columns.includes('favicon_media_id'),
          sample_columns: columns,
          sample_data: sample
        };

        console.log(`   ✅ ${table}: exists`);
        if (columns.includes('media_id')) console.log(`      ✅ has media_id`);
        if (columns.includes('image_url')) console.log(`      ⚠️  has legacy image_url`);
      }
    } catch (err) {
      report.database[table] = { exists: false, error: err.message };
      console.log(`   ❌ ${table}: ${err.message}`);
    }
  }
}

await verifySchema();

// ============================================================
// 2. VERIFY DATA STATE
// ============================================================

console.log('\n📋 [2/13] Verifying Data State...\n');

async function verifyDataState() {
  // Check media_assets
  const { data: mediaAssets, error: mediaError } = await supabase
    .from('media_assets')
    .select('id, bucket, path, public_url, title')
    .limit(5);

  report.database.media_assets_count = mediaAssets?.length || 0;
  report.database.media_assets_samples = mediaAssets || [];
  
  console.log(`   media_assets: ${mediaAssets?.length || 0} sample records`);

  // Check business_settings
  const { data: biz, error: bizError } = await supabase
    .from('business_settings')
    .select('id, logo_url, favicon_url, logo_media_id, favicon_media_id')
    .single();

  report.database.business_settings = biz || null;
  
  if (biz) {
    console.log(`   business_settings:`);
    console.log(`      logo_url: ${biz.logo_url || 'NULL'}`);
    console.log(`      favicon_url: ${biz.favicon_url || 'NULL'}`);
    console.log(`      logo_media_id: ${biz.logo_media_id || 'NULL'}`);
    console.log(`      favicon_media_id: ${biz.favicon_media_id || 'NULL'}`);
  }

  // Check CMS tables
  const cmsTables = ['menu_items', 'services', 'hero_slides'];
  
  for (const table of cmsTables) {
    const { data, error } = await supabase
      .from(table)
      .select('id, media_id, image_url')
      .limit(5);

    if (data) {
      const withMediaId = data.filter(r => r.media_id).length;
      const withImageUrl = data.filter(r => r.image_url).length;
      const withNeither = data.filter(r => !r.media_id && !r.image_url).length;

      report.database[`${table}_data_state`] = {
        total_sample: data.length,
        with_media_id: withMediaId,
        with_image_url: withImageUrl,
        with_neither: withNeither
      };

      console.log(`   ${table}:`);
      console.log(`      with media_id: ${withMediaId}/${data.length}`);
      console.log(`      with image_url: ${withImageUrl}/${data.length}`);
      if (withNeither > 0) console.log(`      ⚠️  with neither: ${withNeither}`);
    }
  }

  // Check testimonials (should NOT have media_id)
  const { data: testimonials } = await supabase
    .from('testimonials')
    .select('*')
    .limit(1);

  if (testimonials && testimonials[0]) {
    const columns = Object.keys(testimonials[0]);
    const hasMediaId = columns.includes('media_id');
    
    report.database.testimonials_boundary = {
      has_media_id: hasMediaId,
      correct: !hasMediaId
    };

    if (hasMediaId) {
      console.log(`   ❌ CONTRADICTION: testimonials has media_id (should NOT)`);
      report.contradictions.push('testimonials table has media_id column');
    } else {
      console.log(`   ✅ testimonials: correctly NO media_id`);
    }
  }
}

await verifyDataState();

// ============================================================
// 3. VERIFY RESOLVER
// ============================================================

console.log('\n📋 [3/13] Verifying Resolver...\n');

async function verifyResolver() {
  try {
    const resolverPath = join(ROOT, 'src/lib/media/resolver.ts');
    const content = await fs.readFile(resolverPath, 'utf8');

    report.codebase.resolver = {
      exists: true,
      has_resolveImageUrl: content.includes('resolveImageUrl'),
      has_resolveImageUrls: content.includes('resolveImageUrls'),
      has_video_support: content.includes('video') || content.includes('Video'),
      path: resolverPath
    };

    console.log(`   ✅ resolver exists`);
    console.log(`   ✅ resolveImageUrl: ${report.codebase.resolver.has_resolveImageUrl}`);
    console.log(`   ✅ resolveImageUrls: ${report.codebase.resolver.has_resolveImageUrls}`);
    
    if (report.codebase.resolver.has_video_support) {
      console.log(`   ❌ CONTRADICTION: resolver has video support (should be IMAGE-ONLY)`);
      report.contradictions.push('resolver has video support');
    } else {
      console.log(`   ✅ IMAGE-ONLY (correct)`);
    }
  } catch (err) {
    report.codebase.resolver = { exists: false, error: err.message };
    console.log(`   ❌ resolver NOT FOUND`);
  }
}

await verifyResolver();

// ============================================================
// 4. VERIFY ADMIN CMS
// ============================================================

console.log('\n📋 [4/13] Verifying Admin CMS Integration...\n');

async function verifyAdminCMS() {
  try {
    const cmsPath = join(ROOT, 'src/features/cms/website-cms.tsx');
    const content = await fs.readFile(cmsPath, 'utf8');

    report.codebase.admin_cms = {
      exists: true,
      has_logo_media_id: content.includes('logo_media_id'),
      has_favicon_media_id: content.includes('favicon_media_id'),
      has_media_picker: content.includes('MediaPicker'),
      path: cmsPath
    };

    console.log(`   ✅ Admin CMS exists`);
    console.log(`   ✅ logo_media_id support: ${report.codebase.admin_cms.has_logo_media_id}`);
    console.log(`   ✅ favicon_media_id support: ${report.codebase.admin_cms.has_favicon_media_id}`);
    console.log(`   ✅ media picker: ${report.codebase.admin_cms.has_media_picker}`);
  } catch (err) {
    report.codebase.admin_cms = { exists: false, error: err.message };
    console.log(`   ❌ Admin CMS NOT FOUND`);
  }
}

await verifyAdminCMS();

// ============================================================
// 5. VERIFY HARDCODED LOGO PATHS
// ============================================================

console.log('\n📋 [5/13] Checking Hardcoded Logo Paths...\n');

async function checkHardcodedLogos() {
  const filesToCheck = [
    'src/components/sidebar.tsx',
    'src/app/login/page.tsx',
    'src/app/unauthorized/page.tsx',
    'src/app/layout.tsx'
  ];

  report.codebase.hardcoded_logos = [];

  for (const file of filesToCheck) {
    try {
      const path = join(ROOT, file);
      const content = await fs.readFile(path, 'utf8');
      
      const hasHardcoded = content.includes('/images/logo/zt-lounge-logo.svg') ||
                          content.includes('/images/logo/zt-lounge-logo.png') ||
                          content.includes('zt-lounge-logo');

      if (hasHardcoded) {
        report.codebase.hardcoded_logos.push(file);
        console.log(`   ⚠️  ${file}: HARDCODED LOGO FOUND`);
      } else {
        console.log(`   ✅ ${file}: no hardcoded logo`);
      }
    } catch (err) {
      console.log(`   ⚠️  ${file}: not found`);
    }
  }
}

await checkHardcodedLogos();

// ============================================================
// 6. BUILD VERIFICATION TABLE
// ============================================================

console.log('\n📋 [6/13] Building Verification Table...\n');

function buildVerificationTable() {
  const resources = [
    {
      resource: 'Logo',
      db_field: 'logo_media_id',
      admin_source: report.codebase.admin_cms?.has_logo_media_id ? 'CMS (media_id)' : 'UNKNOWN',
      website_source: 'TBD',
      resolver: report.codebase.resolver?.has_resolveImageUrl ? 'YES' : 'NO',
      status: report.database.business_settings?.logo_media_id ? '✅ POPULATED' : '⚠️  NULL'
    },
    {
      resource: 'Favicon',
      db_field: 'favicon_media_id',
      admin_source: report.codebase.admin_cms?.has_favicon_media_id ? 'CMS (media_id)' : 'UNKNOWN',
      website_source: 'TBD',
      resolver: report.codebase.resolver?.has_resolveImageUrl ? 'YES' : 'NO',
      status: report.database.business_settings?.favicon_media_id ? '✅ POPULATED' : '⚠️  NULL'
    },
    {
      resource: 'Menu',
      db_field: 'media_id',
      admin_source: 'CMS (media_id)',
      website_source: 'TBD',
      resolver: report.codebase.resolver?.has_resolveImageUrls ? 'YES' : 'NO',
      status: report.database.menu_items_data_state?.with_media_id > 0 ? '⚠️  PARTIAL' : '❌ NULL'
    },
    {
      resource: 'Services',
      db_field: 'media_id',
      admin_source: 'CMS (media_id)',
      website_source: 'TBD',
      resolver: report.codebase.resolver?.has_resolveImageUrls ? 'YES' : 'NO',
      status: report.database.services_data_state?.with_media_id > 0 ? '⚠️  PARTIAL' : '❌ NULL'
    },
    {
      resource: 'Hero',
      db_field: 'media_id',
      admin_source: 'CMS (media_id)',
      website_source: 'TBD',
      resolver: report.codebase.resolver?.has_resolveImageUrls ? 'YES' : 'NO',
      status: report.database.hero_slides_data_state?.with_media_id > 0 ? '⚠️  PARTIAL' : '❌ NULL'
    },
    {
      resource: 'Testimonials',
      db_field: 'NONE (External)',
      admin_source: 'Google Reviews API',
      website_source: 'Google Reviews',
      resolver: 'N/A',
      status: report.database.testimonials_boundary?.correct ? '✅ CORRECT' : '❌ WRONG'
    }
  ];

  report.verification_table = resources;

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  VERIFICATION TABLE');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log('RESOURCE      | DB FIELD           | ADMIN SOURCE        | WEBSITE SOURCE | RESOLVER | STATUS');
  console.log('─────────────────────────────────────────────────────────────────────────────────────────────────');

  for (const r of resources) {
    const resource = r.resource.padEnd(13);
    const dbField = r.db_field.padEnd(18);
    const adminSource = r.admin_source.padEnd(19);
    const websiteSource = r.website_source.padEnd(14);
    const resolver = r.resolver.padEnd(8);
    
    console.log(`${resource} | ${dbField} | ${adminSource} | ${websiteSource} | ${resolver} | ${r.status}`);
  }
  
  console.log('─────────────────────────────────────────────────────────────────────────────────────────────────\n');
}

buildVerificationTable();

// ============================================================
// 7. REPORT CONTRADICTIONS
// ============================================================

if (report.contradictions.length > 0) {
  console.log('\n❌ CONTRADICTIONS FOUND:\n');
  for (const contradiction of report.contradictions) {
    console.log(`   - ${contradiction}`);
  }
  console.log('\n⚠️  STOP: Resolve contradictions before proceeding.\n');
} else {
  console.log('\n✅ NO CONTRADICTIONS FOUND\n');
}

// ============================================================
// 8. SUMMARY
// ============================================================

console.log('═══════════════════════════════════════════════════════════');
console.log('  PHASE 0 RE-VERIFICATION SUMMARY');
console.log('═══════════════════════════════════════════════════════════\n');

console.log('Database:');
console.log(`   media_assets table: ${report.database.media_assets?.exists ? '✅' : '❌'}`);
console.log(`   business_settings.logo_media_id: ${report.database.business_settings?.logo_media_id ? '✅ POPULATED' : '⚠️  NULL'}`);
console.log(`   business_settings.favicon_media_id: ${report.database.business_settings?.favicon_media_id ? '✅ POPULATED' : '⚠️  NULL'}`);
console.log(`   CMS tables have media_id: ${report.database.menu_items?.has_media_id ? '✅' : '❌'}`);
console.log(`   Testimonials boundary: ${report.database.testimonials_boundary?.correct ? '✅' : '❌'}`);

console.log('\nCodebase:');
console.log(`   Resolver: ${report.codebase.resolver?.exists ? '✅' : '❌'}`);
console.log(`   Admin CMS: ${report.codebase.admin_cms?.exists ? '✅' : '❌'}`);
console.log(`   Hardcoded logos: ${report.codebase.hardcoded_logos?.length || 0} files`);

console.log('\nNext Steps:');
if (report.contradictions.length > 0) {
  console.log(`   ❌ FIX CONTRADICTIONS FIRST`);
} else {
  console.log(`   ✅ Ready for Phase 1: Data Migration`);
}

// ============================================================
// 9. SAVE REPORT
// ============================================================

const reportPath = join(ROOT, 'PHASE0_REVERIFICATION_REPORT.json');
await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

console.log(`\n📝 Full report saved: ${reportPath}`);
console.log('\n═══════════════════════════════════════════════════════════\n');
