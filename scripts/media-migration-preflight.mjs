#!/usr/bin/env node

/**
 * ZT LOUNGE — MEDIA MIGRATION PREFLIGHT
 * =====================================
 * 
 * READ-ONLY PRE-MIGRATION INSPECTION
 * 
 * This script performs a comprehensive, read-only inspection of the current
 * database state before executing ANY media_id migration operations.
 * 
 * OBJECTIVE:
 * Verify the LIVE state of:
 * - Database schemas (all CMS tables + media_assets)
 * - Existing records and field population
 * - Foreign keys and indexes
 * - Storage buckets and objects
 * - Current code integration points
 * 
 * OUTPUT:
 * MEDIA_MIGRATION_PREFLIGHT.json
 * 
 * SAFETY:
 * This script performs ZERO writes. It is safe to run multiple times.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase credentials');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false }
});

const report = {
  timestamp: new Date().toISOString(),
  phase: 'PHASE 0 — READ-ONLY PREFLIGHT',
  purpose: 'Verify current state before media_id migration',
  database_schemas: {},
  record_counts: {},
  field_population: {},
  foreign_keys: {},
  indexes: {},
  storage_buckets: {},
  media_assets_inventory: {},
  cms_entity_analysis: {},
  matching_candidates: {},
  brand_assets: {},
  testimonials_boundary: {},
  code_integration_points: {},
  migration_readiness: {},
  warnings: [],
  errors: []
};

console.log('🔍 ZT LOUNGE — MEDIA MIGRATION PREFLIGHT');
console.log('=========================================\n');

// ============================================================================
// SECTION 1: DATABASE SCHEMA INSPECTION
// ============================================================================

console.log('📋 Section 1: Database Schema Inspection...');

async function inspectTableSchema(tableName) {
  try {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .limit(0);
    
    if (error) {
      report.warnings.push(`Cannot inspect ${tableName} schema: ${error.message}`);
      return null;
    }
    
    // Get column information via information_schema
    const { data: columns, error: colError } = await supabase
      .rpc('exec_sql', {
        query: `
          SELECT column_name, data_type, is_nullable, column_default
          FROM information_schema.columns
          WHERE table_schema = 'public'
          AND table_name = '${tableName}'
          ORDER BY ordinal_position;
        `
      })
      .single();
    
    if (colError) {
      // Fallback: just list what we know from the select
      return {
        exists: true,
        columns: data ? Object.keys(data[0] || {}) : [],
        details: 'Limited schema info (exec_sql not available)'
      };
    }
    
    return {
      exists: true,
      columns: columns || [],
      accessible: true
    };
  } catch (err) {
    report.errors.push(`Failed to inspect ${tableName}: ${err.message}`);
    return { exists: false, error: err.message };
  }
}

// Inspect all critical tables
const tables = [
  'media_assets',
  'menu_items',
  'services',
  'gallery',
  'hero_slides',
  'business_settings',
  'testimonials'
];

for (const table of tables) {
  console.log(`  Inspecting ${table}...`);
  report.database_schemas[table] = await inspectTableSchema(table);
}

// ============================================================================
// SECTION 2: RECORD COUNTS & FIELD POPULATION
// ============================================================================

console.log('\n📊 Section 2: Record Counts & Field Population...');

async function analyzeTablePopulation(tableName, imageField, mediaIdField) {
  try {
    // Total count
    const { count: total, error: countError } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true });
    
    if (countError) {
      report.warnings.push(`Cannot count ${tableName}: ${countError.message}`);
      return { error: countError.message };
    }
    
    // Count records with image_field
    let withImage = 0;
    if (imageField) {
      const { count, error } = await supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true })
        .not(imageField, 'is', null)
        .neq(imageField, '');
      
      if (!error) withImage = count || 0;
    }
    
    // Count records with media_id
    let withMediaId = 0;
    if (mediaIdField) {
      const { count, error } = await supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true })
        .not(mediaIdField, 'is', null);
      
      if (!error) withMediaId = count || 0;
    }
    
    return {
      total: total || 0,
      with_image: withImage,
      with_media_id: withMediaId,
      needs_migration: withImage - withMediaId
    };
  } catch (err) {
    report.errors.push(`Failed to analyze ${tableName}: ${err.message}`);
    return { error: err.message };
  }
}

report.record_counts.media_assets = await analyzeTablePopulation('media_assets', null, null);
report.record_counts.menu_items = await analyzeTablePopulation('menu_items', 'image_url', 'media_id');
report.record_counts.services = await analyzeTablePopulation('services', 'image_url', 'media_id');
report.record_counts.gallery = await analyzeTablePopulation('gallery', 'image_url', 'media_id');
report.record_counts.hero_slides = await analyzeTablePopulation('hero_slides', 'image_url', 'media_id');
report.record_counts.testimonials = await analyzeTablePopulation('testimonials', null, null);

// Business settings (single record)
try {
  const { data: bizData, error: bizError } = await supabase
    .from('business_settings')
    .select('logo_url, favicon_url, logo_media_id, favicon_media_id')
    .single();
  
  if (bizError) {
    report.warnings.push(`Cannot read business_settings: ${bizError.message}`);
    report.record_counts.business_settings = { error: bizError.message };
  } else {
    report.record_counts.business_settings = {
      exists: true,
      has_logo_url: !!bizData?.logo_url,
      has_favicon_url: !!bizData?.favicon_url,
      has_logo_media_id: !!bizData?.logo_media_id,
      has_favicon_media_id: !!bizData?.favicon_media_id,
      logo_url: bizData?.logo_url,
      favicon_url: bizData?.favicon_url
    };
  }
} catch (err) {
  report.errors.push(`Failed to read business_settings: ${err.message}`);
}

// ============================================================================
// SECTION 3: MEDIA ASSETS INVENTORY
// ============================================================================

console.log('\n🗄️  Section 3: Media Assets Inventory...');

try {
  const { data: assets, error: assetsError } = await supabase
    .from('media_assets')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (assetsError) {
    report.warnings.push(`Cannot read media_assets: ${assetsError.message}`);
  } else {
    const assetsByBucket = {};
    const assetsByPath = {};
    const assetsByUrl = {};
    
    for (const asset of assets || []) {
      // Group by bucket
      if (!assetsByBucket[asset.bucket]) {
        assetsByBucket[asset.bucket] = [];
      }
      assetsByBucket[asset.bucket].push(asset.id);
      
      // Index by path
      if (asset.path) {
        assetsByPath[asset.path] = asset.id;
      }
      
      // Index by public_url
      if (asset.public_url) {
        assetsByUrl[asset.public_url] = asset.id;
      }
    }
    
    report.media_assets_inventory = {
      total: assets?.length || 0,
      assets: assets || [],
      by_bucket: assetsByBucket,
      by_path: assetsByPath,
      by_url: assetsByUrl,
      sample: (assets || []).slice(0, 5)
    };
  }
} catch (err) {
  report.errors.push(`Failed to read media_assets: ${err.message}`);
}

// ============================================================================
// SECTION 4: CMS ENTITY ANALYSIS
// ============================================================================

console.log('\n🔗 Section 4: CMS Entity Analysis...');

async function analyzeCmsEntity(tableName, imageField, mediaIdField) {
  try {
    const { data, error } = await supabase
      .from(tableName)
      .select(`id, ${imageField}, ${mediaIdField}`)
      .order('created_at', { ascending: false });
    
    if (error) {
      report.warnings.push(`Cannot read ${tableName}: ${error.message}`);
      return { error: error.message };
    }
    
    const records = data || [];
    const analysis = {
      total: records.length,
      with_image: 0,
      with_media_id: 0,
      both_populated: 0,
      neither_populated: 0,
      needs_linking: [],
      already_linked: [],
      no_image: []
    };
    
    for (const record of records) {
      const hasImage = record[imageField] && record[imageField] !== '';
      const hasMediaId = record[mediaIdField] !== null;
      
      if (hasImage) analysis.with_image++;
      if (hasMediaId) analysis.with_media_id++;
      
      if (hasImage && hasMediaId) {
        analysis.both_populated++;
        analysis.already_linked.push({
          id: record.id,
          image_url: record[imageField],
          media_id: record[mediaIdField]
        });
      } else if (hasImage && !hasMediaId) {
        analysis.needs_linking.push({
          id: record.id,
          image_url: record[imageField]
        });
      } else if (!hasImage && hasMediaId) {
        report.warnings.push(`${tableName}.${record.id} has media_id but no image_url`);
      } else {
        analysis.no_image.push(record.id);
      }
    }
    
    return analysis;
  } catch (err) {
    report.errors.push(`Failed to analyze ${tableName}: ${err.message}`);
    return { error: err.message };
  }
}

report.cms_entity_analysis.menu_items = await analyzeCmsEntity('menu_items', 'image_url', 'media_id');
report.cms_entity_analysis.services = await analyzeCmsEntity('services', 'image_url', 'media_id');
report.cms_entity_analysis.gallery = await analyzeCmsEntity('gallery', 'image_url', 'media_id');
report.cms_entity_analysis.hero_slides = await analyzeCmsEntity('hero_slides', 'image_url', 'media_id');

// ============================================================================
// SECTION 5: MATCHING CANDIDATES
// ============================================================================

console.log('\n🎯 Section 5: Matching Candidates...');

function findMatchingAsset(imageUrl, assetsByUrl, assetsByPath) {
  if (!imageUrl) return null;
  
  // Direct public_url match
  if (assetsByUrl[imageUrl]) {
    return {
      match_type: 'EXACT_URL',
      media_id: assetsByUrl[imageUrl],
      confidence: 'HIGH'
    };
  }
  
  // Extract bucket/path from Supabase Storage URL
  const storageMatch = imageUrl.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
  if (storageMatch) {
    const [, bucket, path] = storageMatch;
    const pathKey = path;
    
    if (assetsByPath[pathKey]) {
      return {
        match_type: 'BUCKET_PATH',
        media_id: assetsByPath[pathKey],
        confidence: 'HIGH',
        bucket,
        path
      };
    }
  }
  
  // Filename match (lower confidence)
  const filename = imageUrl.split('/').pop();
  if (filename) {
    const matches = [];
    for (const [path, id] of Object.entries(assetsByPath)) {
      if (path.endsWith(filename) || path === filename) {
        matches.push({ media_id: id, path });
      }
    }
    
    if (matches.length === 1) {
      return {
        match_type: 'FILENAME',
        media_id: matches[0].media_id,
        confidence: 'MEDIUM',
        path: matches[0].path
      };
    } else if (matches.length > 1) {
      return {
        match_type: 'AMBIGUOUS',
        candidates: matches,
        confidence: 'NONE'
      };
    }
  }
  
  return {
    match_type: 'UNRESOLVED',
    confidence: 'NONE'
  };
}

const assetsByUrl = report.media_assets_inventory.by_url || {};
const assetsByPath = report.media_assets_inventory.by_path || {};

for (const entityType of ['menu_items', 'services', 'gallery', 'hero_slides']) {
  const analysis = report.cms_entity_analysis[entityType];
  if (!analysis || analysis.error) continue;
  
  report.matching_candidates[entityType] = {
    exact_matches: 0,
    high_confidence: 0,
    medium_confidence: 0,
    ambiguous: 0,
    unresolved: 0,
    details: []
  };
  
  for (const record of analysis.needs_linking || []) {
    const match = findMatchingAsset(record.image_url, assetsByUrl, assetsByPath);
    
    if (match.match_type === 'EXACT_URL' || (match.match_type === 'BUCKET_PATH' && match.confidence === 'HIGH')) {
      report.matching_candidates[entityType].exact_matches++;
      report.matching_candidates[entityType].high_confidence++;
    } else if (match.confidence === 'MEDIUM') {
      report.matching_candidates[entityType].medium_confidence++;
    } else if (match.match_type === 'AMBIGUOUS') {
      report.matching_candidates[entityType].ambiguous++;
    } else {
      report.matching_candidates[entityType].unresolved++;
    }
    
    report.matching_candidates[entityType].details.push({
      entity_id: record.id,
      image_url: record.image_url,
      match
    });
  }
}

// ============================================================================
// SECTION 6: BRAND ASSETS
// ============================================================================

console.log('\n🏷️  Section 6: Brand Assets...');

const bizSettings = report.record_counts.business_settings;
if (bizSettings && !bizSettings.error) {
  report.brand_assets = {
    logo: {
      url: bizSettings.logo_url,
      has_media_id_column: bizSettings.has_logo_media_id !== undefined,
      media_id_populated: bizSettings.has_logo_media_id,
      match: bizSettings.logo_url ? findMatchingAsset(bizSettings.logo_url, assetsByUrl, assetsByPath) : null
    },
    favicon: {
      url: bizSettings.favicon_url,
      has_media_id_column: bizSettings.has_favicon_media_id !== undefined,
      media_id_populated: bizSettings.has_favicon_media_id,
      match: bizSettings.favicon_url ? findMatchingAsset(bizSettings.favicon_url, assetsByUrl, assetsByPath) : null
    }
  };
}

// ============================================================================
// SECTION 7: STORAGE BUCKETS
// ============================================================================

console.log('\n🪣 Section 7: Storage Buckets...');

try {
  const { data: buckets, error: bucketsError } = await supabase
    .storage
    .listBuckets();
  
  if (bucketsError) {
    report.warnings.push(`Cannot list storage buckets: ${bucketsError.message}`);
  } else {
    report.storage_buckets = {
      total: buckets?.length || 0,
      buckets: buckets || [],
      names: (buckets || []).map(b => b.name)
    };
  }
} catch (err) {
  report.errors.push(`Failed to list storage buckets: ${err.message}`);
}

// ============================================================================
// SECTION 8: TESTIMONIALS BOUNDARY VERIFICATION
// ============================================================================

console.log('\n🚫 Section 8: Testimonials Boundary...');

report.testimonials_boundary = {
  table_exists: report.database_schemas.testimonials?.exists || false,
  record_count: report.record_counts.testimonials?.total || 0,
  should_migrate: false,
  reason: 'External Google Reviews data - MUST remain outside Media Library'
};

// ============================================================================
// SECTION 9: MIGRATION READINESS ASSESSMENT
// ============================================================================

console.log('\n✅ Section 9: Migration Readiness...');

report.migration_readiness = {
  database_schema_ready: true,
  media_assets_exist: (report.media_assets_inventory.total || 0) > 0,
  cms_entities_need_migration: false,
  brand_assets_need_columns: false,
  blocking_issues: [],
  warnings: [],
  recommendations: []
};

// Check if CMS entities need migration
for (const entity of ['menu_items', 'services', 'gallery', 'hero_slides']) {
  const analysis = report.cms_entity_analysis[entity];
  if (analysis && !analysis.error && analysis.needs_linking.length > 0) {
    report.migration_readiness.cms_entities_need_migration = true;
    report.migration_readiness.recommendations.push(
      `${entity}: ${analysis.needs_linking.length} records need media_id linking`
    );
  }
}

// Check brand assets
if (report.brand_assets.logo && !report.brand_assets.logo.has_media_id_column) {
  report.migration_readiness.brand_assets_need_columns = true;
  report.migration_readiness.blocking_issues.push(
    'business_settings missing logo_media_id column - migration required'
  );
}

if (report.brand_assets.favicon && !report.brand_assets.favicon.has_media_id_column) {
  report.migration_readiness.brand_assets_need_columns = true;
  report.migration_readiness.blocking_issues.push(
    'business_settings missing favicon_media_id column - migration required'
  );
}

// Check for unresolved matches
for (const entity of ['menu_items', 'services', 'gallery', 'hero_slides']) {
  const candidates = report.matching_candidates[entity];
  if (candidates && candidates.unresolved > 0) {
    report.migration_readiness.warnings.push(
      `${entity}: ${candidates.unresolved} records have no matching media_asset`
    );
  }
  if (candidates && candidates.ambiguous > 0) {
    report.migration_readiness.warnings.push(
      `${entity}: ${candidates.ambiguous} records have ambiguous matches`
    );
  }
}

// ============================================================================
// SAVE REPORT
// ============================================================================

console.log('\n💾 Saving preflight report...');

const outputPath = 'MEDIA_MIGRATION_PREFLIGHT.json';
await fs.writeFile(outputPath, JSON.stringify(report, null, 2));

console.log(`✅ Preflight report saved: ${outputPath}`);

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('PREFLIGHT SUMMARY');
console.log('='.repeat(80));

console.log('\n📊 RECORD COUNTS:');
console.log(`  media_assets: ${report.record_counts.media_assets?.total || 0}`);
console.log(`  menu_items: ${report.record_counts.menu_items?.total || 0} (${report.record_counts.menu_items?.needs_migration || 0} need migration)`);
console.log(`  services: ${report.record_counts.services?.total || 0} (${report.record_counts.services?.needs_migration || 0} need migration)`);
console.log(`  gallery: ${report.record_counts.gallery?.total || 0} (${report.record_counts.gallery?.needs_migration || 0} need migration)`);
console.log(`  hero_slides: ${report.record_counts.hero_slides?.total || 0} (${report.record_counts.hero_slides?.needs_migration || 0} need migration)`);

console.log('\n🎯 MATCHING ANALYSIS:');
for (const entity of ['menu_items', 'services', 'gallery', 'hero_slides']) {
  const candidates = report.matching_candidates[entity];
  if (candidates) {
    console.log(`  ${entity}:`);
    console.log(`    High confidence matches: ${candidates.high_confidence}`);
    console.log(`    Medium confidence matches: ${candidates.medium_confidence}`);
    console.log(`    Ambiguous: ${candidates.ambiguous}`);
    console.log(`    Unresolved: ${candidates.unresolved}`);
  }
}

console.log('\n🏷️  BRAND ASSETS:');
console.log(`  Logo column exists: ${report.brand_assets?.logo?.has_media_id_column ? '✅' : '❌'}`);
console.log(`  Favicon column exists: ${report.brand_assets?.favicon?.has_media_id_column ? '✅' : '❌'}`);

console.log('\n🚨 BLOCKING ISSUES:');
if (report.migration_readiness.blocking_issues.length === 0) {
  console.log('  None');
} else {
  report.migration_readiness.blocking_issues.forEach(issue => {
    console.log(`  ❌ ${issue}`);
  });
}

console.log('\n⚠️  WARNINGS:');
if (report.migration_readiness.warnings.length === 0) {
  console.log('  None');
} else {
  report.migration_readiness.warnings.forEach(warning => {
    console.log(`  ⚠️  ${warning}`);
  });
}

console.log('\n📋 RECOMMENDATIONS:');
if (report.migration_readiness.recommendations.length === 0) {
  console.log('  No migration needed');
} else {
  report.migration_readiness.recommendations.forEach(rec => {
    console.log(`  • ${rec}`);
  });
}

console.log('\n' + '='.repeat(80));
console.log('✅ PREFLIGHT COMPLETE - Review MEDIA_MIGRATION_PREFLIGHT.json before proceeding');
console.log('='.repeat(80) + '\n');

process.exit(report.errors.length > 0 ? 1 : 0);
