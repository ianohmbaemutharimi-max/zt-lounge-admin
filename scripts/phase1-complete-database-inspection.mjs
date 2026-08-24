#!/usr/bin/env node
/**
 * PHASE 1 — COMPLETE DATABASE INSPECTION
 * 
 * Inspect live Supabase schema and map all CMS content to media_assets.
 * 
 * This is READ-ONLY. No database modifications.
 * 
 * Outputs:
 * - PHASE1_DATABASE_INSPECTION.json
 * - Detailed console report
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

config({ path: join(ROOT, '.env.local') });

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log(`
═══════════════════════════════════════════════════════════
  PHASE 1 — COMPLETE DATABASE INSPECTION
  READ-ONLY ANALYSIS
═══════════════════════════════════════════════════════════
`);

const report = {
  timestamp: new Date().toISOString(),
  tables: {},
  cms_mapping: [],
  brand_assets: {},
  media_assets_inventory: [],
  gallery_table_name: null,
  ambiguous_matches: [],
  missing_assets: [],
  exact_matches: [],
  statistics: {}
};

// ============================================================
// UTILITY: Parse Supabase Storage URL
// ============================================================

function parseStorageUrl(url) {
  if (!url) return null;
  
  try {
    // Pattern: https://{project}.supabase.co/storage/v1/object/public/{bucket}/{path}
    const match = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
    if (match) {
      return {
        bucket: match[1],
        path: match[2],
        original_url: url
      };
    }
  } catch (err) {
    console.error(`Failed to parse URL: ${url}`, err);
  }
  
  return null;
}

// ============================================================
// UTILITY: Match media_assets
// ============================================================

function findMediaAssetMatch(imageUrl, allMediaAssets) {
  if (!imageUrl) return { status: 'NO_IMAGE_URL', match: null };
  
  const parsed = parseStorageUrl(imageUrl);
  if (!parsed) return { status: 'UNPARSEABLE_URL', match: null, url: imageUrl };
  
  // Method 1: Exact public_url match
  const exactUrlMatches = allMediaAssets.filter(a => a.public_url === imageUrl);
  if (exactUrlMatches.length === 1) {
    return { status: 'EXACT_URL_MATCH', match: exactUrlMatches[0], method: 'public_url' };
  }
  if (exactUrlMatches.length > 1) {
    return { status: 'AMBIGUOUS_URL', matches: exactUrlMatches, url: imageUrl };
  }
  
  // Method 2: Exact bucket + path match
  const bucketPathMatches = allMediaAssets.filter(a => 
    a.bucket === parsed.bucket && a.path === parsed.path
  );
  if (bucketPathMatches.length === 1) {
    return { status: 'EXACT_BUCKET_PATH', match: bucketPathMatches[0], method: 'bucket+path' };
  }
  if (bucketPathMatches.length > 1) {
    return { status: 'AMBIGUOUS_BUCKET_PATH', matches: bucketPathMatches, parsed };
  }
  
  // Method 3: Normalized URL match (in case of URL variations)
  const normalizedMatches = allMediaAssets.filter(a => {
    const aParsed = parseStorageUrl(a.public_url);
    return aParsed && aParsed.bucket === parsed.bucket && aParsed.path === parsed.path;
  });
  if (normalizedMatches.length === 1) {
    return { status: 'NORMALIZED_MATCH', match: normalizedMatches[0], method: 'normalized' };
  }
  if (normalizedMatches.length > 1) {
    return { status: 'AMBIGUOUS_NORMALIZED', matches: normalizedMatches, parsed };
  }
  
  // No match found
  return { status: 'NO_MATCH', parsed, url: imageUrl };
}

// ============================================================
// 1. INSPECT SCHEMA - IDENTIFY TABLES
// ============================================================

console.log('📋 [1/8] Inspecting Schema...\n');

async function inspectSchema() {
  const tablesToCheck = [
    'media_assets',
    'business_settings',
    'menu_items',
    'services',
    'hero_slides',
    'gallery',
    'gallery_items',
    'gallery_images',
    'testimonials'
  ];
  
  for (const table of tablesToCheck) {
    try {
      const { data, error } = await supabase.from(table).select('*').limit(1);
      
      if (error) {
        report.tables[table] = { exists: false, error: error.message };
        console.log(`   ❌ ${table}: ${error.message}`);
      } else {
        const sample = data?.[0] || null;
        const columns = sample ? Object.keys(sample) : [];
        
        report.tables[table] = {
          exists: true,
          columns,
          has_media_id: columns.includes('media_id'),
          has_image_url: columns.includes('image_url'),
          has_logo_url: columns.includes('logo_url'),
          has_favicon_url: columns.includes('favicon_url'),
          has_logo_media_id: columns.includes('logo_media_id'),
          has_favicon_media_id: columns.includes('favicon_media_id')
        };
        
        console.log(`   ✅ ${table}: exists (${columns.length} columns)`);
        
        // Identify gallery table
        if ((table === 'gallery' || table === 'gallery_items' || table === 'gallery_images') && 
            columns.includes('image_url')) {
          report.gallery_table_name = table;
          console.log(`      ℹ️  Identified as gallery table`);
        }
      }
    } catch (err) {
      report.tables[table] = { exists: false, error: err.message };
      console.log(`   ❌ ${table}: ${err.message}`);
    }
  }
  
  console.log(`\n   Gallery table identified: ${report.gallery_table_name || 'NONE'}`);
}

await inspectSchema();

// ============================================================
// 2. LOAD ALL media_assets
// ============================================================

console.log('\n📋 [2/8] Loading media_assets Inventory...\n');

async function loadMediaAssets() {
  const { data, error } = await supabase
    .from('media_assets')
    .select('*');
  
  if (error) {
    console.log(`   ❌ Failed to load media_assets: ${error.message}`);
    return [];
  }
  
  report.media_assets_inventory = data || [];
  console.log(`   ✅ Loaded ${data?.length || 0} media_assets records`);
  
  return data || [];
}

const allMediaAssets = await loadMediaAssets();

// ============================================================
// 3. MAP menu_items
// ============================================================

console.log('\n📋 [3/8] Mapping menu_items...\n');

async function mapMenuItems() {
  if (!report.tables.menu_items?.exists) {
    console.log('   ⚠️  menu_items table not found');
    return;
  }
  
  const { data, error } = await supabase
    .from('menu_items')
    .select('id, name, image_url, media_id');
  
  if (error) {
    console.log(`   ❌ Failed: ${error.message}`);
    return;
  }
  
  let exact = 0, ambiguous = 0, missing = 0, noImage = 0, alreadyMigrated = 0;
  
  for (const item of data || []) {
    if (item.media_id) {
      alreadyMigrated++;
      continue;
    }
    
    if (!item.image_url) {
      noImage++;
      continue;
    }
    
    const matchResult = findMediaAssetMatch(item.image_url, allMediaAssets);
    
    const mapping = {
      table: 'menu_items',
      record_id: item.id,
      record_name: item.name,
      legacy_image_url: item.image_url,
      current_media_id: item.media_id,
      match_status: matchResult.status,
      matched_media_id: matchResult.match?.id || null,
      match_method: matchResult.method || null,
      parsed: matchResult.parsed || null
    };
    
    report.cms_mapping.push(mapping);
    
    if (matchResult.status.includes('EXACT') || matchResult.status === 'NORMALIZED_MATCH') {
      exact++;
      report.exact_matches.push(mapping);
    } else if (matchResult.status.includes('AMBIGUOUS')) {
      ambiguous++;
      report.ambiguous_matches.push({...mapping, matches: matchResult.matches});
    } else if (matchResult.status === 'NO_MATCH') {
      missing++;
      report.missing_assets.push(mapping);
    }
  }
  
  console.log(`   Total: ${data?.length || 0}`);
  console.log(`   Already migrated: ${alreadyMigrated}`);
  console.log(`   No image: ${noImage}`);
  console.log(`   Exact matches: ${exact}`);
  console.log(`   Ambiguous: ${ambiguous}`);
  console.log(`   Missing: ${missing}`);
  
  report.statistics.menu_items = { total: data?.length || 0, exact, ambiguous, missing, noImage, alreadyMigrated };
}

await mapMenuItems();

// ============================================================
// 4. MAP services
// ============================================================

console.log('\n📋 [4/8] Mapping services...\n');

async function mapServices() {
  if (!report.tables.services?.exists) {
    console.log('   ⚠️  services table not found');
    return;
  }
  
  const { data, error } = await supabase
    .from('services')
    .select('id, name, image_url, media_id');
  
  if (error) {
    console.log(`   ❌ Failed: ${error.message}`);
    return;
  }
  
  let exact = 0, ambiguous = 0, missing = 0, noImage = 0, alreadyMigrated = 0;
  
  for (const item of data || []) {
    if (item.media_id) {
      alreadyMigrated++;
      continue;
    }
    
    if (!item.image_url) {
      noImage++;
      continue;
    }
    
    const matchResult = findMediaAssetMatch(item.image_url, allMediaAssets);
    
    const mapping = {
      table: 'services',
      record_id: item.id,
      record_name: item.name,
      legacy_image_url: item.image_url,
      current_media_id: item.media_id,
      match_status: matchResult.status,
      matched_media_id: matchResult.match?.id || null,
      match_method: matchResult.method || null,
      parsed: matchResult.parsed || null
    };
    
    report.cms_mapping.push(mapping);
    
    if (matchResult.status.includes('EXACT') || matchResult.status === 'NORMALIZED_MATCH') {
      exact++;
      report.exact_matches.push(mapping);
    } else if (matchResult.status.includes('AMBIGUOUS')) {
      ambiguous++;
      report.ambiguous_matches.push({...mapping, matches: matchResult.matches});
    } else if (matchResult.status === 'NO_MATCH') {
      missing++;
      report.missing_assets.push(mapping);
    }
  }
  
  console.log(`   Total: ${data?.length || 0}`);
  console.log(`   Already migrated: ${alreadyMigrated}`);
  console.log(`   No image: ${noImage}`);
  console.log(`   Exact matches: ${exact}`);
  console.log(`   Ambiguous: ${ambiguous}`);
  console.log(`   Missing: ${missing}`);
  
  report.statistics.services = { total: data?.length || 0, exact, ambiguous, missing, noImage, alreadyMigrated };
}

await mapServices();

// ============================================================
// 5. MAP hero_slides
// ============================================================

console.log('\n📋 [5/8] Mapping hero_slides...\n');

async function mapHeroSlides() {
  if (!report.tables.hero_slides?.exists) {
    console.log('   ⚠️  hero_slides table not found');
    return;
  }
  
  const { data, error } = await supabase
    .from('hero_slides')
    .select('id, title, image_url, media_id');
  
  if (error) {
    console.log(`   ❌ Failed: ${error.message}`);
    return;
  }
  
  let exact = 0, ambiguous = 0, missing = 0, noImage = 0, alreadyMigrated = 0;
  
  for (const item of data || []) {
    if (item.media_id) {
      alreadyMigrated++;
      continue;
    }
    
    if (!item.image_url) {
      noImage++;
      continue;
    }
    
    const matchResult = findMediaAssetMatch(item.image_url, allMediaAssets);
    
    const mapping = {
      table: 'hero_slides',
      record_id: item.id,
      record_name: item.title,
      legacy_image_url: item.image_url,
      current_media_id: item.media_id,
      match_status: matchResult.status,
      matched_media_id: matchResult.match?.id || null,
      match_method: matchResult.method || null,
      parsed: matchResult.parsed || null
    };
    
    report.cms_mapping.push(mapping);
    
    if (matchResult.status.includes('EXACT') || matchResult.status === 'NORMALIZED_MATCH') {
      exact++;
      report.exact_matches.push(mapping);
    } else if (matchResult.status.includes('AMBIGUOUS')) {
      ambiguous++;
      report.ambiguous_matches.push({...mapping, matches: matchResult.matches});
    } else if (matchResult.status === 'NO_MATCH') {
      missing++;
      report.missing_assets.push(mapping);
    }
  }
  
  console.log(`   Total: ${data?.length || 0}`);
  console.log(`   Already migrated: ${alreadyMigrated}`);
  console.log(`   No image: ${noImage}`);
  console.log(`   Exact matches: ${exact}`);
  console.log(`   Ambiguous: ${ambiguous}`);
  console.log(`   Missing: ${missing}`);
  
  report.statistics.hero_slides = { total: data?.length || 0, exact, ambiguous, missing, noImage, alreadyMigrated };
}

await mapHeroSlides();

// ============================================================
// 6. MAP gallery (if found)
// ============================================================

console.log('\n📋 [6/8] Mapping gallery...\n');

async function mapGallery() {
  if (!report.gallery_table_name) {
    console.log('   ⚠️  No gallery table found');
    return;
  }
  
  const { data, error } = await supabase
    .from(report.gallery_table_name)
    .select('*');
  
  if (error) {
    console.log(`   ❌ Failed: ${error.message}`);
    return;
  }
  
  let exact = 0, ambiguous = 0, missing = 0, noImage = 0, alreadyMigrated = 0;
  
  for (const item of data || []) {
    const hasMediaId = item.media_id !== null && item.media_id !== undefined;
    const imageUrl = item.image_url || item.url || null;
    
    if (hasMediaId) {
      alreadyMigrated++;
      continue;
    }
    
    if (!imageUrl) {
      noImage++;
      continue;
    }
    
    const matchResult = findMediaAssetMatch(imageUrl, allMediaAssets);
    
    const mapping = {
      table: report.gallery_table_name,
      record_id: item.id,
      record_name: item.title || item.name || `Gallery ${item.id}`,
      legacy_image_url: imageUrl,
      current_media_id: item.media_id || null,
      match_status: matchResult.status,
      matched_media_id: matchResult.match?.id || null,
      match_method: matchResult.method || null,
      parsed: matchResult.parsed || null
    };
    
    report.cms_mapping.push(mapping);
    
    if (matchResult.status.includes('EXACT') || matchResult.status === 'NORMALIZED_MATCH') {
      exact++;
      report.exact_matches.push(mapping);
    } else if (matchResult.status.includes('AMBIGUOUS')) {
      ambiguous++;
      report.ambiguous_matches.push({...mapping, matches: matchResult.matches});
    } else if (matchResult.status === 'NO_MATCH') {
      missing++;
      report.missing_assets.push(mapping);
    }
  }
  
  console.log(`   Total: ${data?.length || 0}`);
  console.log(`   Already migrated: ${alreadyMigrated}`);
  console.log(`   No image: ${noImage}`);
  console.log(`   Exact matches: ${exact}`);
  console.log(`   Ambiguous: ${ambiguous}`);
  console.log(`   Missing: ${missing}`);
  
  report.statistics[report.gallery_table_name] = { total: data?.length || 0, exact, ambiguous, missing, noImage, alreadyMigrated };
}

await mapGallery();

// ============================================================
// 7. INSPECT business_settings
// ============================================================

console.log('\n📋 [7/8] Inspecting business_settings...\n');

async function inspectBusinessSettings() {
  if (!report.tables.business_settings?.exists) {
    console.log('   ⚠️  business_settings table not found');
    return;
  }
  
  const { data, error } = await supabase
    .from('business_settings')
    .select('*')
    .single();
  
  if (error) {
    console.log(`   ⚠️  No business_settings record exists: ${error.message}`);
    report.brand_assets.business_settings_exists = false;
    report.brand_assets.needs_initialization = true;
    return;
  }
  
  report.brand_assets.business_settings_exists = true;
  report.brand_assets.record = data;
  report.brand_assets.logo_url = data.logo_url || null;
  report.brand_assets.favicon_url = data.favicon_url || null;
  report.brand_assets.logo_media_id = data.logo_media_id || null;
  report.brand_assets.favicon_media_id = data.favicon_media_id || null;
  
  console.log(`   ✅ Record exists`);
  console.log(`   logo_url: ${data.logo_url || 'NULL'}`);
  console.log(`   favicon_url: ${data.favicon_url || 'NULL'}`);
  console.log(`   logo_media_id: ${data.logo_media_id || 'NULL'}`);
  console.log(`   favicon_media_id: ${data.favicon_media_id || 'NULL'}`);
}

await inspectBusinessSettings();

// ============================================================
// 8. INSPECT testimonials BOUNDARY
// ============================================================

console.log('\n📋 [8/8] Verifying testimonials boundary...\n');

async function inspectTestimonials() {
  if (!report.tables.testimonials?.exists) {
    console.log('   ⚠️  testimonials table not found');
    return;
  }
  
  const hasMediaId = report.tables.testimonials.has_media_id;
  
  report.brand_assets.testimonials_has_media_id = hasMediaId;
  report.brand_assets.testimonials_boundary_correct = !hasMediaId;
  
  if (hasMediaId) {
    console.log(`   ❌ INCORRECT: testimonials has media_id column`);
    console.log(`   Action required: testimonials should NOT have media_id`);
  } else {
    console.log(`   ✅ CORRECT: testimonials does NOT have media_id`);
  }
}

await inspectTestimonials();

// ============================================================
// SUMMARY
// ============================================================

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  PHASE 1 INSPECTION SUMMARY');
console.log('═══════════════════════════════════════════════════════════\n');

const totalExact = report.exact_matches.length;
const totalAmbiguous = report.ambiguous_matches.length;
const totalMissing = report.missing_assets.length;

console.log('CMS Mapping Results:');
console.log(`   Total records inspected: ${report.cms_mapping.length}`);
console.log(`   ✅ Exact matches (ready to migrate): ${totalExact}`);
console.log(`   ⚠️  Ambiguous matches (need manual review): ${totalAmbiguous}`);
console.log(`   ❌ Missing assets (need creation): ${totalMissing}`);

console.log('\nBrand Assets:');
console.log(`   business_settings exists: ${report.brand_assets.business_settings_exists ? '✅' : '❌'}`);
if (report.brand_assets.business_settings_exists) {
  console.log(`   logo_media_id: ${report.brand_assets.logo_media_id ? '✅ SET' : '⚠️  NULL'}`);
  console.log(`   favicon_media_id: ${report.brand_assets.favicon_media_id ? '✅ SET' : '⚠️  NULL'}`);
}

console.log('\nTestimonials Boundary:');
console.log(`   ${report.brand_assets.testimonials_boundary_correct ? '✅' : '❌'} ${report.brand_assets.testimonials_boundary_correct ? 'CORRECT' : 'NEEDS FIX'}`);

console.log('\nGallery:');
console.log(`   Table name: ${report.gallery_table_name || 'NOT FOUND'}`);

// ============================================================
// SAVE REPORT
// ============================================================

const reportPath = join(ROOT, 'PHASE1_DATABASE_INSPECTION.json');
await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

console.log(`\n📝 Full report saved: ${reportPath}`);
console.log('\n═══════════════════════════════════════════════════════════');
console.log('  NEXT STEPS');
console.log('═══════════════════════════════════════════════════════════\n');

if (totalAmbiguous > 0) {
  console.log(`⚠️  REVIEW REQUIRED: ${totalAmbiguous} ambiguous matches need manual resolution`);
}

if (totalMissing > 0) {
  console.log(`⚠️  ACTION REQUIRED: ${totalMissing} assets need media_assets records created`);
}

if (totalExact > 0) {
  console.log(`✅ READY: ${totalExact} records can be safely migrated to media_id`);
}

if (!report.brand_assets.business_settings_exists) {
  console.log(`⚠️  business_settings record needs initialization`);
}

console.log('\n');
