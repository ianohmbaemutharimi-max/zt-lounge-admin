/**
 * ZT LOUNGE ADMIN — MEDIA LIBRARY FINAL AUDIT
 * 
 * READ-ONLY verification of production media library state
 * 
 * Usage: node media-library-final-audit.mjs <email> <password>
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const TEST_EMAIL = process.argv[2];
const TEST_PASSWORD = process.argv[3];

if (!TEST_EMAIL || !TEST_PASSWORD) {
  console.error('Usage: node media-library-final-audit.mjs <email> <password>');
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

const results = {
  database: {},
  mediaAssets: {},
  mediaUsage: {},
  originalData: {},
  storage: {},
  rls: {},
  postgrest: {},
  migration: {}
};

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  ZT LOUNGE — MEDIA LIBRARY FINAL AUDIT (READ-ONLY)         ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

try {
  // ============================================================
  // 1. DATABASE EXISTENCE VERIFICATION
  // ============================================================
  console.log('═'.repeat(62));
  console.log('1. DATABASE EXISTENCE VERIFICATION');
  console.log('═'.repeat(62) + '\n');

  // Try direct table query
  const { data: assetsExists, error: assetsError } = await supabaseAdmin
    .from('media_assets')
    .select('id', { count: 'exact', head: true });

  const { data: usageExists, error: usageError } = await supabaseAdmin
    .from('media_usage')
    .select('id', { count: 'exact', head: true });

  results.database.mediaAssetsExists = !assetsError;
  results.database.mediaUsageExists = !usageError;
  results.database.assetsError = assetsError?.message || null;
  results.database.usageError = usageError?.message || null;

  console.log('📊 Table Existence Check:');
  console.log(`   media_assets: ${results.database.mediaAssetsExists ? '✅ EXISTS' : '❌ MISSING'}`);
  if (assetsError) console.log(`   Error: ${assetsError.message}`);
  console.log(`   media_usage:  ${results.database.mediaUsageExists ? '✅ EXISTS' : '❌ MISSING'}`);
  if (usageError) console.log(`   Error: ${usageError.message}`);
  console.log();

  if (!results.database.mediaAssetsExists || !results.database.mediaUsageExists) {
    console.log('❌ FATAL: Required tables missing. Cannot proceed with audit.\n');
    results.verdict = '🔴 NOT PRODUCTION READY';
    console.log(JSON.stringify(results, null, 2));
    process.exit(1);
  }

  // Get column information
  const { data: assetsColumns } = await supabaseAdmin
    .from('media_assets')
    .select('*')
    .limit(1);

  const { data: usageColumns } = await supabaseAdmin
    .from('media_usage')
    .select('*')
    .limit(1);

  if (assetsColumns && assetsColumns[0]) {
    results.database.mediaAssetsColumns = Object.keys(assetsColumns[0]);
    console.log('📋 media_assets columns:', results.database.mediaAssetsColumns.join(', '));
  }

  if (usageColumns && usageColumns[0]) {
    results.database.mediaUsageColumns = Object.keys(usageColumns[0]);
    console.log('📋 media_usage columns:', results.database.mediaUsageColumns.join(', '));
  }
  console.log();

  // ============================================================
  // 2. MEDIA_ASSETS DATA AUDIT
  // ============================================================
  console.log('═'.repeat(62));
  console.log('2. MEDIA_ASSETS DATA AUDIT');
  console.log('═'.repeat(62) + '\n');

  const { data: allAssets, error: assetsQueryError, count: assetsCount } = await supabaseAdmin
    .from('media_assets')
    .select('*', { count: 'exact' });

  results.mediaAssets.totalCount = assetsCount;
  results.mediaAssets.expected = 36;
  results.mediaAssets.actual = assetsCount;

  console.log(`📊 Total media_assets records: ${assetsCount}`);
  console.log(`   Expected: 36`);
  console.log(`   Match: ${assetsCount === 36 ? '✅ YES' : '⚠️ NO'}\n`);

  if (allAssets) {
    // Group by category
    const byCategory = {};
    const byBucket = {};
    const duplicatePaths = new Map();
    const duplicateUrls = new Map();

    allAssets.forEach(asset => {
      // By category
      byCategory[asset.category] = (byCategory[asset.category] || 0) + 1;
      
      // By bucket
      byBucket[asset.bucket] = (byBucket[asset.bucket] || 0) + 1;

      // Check duplicates
      const pathKey = `${asset.bucket}/${asset.storage_path}`;
      duplicatePaths.set(pathKey, (duplicatePaths.get(pathKey) || 0) + 1);
      duplicateUrls.set(asset.public_url, (duplicateUrls.get(asset.public_url) || 0) + 1);
    });

    results.mediaAssets.byCategory = byCategory;
    results.mediaAssets.byBucket = byBucket;

    console.log('📂 Breakdown by category:');
    Object.entries(byCategory).forEach(([cat, count]) => {
      console.log(`   ${cat}: ${count}`);
    });
    console.log();

    console.log('🪣 Breakdown by bucket:');
    Object.entries(byBucket).forEach(([bucket, count]) => {
      console.log(`   ${bucket}: ${count}`);
    });
    console.log();

    // Check for duplicates
    const dupPaths = Array.from(duplicatePaths.entries()).filter(([_, count]) => count > 1);
    const dupUrls = Array.from(duplicateUrls.entries()).filter(([_, count]) => count > 1);

    results.mediaAssets.duplicatePaths = dupPaths.length;
    results.mediaAssets.duplicateUrls = dupUrls.length;

    if (dupPaths.length > 0) {
      console.log(`⚠️  Found ${dupPaths.length} duplicate storage paths:`);
      dupPaths.forEach(([path, count]) => console.log(`   ${path} (${count}x)`));
      console.log();
    } else {
      console.log('✅ No duplicate storage paths\n');
    }

    if (dupUrls.length > 0) {
      console.log(`⚠️  Found ${dupUrls.length} duplicate public URLs:`);
      dupUrls.slice(0, 5).forEach(([url, count]) => console.log(`   ${url.substring(0, 60)}... (${count}x)`));
      console.log();
    } else {
      console.log('✅ No duplicate public URLs\n');
    }

    // Check for missing required fields
    const invalidRecords = allAssets.filter(a => 
      !a.bucket || !a.storage_path || !a.public_url || !a.filename || !a.mime_type
    );

    results.mediaAssets.invalidRecords = invalidRecords.length;
    if (invalidRecords.length > 0) {
      console.log(`⚠️  Found ${invalidRecords.length} invalid records with missing fields\n`);
    } else {
      console.log('✅ All records have required fields\n');
    }
  }

  // ============================================================
  // 3. MEDIA_USAGE AUDIT
  // ============================================================
  console.log('═'.repeat(62));
  console.log('3. MEDIA_USAGE AUDIT');
  console.log('═'.repeat(62) + '\n');

  const { data: allUsage, error: usageQueryError, count: usageCount } = await supabaseAdmin
    .from('media_usage')
    .select('*', { count: 'exact' });

  results.mediaUsage.totalCount = usageCount;
  console.log(`📊 Total media_usage records: ${usageCount}\n`);

  if (allUsage && allAssets) {
    const assetIds = new Set(allAssets.map(a => a.id));
    const orphanedUsage = allUsage.filter(u => !assetIds.has(u.media_asset_id));
    
    results.mediaUsage.orphaned = orphanedUsage.length;

    if (orphanedUsage.length > 0) {
      console.log(`⚠️  Found ${orphanedUsage.length} orphaned media_usage records\n`);
    } else {
      console.log('✅ All media_usage records reference valid media_assets\n');
    }

    // Group by source table
    const bySourceTable = {};
    allUsage.forEach(u => {
      bySourceTable[u.source_table] = (bySourceTable[u.source_table] || 0) + 1;
    });

    results.mediaUsage.bySourceTable = bySourceTable;

    console.log('📊 Usage by source table:');
    Object.entries(bySourceTable).forEach(([table, count]) => {
      console.log(`   ${table}: ${count}`);
    });
    console.log();
  }

  // ============================================================
  // 4. ORIGINAL DATA INTEGRITY CHECK
  // ============================================================
  console.log('═'.repeat(62));
  console.log('4. ORIGINAL DATA INTEGRITY CHECK');
  console.log('═'.repeat(62) + '\n');

  const tables = [
    { name: 'menu_items', column: 'image_url' },
    { name: 'services', column: 'image_url' },
    { name: 'gallery', column: 'image_url' },
    { name: 'hero_slides', column: 'image_url' },
  ];

  for (const { name, column } of tables) {
    const { data, error, count } = await supabaseAdmin
      .from(name)
      .select(`id, ${column}`, { count: 'exact' });

    if (!error && data) {
      const withImages = data.filter(r => r[column]).length;
      results.originalData[name] = {
        total: count,
        withImages,
        hasNulls: count - withImages
      };
      console.log(`📋 ${name}:`);
      console.log(`   Total records: ${count}`);
      console.log(`   With images: ${withImages}`);
      console.log(`   Without images: ${count - withImages}\n`);
    }
  }

  const { data: settings } = await supabaseAdmin
    .from('business_settings')
    .select('logo_url, favicon_url')
    .single();

  if (settings) {
    results.originalData.business_settings = {
      logo_url: !!settings.logo_url,
      favicon_url: !!settings.favicon_url
    };
    console.log('📋 business_settings:');
    console.log(`   logo_url: ${settings.logo_url ? '✅ Present' : '❌ Missing'}`);
    console.log(`   favicon_url: ${settings.favicon_url ? '✅ Present' : '❌ Missing'}\n`);
  }

  // ============================================================
  // 5. POSTGREST API VERIFICATION
  // ============================================================
  console.log('═'.repeat(62));
  console.log('5. POSTGREST API VERIFICATION');
  console.log('═'.repeat(62) + '\n');

  // Try authenticated READ
  const { data: testRead, error: readError } = await supabaseAdmin
    .from('media_assets')
    .select('id')
    .limit(1);

  results.postgrest.mediaAssetsReadable = !readError;
  results.postgrest.readError = readError?.message || null;

  console.log('🔌 PostgREST API Access:');
  console.log(`   media_assets READ: ${results.postgrest.mediaAssetsReadable ? '✅ SUCCESS' : '❌ FAILED'}`);
  if (readError) console.log(`   Error: ${readError.message}`);

  const { data: usageTestRead, error: usageReadError } = await supabaseAdmin
    .from('media_usage')
    .select('id')
    .limit(1);

  results.postgrest.mediaUsageReadable = !usageReadError;
  results.postgrest.usageReadError = usageReadError?.message || null;

  console.log(`   media_usage READ: ${results.postgrest.mediaUsageReadable ? '✅ SUCCESS' : '❌ FAILED'}`);
  if (usageReadError) console.log(`   Error: ${usageReadError.message}`);
  console.log();

  // ============================================================
  // FINAL SUMMARY
  // ============================================================
  console.log('═'.repeat(62));
  console.log('AUDIT SUMMARY');
  console.log('═'.repeat(62) + '\n');

  const checks = {
    'Tables exist': results.database.mediaAssetsExists && results.database.mediaUsageExists,
    'PostgREST accessible': results.postgrest.mediaAssetsReadable && results.postgrest.mediaUsageReadable,
    'Expected asset count (36)': results.mediaAssets.actual === 36,
    'No orphaned usage': results.mediaUsage.orphaned === 0,
    'No duplicate paths': results.mediaAssets.duplicatePaths === 0,
    'No invalid records': results.mediaAssets.invalidRecords === 0,
  };

  Object.entries(checks).forEach(([check, passed]) => {
    console.log(`${passed ? '✅' : '❌'} ${check}`);
  });
  console.log();

  const allPassed = Object.values(checks).every(v => v);
  results.verdict = allPassed ? '🟢 PRODUCTION READY' : '🟡 FUNCTIONAL BUT NEEDS FIXES';

  console.log(`Final Verdict: ${results.verdict}\n`);

  // Write results to file
  const timestamp = Date.now();
  const filename = `media-library-audit-results-${timestamp}.json`;
  const fs = await import('fs');
  fs.writeFileSync(filename, JSON.stringify(results, null, 2));
  console.log(`📄 Detailed results saved to: ${filename}\n`);

} catch (error) {
  console.error('\n❌ FATAL ERROR:', error.message);
  console.error(error.stack);
  results.fatalError = error.message;
  results.verdict = '🔴 NOT PRODUCTION READY';
  process.exit(1);
}
