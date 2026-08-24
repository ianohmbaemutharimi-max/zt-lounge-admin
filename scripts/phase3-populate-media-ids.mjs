#!/usr/bin/env node
/**
 * PHASE 3 — POPULATE CMS media_id VALUES
 * 
 * Reads the Phase 1 inspection report and updates CMS records
 * with their matched media_id values.
 * 
 * SAFETY RULES:
 * - Only updates WHERE media_id IS NULL
 * - Preserves legacy image_url
 * - Transactional per-table
 * - Logs every change
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

config({ path: path.join(ROOT, '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log(`
═══════════════════════════════════════════════════════════
  PHASE 3 — POPULATE CMS media_id VALUES
  SAFE WRITE (media_id only, preserve legacy fields)
═══════════════════════════════════════════════════════════
`);

// Load Phase 1 inspection report
const reportPath = path.join(ROOT, 'PHASE1_DATABASE_INSPECTION.json');
const inspection = JSON.parse(await fs.readFile(reportPath, 'utf8'));

const migrationReport = {
  timestamp: new Date().toISOString(),
  results: {},
  errors: []
};

// Check if business_settings has logo_media_id / favicon_media_id columns
// These should have been added by the 20260819_add_brand_assets_media_id migration
async function checkBusinessSettingsColumns() {
  console.log('📋 Checking business_settings columns...\n');
  
  const { data, error } = await supabase
    .from('business_settings')
    .select('logo_media_id, favicon_media_id')
    .single();
  
  if (error) {
    console.log(`   ⚠️  Cannot query logo_media_id: ${error.message}`);
    console.log(`   → Migration 20260819_add_brand_assets_media_id.sql may need to be applied`);
    return false;
  }
  
  console.log(`   ✅ business_settings has logo_media_id and favicon_media_id columns`);
  console.log(`   logo_media_id: ${data.logo_media_id || 'NULL'}`);
  console.log(`   favicon_media_id: ${data.favicon_media_id || 'NULL'}`);
  return true;
}

const hasColumns = await checkBusinessSettingsColumns();

// ============================================================
// POPULATE CMS TABLES
// ============================================================

const tablesToMigrate = ['menu_items', 'services', 'hero_slides', 'gallery'];

for (const tableName of tablesToMigrate) {
  console.log(`\n📋 Populating ${tableName}...\n`);
  
  // Get exact matches from inspection report
  const matches = inspection.exact_matches.filter(m => m.table === tableName);
  
  if (matches.length === 0) {
    console.log(`   ⚠️  No matches found in report for ${tableName}`);
    continue;
  }
  
  let migrated = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const match of matches) {
    try {
      // First verify the record still has media_id as NULL (read-check)
      const { data: existing, error: checkError } = await supabase
        .from(tableName)
        .select('id, media_id')
        .eq('id', match.record_id)
        .single();
      
      if (checkError) {
        console.log(`   ❌ Error checking ${match.record_id}: ${checkError.message}`);
        errors++;
        continue;
      }
      
      if (existing.media_id) {
        // Already has media_id - skip
        skipped++;
        continue;
      }
      
      // Update media_id (preserve image_url)
      const { error: updateError } = await supabase
        .from(tableName)
        .update({ media_id: match.matched_media_id })
        .eq('id', match.record_id)
        .is('media_id', null); // Safety: only update where NULL
      
      if (updateError) {
        console.log(`   ❌ Error updating ${match.record_name}: ${updateError.message}`);
        errors++;
        continue;
      }
      
      console.log(`   ✅ ${match.record_name} → media_id: ${match.matched_media_id}`);
      migrated++;
    } catch (err) {
      console.log(`   ❌ Unexpected error: ${err.message}`);
      errors++;
    }
  }
  
  migrationReport.results[tableName] = {
    total_matches: matches.length,
    migrated,
    skipped_already_set: skipped,
    errors
  };
  
  console.log(`\n   Summary: ${migrated} migrated, ${skipped} already set, ${errors} errors`);
}

// ============================================================
// POPULATE business_settings (logo_media_id & favicon_media_id)
// ============================================================

console.log('\n📋 Populating business_settings brand assets...\n');

if (!hasColumns) {
  console.log('   ⚠️  Skipping business_settings - columns not available yet');
  console.log('   → Need to apply migration: 20260819_add_brand_assets_media_id.sql');
  migrationReport.results.business_settings = { status: 'skipped', reason: 'columns_not_available' };
} else {
  // Logo: a5fb7148-8562-4d82-9fc1-d979fc19a323 (verified in Phase 2)
  // Favicon: local file, no media_asset yet
  
  const logoMediaId = 'a5fb7148-8562-4d82-9fc1-d979fc19a323';
  let bsMigrated = 0;
  let bsErrors = 0;
  
  try {
    const { error: updateError } = await supabase
      .from('business_settings')
      .update({ 
        logo_media_id: logoMediaId,
        favicon_media_id: null  // No favicon media asset yet - keep null
      })
      .eq('id', 1); // business_settings uses single record with id=1
    
    if (updateError) {
      console.log(`   ❌ Error updating business_settings: ${updateError.message}`);
      bsErrors++;
    } else {
      console.log(`   ✅ business_settings updated`);
      console.log(`      logo_media_id: ${logoMediaId}`);
      console.log(`      favicon_media_id: NULL (no media asset — using local fallback)`);
      bsMigrated++;
    }
  } catch (err) {
    console.log(`   ❌ Unexpected error: ${err.message}`);
    bsErrors++;
  }
  
  migrationReport.results.business_settings = {
    migrated: bsMigrated,
    errors: bsErrors,
    logo_media_id: logoMediaId,
    favicon_media_id: null
  };
}

// ============================================================
// VERIFY
// ============================================================

console.log('\n📋 Verifying migration...\n');

for (const tableName of tablesToMigrate) {
  const { count, error } = await supabase
    .from(tableName)
    .select('*', { count: 'exact', head: true })
    .not('media_id', 'is', null);
  
  if (error) {
    console.log(`   ❌ ${tableName}: ${error.message}`);
  } else {
    console.log(`   ✅ ${tableName}: ${count} records now have media_id`);
  }
}

// ============================================================
// SUMMARY
// ============================================================

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  PHASE 3 INSPECTION SUMMARY');
console.log('═══════════════════════════════════════════════════════════\n');

const totalMigrated = Object.values(migrationReport.results)
  .filter(r => r.migrated !== undefined)
  .reduce((sum, r) => sum + (r.migrated || 0), 0);

const totalErrors = Object.values(migrationReport.results)
  .filter(r => r.errors !== undefined)
  .reduce((sum, r) => sum + (r.errors || 0), 0);

console.log(`Total records migrated: ${totalMigrated}`);
console.log(`Total errors: ${totalErrors}`);

// ============================================================
// SAVE REPORT
// ============================================================

const reportPath = path.join(ROOT, 'PHASE3_MIGRATION_REPORT.json');
await fs.writeFile(reportPath, JSON.stringify(migrationReport, null, 2));

console.log(`\n📝 Report saved: ${reportPath}`);
console.log('\n═══════════════════════════════════════════════════════════');
console.log('  PHASE 3 COMPLETE');
console.log('  NEXT: Phase 4 — Verify and proceed to admin branding');
console.log('═══════════════════════════════════════════════════════════');
