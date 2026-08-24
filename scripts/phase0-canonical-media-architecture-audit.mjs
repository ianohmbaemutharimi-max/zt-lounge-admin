#!/usr/bin/env node
/**
 * PHASE 0 — CANONICAL MEDIA LIBRARY ARCHITECTURE AUDIT
 * 
 * READ-ONLY VERIFICATION
 * 
 * DO NOT MODIFY ANYTHING
 * 
 * Objective: Verify the actual state of media architecture
 * - Database schema (real table names, columns, constraints)
 * - Code integration (actual usage patterns)
 * - Storage integration (buckets, paths, public URLs)
 * - CMS entity matrix (who references what)
 * - Legacy fields (image_url, logo_url, etc.)
 * - Google Reviews boundary
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = await fs.readFile(envPath, 'utf-8');
const env = Object.fromEntries(
  envContent.split('\n')
    .filter(line => line.trim() && !line.startsWith('#'))
    .map(line => line.split('=').map(s => s.trim()))
);

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

const report = {
  timestamp: new Date().toISOString(),
  phase: 'PHASE 0 - READ-ONLY CANONICAL MEDIA ARCHITECTURE AUDIT',
  sections: {}
};

console.log('🔍 PHASE 0 — CANONICAL MEDIA LIBRARY ARCHITECTURE AUDIT');
console.log('========================================================\n');

// ============================================================
// 1. DATABASE SCHEMA VERIFICATION
// ============================================================
console.log('📊 Section 1: Database Schema Verification\n');

const schemaQuery = `
  SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name IN (
      'media_assets',
      'menu_items',
      'services',
      'gallery',
      'hero_slides',
      'business_settings',
      'testimonials',
      'google_reviews'
    )
  ORDER BY table_name, ordinal_position;
`;

const { data: schemaData, error: schemaError } = await supabase.rpc('exec_sql', {
  query: schemaQuery
}).single();

if (schemaError) {
  console.error('❌ Schema query failed:', schemaError);
} else {
  report.sections.schema = schemaData;
  console.log('✅ Schema data retrieved');
  console.log(`   Tables found: ${[...new Set(schemaData.map(r => r.table_name))].join(', ')}\n`);
}

// ============================================================
// 2. MEDIA_ASSETS TABLE INSPECTION
// ============================================================
console.log('📦 Section 2: media_assets Table Inspection\n');

const { data: mediaAssets, error: mediaError } = await supabase
  .from('media_assets')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(100);

if (mediaError) {
  console.error('❌ media_assets query failed:', mediaError);
  report.sections.media_assets = { error: mediaError.message };
} else {
  report.sections.media_assets = {
    total_count: mediaAssets.length,
    sample: mediaAssets.slice(0, 5),
    columns: mediaAssets.length > 0 ? Object.keys(mediaAssets[0]) : [],
    buckets: [...new Set(mediaAssets.map(a => a.bucket))],
    mime_types: [...new Set(mediaAssets.map(a => a.mime_type))]
  };
  console.log(`✅ media_assets: ${mediaAssets.length} records found`);
  console.log(`   Columns: ${Object.keys(mediaAssets[0] || {}).join(', ')}`);
  console.log(`   Buckets: ${[...new Set(mediaAssets.map(a => a.bucket))].join(', ')}\n`);
}

// ============================================================
// 3. CMS ENTITY MATRIX
// ============================================================
console.log('🗂️  Section 3: CMS Entity Matrix\n');

const entities = [
  { name: 'menu_items', table: 'menu_items' },
  { name: 'services', table: 'services' },
  { name: 'gallery', table: 'gallery' },
  { name: 'hero_slides', table: 'hero_slides' },
  { name: 'business_settings', table: 'business_settings' },
  { name: 'testimonials', table: 'testimonials' }
];

const entityMatrix = {};

for (const entity of entities) {
  try {
    const { data, error } = await supabase
      .from(entity.table)
      .select('*')
      .limit(5);
    
    if (error) {
      entityMatrix[entity.name] = { error: error.message, exists: false };
      console.log(`❌ ${entity.name}: ${error.message}`);
    } else {
      const columns = data.length > 0 ? Object.keys(data[0]) : [];
      const hasMediaId = columns.includes('media_id');
      const hasImageUrl = columns.includes('image_url');
      const hasLogoMediaId = columns.includes('logo_media_id');
      const hasFaviconMediaId = columns.includes('favicon_media_id');
      
      entityMatrix[entity.name] = {
        exists: true,
        record_count: data.length,
        columns,
        has_media_id: hasMediaId,
        has_image_url: hasImageUrl,
        has_logo_media_id: hasLogoMediaId,
        has_favicon_media_id: hasFaviconMediaId,
        sample: data.slice(0, 2)
      };
      
      console.log(`✅ ${entity.name}: ${data.length} records`);
      console.log(`   media_id: ${hasMediaId ? '✅' : '❌'}`);
      console.log(`   image_url: ${hasImageUrl ? '✅' : '❌'}`);
    }
  } catch (err) {
    entityMatrix[entity.name] = { error: err.message, exists: false };
    console.log(`❌ ${entity.name}: ${err.message}`);
  }
}

report.sections.entity_matrix = entityMatrix;
console.log();

// ============================================================
// 4. FOREIGN KEY CONSTRAINTS
// ============================================================
console.log('🔗 Section 4: Foreign Key Constraints\n');

const fkQuery = `
  SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
  FROM information_schema.table_constraints AS tc
  JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
    AND (
      kcu.column_name LIKE '%media_id%'
      OR ccu.table_name = 'media_assets'
    );
`;

const { data: fkData, error: fkError } = await supabase.rpc('exec_sql', {
  query: fkQuery
}).single();

if (!fkError && fkData) {
  report.sections.foreign_keys = fkData;
  console.log(`✅ Foreign keys found: ${fkData.length}`);
  fkData.forEach(fk => {
    console.log(`   ${fk.table_name}.${fk.column_name} → ${fk.foreign_table_name}.${fk.foreign_column_name}`);
  });
} else {
  report.sections.foreign_keys = { error: fkError?.message || 'No data' };
  console.log('⚠️  No foreign key data retrieved');
}
console.log();

// ============================================================
// 5. REFERENCE COUNT ANALYSIS
// ============================================================
console.log('🔢 Section 5: Reference Count Analysis\n');

const referenceCounts = {};

for (const [entityName, entityData] of Object.entries(entityMatrix)) {
  if (entityData.exists && entityData.has_media_id) {
    const { data, error } = await supabase
      .from(entityData.columns.includes('media_id') ? entityName : null)
      .select('media_id')
      .not('media_id', 'is', null);
    
    if (!error && data) {
      const mediaIdCounts = {};
      data.forEach(row => {
        mediaIdCounts[row.media_id] = (mediaIdCounts[row.media_id] || 0) + 1;
      });
      
      referenceCounts[entityName] = {
        total_refs: data.length,
        unique_media_ids: Object.keys(mediaIdCounts).length,
        reused_media_ids: Object.entries(mediaIdCounts)
          .filter(([_, count]) => count > 1)
          .map(([id, count]) => ({ media_id: id, ref_count: count }))
      };
      
      console.log(`✅ ${entityName}: ${data.length} references to ${Object.keys(mediaIdCounts).length} unique media_ids`);
      if (referenceCounts[entityName].reused_media_ids.length > 0) {
        console.log(`   ↳ ${referenceCounts[entityName].reused_media_ids.length} media_ids reused across multiple records`);
      }
    }
  }
}

report.sections.reference_counts = referenceCounts;
console.log();

// ============================================================
// 6. ORPHANED MEDIA ANALYSIS
// ============================================================
console.log('🗑️  Section 6: Orphaned Media Analysis\n');

if (mediaAssets && mediaAssets.length > 0) {
  const allReferencedMediaIds = new Set();
  
  for (const [entityName, refData] of Object.entries(referenceCounts)) {
    const { data } = await supabase
      .from(entityName)
      .select('media_id')
      .not('media_id', 'is', null);
    
    if (data) {
      data.forEach(row => allReferencedMediaIds.add(row.media_id));
    }
  }
  
  const orphanedAssets = mediaAssets.filter(asset => !allReferencedMediaIds.has(asset.id));
  
  report.sections.orphaned_media = {
    total_media_assets: mediaAssets.length,
    referenced: allReferencedMediaIds.size,
    orphaned: orphanedAssets.length,
    orphaned_samples: orphanedAssets.slice(0, 10).map(a => ({
      id: a.id,
      path: a.path,
      original_name: a.original_name,
      created_at: a.created_at
    }))
  };
  
  console.log(`✅ Total media_assets: ${mediaAssets.length}`);
  console.log(`   Referenced: ${allReferencedMediaIds.size}`);
  console.log(`   Orphaned: ${orphanedAssets.length}\n`);
}

// ============================================================
// 7. STORAGE BUCKET AUDIT
// ============================================================
console.log('🗄️  Section 7: Storage Bucket Audit\n');

const { data: buckets, error: bucketsError } = await supabase
  .storage
  .listBuckets();

if (!bucketsError && buckets) {
  report.sections.storage_buckets = buckets.map(b => ({
    id: b.id,
    name: b.name,
    public: b.public
  }));
  console.log(`✅ Buckets found: ${buckets.length}`);
  buckets.forEach(b => {
    console.log(`   ${b.name} (${b.public ? 'public' : 'private'})`);
  });
} else {
  report.sections.storage_buckets = { error: bucketsError?.message };
  console.log('❌ Could not list buckets');
}
console.log();

// ============================================================
// 8. LEGACY FIELD USAGE
// ============================================================
console.log('🔍 Section 8: Legacy Field Usage\n');

const legacyFields = {};

for (const [entityName, entityData] of Object.entries(entityMatrix)) {
  if (entityData.exists) {
    const legacy = {
      has_image_url: entityData.has_image_url,
      has_media_id: entityData.has_media_id
    };
    
    if (legacy.has_image_url || legacy.has_media_id) {
      const { data } = await supabase
        .from(entityName)
        .select('id, image_url, media_id')
        .limit(100);
      
      if (data) {
        legacy.image_url_populated = data.filter(r => r.image_url).length;
        legacy.media_id_populated = data.filter(r => r.media_id).length;
        legacy.both_populated = data.filter(r => r.image_url && r.media_id).length;
        legacy.neither_populated = data.filter(r => !r.image_url && !r.media_id).length;
      }
    }
    
    legacyFields[entityName] = legacy;
    
    if (legacy.has_image_url || legacy.has_media_id) {
      console.log(`${entityName}:`);
      console.log(`   image_url populated: ${legacy.image_url_populated || 0}`);
      console.log(`   media_id populated: ${legacy.media_id_populated || 0}`);
      console.log(`   both: ${legacy.both_populated || 0}`);
      console.log(`   neither: ${legacy.neither_populated || 0}`);
    }
  }
}

report.sections.legacy_fields = legacyFields;
console.log();

// ============================================================
// 9. WRITE REPORT
// ============================================================
const reportPath = path.join(__dirname, '..', 'PHASE0_CANONICAL_MEDIA_AUDIT.json');
await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

console.log('✅ Phase 0 audit complete');
console.log(`📄 Report written to: PHASE0_CANONICAL_MEDIA_AUDIT.json\n`);

process.exit(0);
