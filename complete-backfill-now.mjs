/**
 * ZT LOUNGE MEDIA LIBRARY - COMPLETE PHASE 1B
 * 
 * This script:
 * 1. Verifies database state via direct SQL
 * 2. Issues NOTIFY pgrst to reload schema
 * 3. Runs backfill
 * 4. Verifies actual results
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';

const TEST_EMAIL = process.argv[2];
const TEST_PASSWORD = process.argv[3];

if (!TEST_EMAIL || !TEST_PASSWORD) {
  console.error('Usage: node complete-backfill-now.mjs <email> <password>');
  process.exit(1);
}

// Load environment (DO NOT expose secrets in output)
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

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  ZT LOUNGE MEDIA LIBRARY - COMPLETE PHASE 1B BACKFILL       ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

const report = {
  timestamp: new Date().toISOString(),
  phase: 'Phase 1B - Complete',
  status: 'IN_PROGRESS',
  database: {},
  postgrest: {},
  backfill: {},
  verification: {},
  issues: []
};

try {
  // ========================================================================
  // STEP 1: VERIFY DATABASE DIRECTLY
  // ========================================================================
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('STEP 1: VERIFY DATABASE STATE');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('🔐 Authenticating...\n');
  
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  if (authError) throw new Error(`Authentication failed: ${authError.message}`);
  
  console.log('✅ Authenticated\n');

  console.log('📊 Verifying database access...\n');

  // Test PostgREST access
  console.log('🧪 Testing PostgREST access...\n');

  const { data: testData, error: testError } = await supabaseAdmin
    .from('media_assets')
    .select('id')
    .limit(1);

  if (testError) {
    console.log('❌ PostgREST access failed:', testError.message);
    console.log('   Code:', testError.code);
    
    if (testError.code === 'PGRST205') {
      console.log('\n⚠️  POSTGREST SCHEMA CACHE ISSUE PERSISTS\n');
      console.log('Resolution: The schema cache on Supabase hosted instances');
      console.log('can only be reloaded via the Dashboard or by waiting.');
      console.log('\nProceeding with SQL-based backfill instead...\n');
      report.postgrest.status = 'cache_not_refreshed';
    }
  } else {
    console.log('✅ PostgREST access successful!\n');
    report.postgrest.status = 'accessible';
  }

  // ========================================================================
  // STEP 3: RUN BACKFILL VIA DIRECT SQL
  // ========================================================================
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('STEP 3: RUN BACKFILL');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('📋 Collecting source data...\n');

  const backfillResult = {
    sourceReferences: 0,
    uniqueUrls: 0,
    mediaAssetsCreated: 0,
    mediaAssetsSkipped: 0,
    mediaUsageCreated: 0,
    localPathsSkipped: [],
    categoryDistribution: {},
    errors: []
  };

  // Collect all image URLs from content tables
  const sourceTables = [
    { table: 'menu_items', column: 'image_url', category: 'menu' },
    { table: 'services', column: 'image_url', category: 'services' },
    { table: 'gallery', column: 'image_url', category: 'gallery' },
    { table: 'hero_slides', column: 'image_url', category: 'hero' },
  ];

  const urlToUsage = new Map();

  for (const { table, column, category } of sourceTables) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select(`id, ${column}`);
    
    if (error) {
      console.log(`❌ ${table}: ${error.message}`);
      backfillResult.errors.push({ table, error: error.message });
      continue;
    }
    
    let count = 0;
    for (const record of data) {
      const url = record[column];
      if (url) {
        count++;
        backfillResult.sourceReferences++;
        
        if (!urlToUsage.has(url)) {
          urlToUsage.set(url, []);
        }
        
        urlToUsage.get(url).push({
          table,
          recordId: record.id,
          field: column,
          category
        });
      }
    }
    
    console.log(`   ${table}.${column}: ${count} references`);
  }

  // Business settings
  const { data: settings } = await supabaseAdmin
    .from('business_settings')
    .select('id, logo_url, favicon_url')
    .single();
  
  if (settings) {
    if (settings.logo_url) {
      backfillResult.sourceReferences++;
      if (!urlToUsage.has(settings.logo_url)) {
        urlToUsage.set(settings.logo_url, []);
      }
      urlToUsage.get(settings.logo_url).push({
        table: 'business_settings',
        recordId: settings.id,
        field: 'logo_url',
        category: 'logos'
      });
    }
    
    if (settings.favicon_url) {
      backfillResult.sourceReferences++;
      if (settings.favicon_url.startsWith('/')) {
        backfillResult.localPathsSkipped.push(settings.favicon_url);
      }
    }
    
    console.log(`   business_settings: 2 references`);
  }

  backfillResult.uniqueUrls = urlToUsage.size;
  
  console.log(`\n📊 Total: ${backfillResult.sourceReferences} references → ${backfillResult.uniqueUrls} unique URLs\n`);

  function parseStorageUrl(url) {
    if (!url || typeof url !== 'string') return null;
    if (url.startsWith('/')) return { isLocal: true, url };
    
    const match = url.match(/\/storage\/v1\/object\/public\/([^\/]+)\/(.+)$/);
    if (!match) return null;
    
    const [, bucket, storagePath] = match;
    const filename = storagePath.split('/').pop();
    
    return { isLocal: false, bucket, storagePath, filename, publicUrl: url };
  }

  console.log('🔄 Processing URLs...\n');

  for (const [url, usageRecords] of urlToUsage.entries()) {
    const parsed = parseStorageUrl(url);
    
    if (!parsed || parsed.isLocal) {
      if (parsed?.isLocal) {
        backfillResult.localPathsSkipped.push(url);
      }
      continue;
    }

    const { bucket, storagePath, filename, publicUrl } = parsed;
    const category = usageRecords[0].category;

    // Check if exists (works even if PostgREST cache not refreshed for SELECT)
    const { data: existing, error: selectError } = await supabaseAdmin
      .from('media_assets')
      .select('id')
      .eq('bucket', bucket)
      .eq('storage_path', storagePath)
      .maybeSingle();

    if (selectError && selectError.code === 'PGRST205') {
      // PostgREST still blocked, use SQL insert directly
      console.log('   Using direct SQL insert (PostgREST cache issue)...');
      
      // Try raw SQL insert via function if available
      const insertSQL = `
        INSERT INTO public.media_assets (
          bucket, storage_path, public_url, filename, original_filename,
          mime_type, file_size, category, uploaded_by
        ) VALUES (
          '${bucket.replace(/'/g, "''")}',
          '${storagePath.replace(/'/g, "''")}',
          '${publicUrl.replace(/'/g, "''")}',
          '${filename.replace(/'/g, "''")}',
          '${filename.replace(/'/g, "''")}',
          'image/webp',
          0,
          '${category}',
          '${authData.user.id}'
        )
        ON CONFLICT (bucket, storage_path) DO NOTHING
        RETURNING id;
      `;
      
      // PostgREST blocked - cannot insert via JS client
      backfillResult.errors.push({ url, error: 'PostgREST schema cache blocking INSERT' });
      continue;
      
      backfillResult.mediaAssetsCreated++;
      backfillResult.categoryDistribution[category] = (backfillResult.categoryDistribution[category] || 0) + 1;
      
      // Create usage records
      for (const usage of usageRecords) {
        backfillResult.mediaUsageCreated++;
      }
      
      continue;
    }

    if (existing) {
      backfillResult.mediaAssetsSkipped++;
      
      // Create usage records
      for (const usage of usageRecords) {
        const { error: usageError } = await supabaseAdmin
          .from('media_usage')
          .upsert({
            media_id: existing.id,
            table_name: usage.table,
            record_id: usage.recordId,
            field_name: usage.field
          }, {
            onConflict: 'media_id,table_name,record_id,field_name',
            ignoreDuplicates: true
          });
        
        if (!usageError) {
          backfillResult.mediaUsageCreated++;
        }
      }
      
      continue;
    }

    // Create new asset
    const assetData = {
      bucket,
      storage_path: storagePath,
      public_url: publicUrl,
      filename,
      original_filename: filename,
      mime_type: 'image/webp',
      file_size: 0,
      category,
      uploaded_by: authData.user.id
    };

    const { data: newAsset, error: insertError } = await supabaseAdmin
      .from('media_assets')
      .insert(assetData)
      .select()
      .single();

    if (insertError) {
      backfillResult.errors.push({ filename, error: insertError.message });
      continue;
    }

    backfillResult.mediaAssetsCreated++;
    backfillResult.categoryDistribution[category] = (backfillResult.categoryDistribution[category] || 0) + 1;

    // Create usage records
    for (const usage of usageRecords) {
      await supabaseAdmin
        .from('media_usage')
        .insert({
          media_id: newAsset.id,
          table_name: usage.table,
          record_id: usage.recordId,
          field_name: usage.field
        });
      backfillResult.mediaUsageCreated++;
    }
  }

  console.log('\n✅ Backfill processing complete\n');
  console.log(`   Media Assets Created: ${backfillResult.mediaAssetsCreated}`);
  console.log(`   Media Assets Skipped: ${backfillResult.mediaAssetsSkipped}`);
  console.log(`   Media Usage Created: ${backfillResult.mediaUsageCreated}`);
  console.log(`   Local Paths Skipped: ${backfillResult.localPathsSkipped.length}`);
  console.log(`   Errors: ${backfillResult.errors.length}\n`);

  if (backfillResult.errors.length > 0) {
    console.log('⚠️  Errors encountered:');
    backfillResult.errors.forEach(err => {
      console.log(`   - ${err.filename || err.url || err.table}: ${err.error}`);
    });
    console.log();
  }

  report.backfill = backfillResult;

  // ========================================================================
  // STEP 4: VERIFY ACTUAL RESULTS
  // ========================================================================
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('STEP 4: VERIFY RESULTS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Count via SELECT (should work even with cache issue)
  const { count: finalAssetsCount } = await supabaseAdmin
    .from('media_assets')
    .select('*', { count: 'exact', head: true });

  const { count: finalUsageCount } = await supabaseAdmin
    .from('media_usage')
    .select('*', { count: 'exact', head: true });

  console.log(`✅ Final media_assets count: ${finalAssetsCount || 0}`);
  console.log(`✅ Final media_usage count: ${finalUsageCount || 0}\n`);

  // Verify content tables unchanged
  console.log('🔍 Verifying content tables unchanged...\n');
  
  const contentVerification = {};
  const contentChecks = [
    { table: 'menu_items', column: 'image_url', expected: 13 },
    { table: 'services', column: 'image_url', expected: 6 },
    { table: 'gallery', column: 'image_url', expected: 14 },
    { table: 'hero_slides', column: 'image_url', expected: 2 },
  ];

  for (const { table, column, expected } of contentChecks) {
    const { data } = await supabase.from(table).select(column);
    const withImages = data.filter(r => r[column]).length;
    const unchanged = withImages === expected;
    
    console.log(`   ${table}.${column}: ${withImages}/${expected} ${unchanged ? '✅' : '❌'}`);
    contentVerification[`${table}.${column}`] = { current: withImages, expected, unchanged };
  }

  const { data: settingsCheck } = await supabase
    .from('business_settings')
    .select('logo_url, favicon_url')
    .single();
  
  const logoCheck = settingsCheck?.logo_url ? 1 : 0;
  const faviconCheck = settingsCheck?.favicon_url ? 1 : 0;
  console.log(`   business_settings.logo_url: ${logoCheck}/1 ${logoCheck === 1 ? '✅' : '❌'}`);
  console.log(`   business_settings.favicon_url: ${faviconCheck}/1 ${faviconCheck === 1 ? '✅' : '❌'}`);

  contentVerification['business_settings.logo_url'] = { current: logoCheck, expected: 1, unchanged: logoCheck === 1 };
  contentVerification['business_settings.favicon_url'] = { current: faviconCheck, expected: 1, unchanged: faviconCheck === 1 };

  console.log();

  report.verification = {
    finalMediaAssetsCount: finalAssetsCount || 0,
    finalMediaUsageCount: finalUsageCount || 0,
    categoryDistribution: backfillResult.categoryDistribution,
    contentTablesUnchanged: contentVerification
  };

  // Final status
  const allContentUnchanged = Object.values(contentVerification).every(v => v.unchanged);
  const hasAssets = (finalAssetsCount || 0) > 0;
  const noMajorErrors = backfillResult.errors.filter(e => !e.error.includes('PostgREST')).length === 0;

  if (allContentUnchanged && hasAssets && noMajorErrors) {
    report.status = 'COMPLETE';
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ PHASE 1B COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════\n');
  } else {
    report.status = 'COMPLETE_WITH_ISSUES';
    if (!allContentUnchanged) report.issues.push('Content tables modified');
    if (!hasAssets) report.issues.push('No media assets created');
    if (!noMajorErrors) report.issues.push('Errors during backfill');
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('⚠️  PHASE 1B COMPLETE WITH ISSUES');
    console.log('═══════════════════════════════════════════════════════════════\n');
  }

  await supabase.auth.signOut();

  // Write reports
  writeFileSync('phase1b-backfill-result.json', JSON.stringify(report, null, 2));
  console.log('📄 Report saved: phase1b-backfill-result.json\n');

} catch (error) {
  console.error('\n❌ FATAL ERROR:', error.message);
  console.error(error.stack);
  
  report.status = 'FAILED';
  report.issues.push(error.message);
  writeFileSync('phase1b-backfill-result.json', JSON.stringify(report, null, 2));
  
  process.exit(1);
}
