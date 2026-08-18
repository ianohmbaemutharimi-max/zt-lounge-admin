/**
 * Backfill Media Assets
 * 
 * Imports existing 36 image references from content tables into media_assets
 * and tracks usage in media_usage table.
 * 
 * SAFETY:
 * - IDEMPOTENT: Safe to run multiple times
 * - READ-ONLY on content tables (never modifies image_url fields)
 * - NEVER deletes Storage objects
 * - Skips already-imported assets
 * 
 * Usage: node scripts/backfill-media-assets.mjs <email> <password> [--dry-run]
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import crypto from 'crypto';

const TEST_EMAIL = process.argv[2];
const TEST_PASSWORD = process.argv[3];
const DRY_RUN = process.argv.includes('--dry-run');

if (!TEST_EMAIL || !TEST_PASSWORD) {
  console.error('Usage: node scripts/backfill-media-assets.mjs <email> <password> [--dry-run]');
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

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  ZT LOUNGE - BACKFILL MEDIA LIBRARY                           ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

if (DRY_RUN) {
  console.log('⚠️  DRY RUN MODE - No database changes will be made\n');
}

const report = {
  timestamp: new Date().toISOString(),
  dryRun: DRY_RUN,
  sourceReferences: 0,
  uniqueUrls: 0,
  mediaAssetsCreated: 0,
  mediaAssetsSkipped: 0,
  mediaUsageCreated: 0,
  missingFiles: [],
  duplicateUrls: [],
  categoryDistribution: {},
  errors: []
};

// Define content tables with their image columns
const SOURCE_TABLES = [
  { table: 'menu_items', column: 'image_url', category: 'menu' },
  { table: 'services', column: 'image_url', category: 'services' },
  { table: 'gallery', column: 'image_url', category: 'gallery' },
  { table: 'hero_slides', column: 'image_url', category: 'hero' },
  { table: 'testimonials', column: 'image_url', category: 'testimonials' },
  { table: 'promotions', column: 'banner_image', category: 'promotions' },
  { table: 'staff', column: 'photo_url', category: 'staff' },
  { table: 'profiles', column: 'avatar_url', category: 'avatars' },
];

// Business settings special handling
const BUSINESS_SETTINGS = [
  { column: 'logo_url', category: 'logos' },
  { column: 'favicon_url', category: 'logos' }
];

/**
 * Parse Supabase Storage URL
 * Format: https://{project}.supabase.co/storage/v1/object/public/{bucket}/{path}
 */
function parseStorageUrl(url) {
  if (!url || typeof url !== 'string') return null;
  
  // Handle local paths (like /favicon.ico)
  if (url.startsWith('/')) {
    return { isLocal: true, url };
  }
  
  const match = url.match(/\/storage\/v1\/object\/public\/([^\/]+)\/(.+)$/);
  if (!match) return null;
  
  const [, bucket, storagePath] = match;
  const filename = storagePath.split('/').pop();
  
  return {
    isLocal: false,
    bucket,
    storagePath,
    filename,
    publicUrl: url
  };
}

/**
 * Get file metadata from Storage
 */
async function getStorageMetadata(bucket, path) {
  try {
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .list('', {
        limit: 1000,
        search: path
      });
    
    if (error) {
      return { error: error.message };
    }
    
    const file = data?.find(f => f.name === path || path.endsWith(f.name));
    if (!file) {
      return { error: 'File not found in storage' };
    }
    
    return {
      size: file.metadata?.size || 0,
      mimeType: file.metadata?.mimetype || 'image/webp',
      width: null,
      height: null
    };
  } catch (error) {
    return { error: error.message };
  }
}

try {
  console.log('🔐 Authenticating...\n');
  
  const { data: authData, error: authError } = await createClient(
    SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ).auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  if (authError) {
    console.error('❌ Authentication failed:', authError.message);
    process.exit(1);
  }
  
  console.log('✅ Authenticated as:', authData.user.email);
  console.log('   User ID:', authData.user.id, '\n');

  // Step 1: Collect all image URLs from source tables
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('STEP 1: COLLECTING IMAGE URLS FROM SOURCE TABLES');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const urlToRecords = new Map(); // url -> [{table, recordId, field, category}]

  // Process regular tables
  for (const { table, column, category } of SOURCE_TABLES) {
    console.log(`📋 Scanning ${table}.${column}...`);
    
    const { data, error } = await supabaseAdmin
      .from(table)
      .select(`id, ${column}`);
    
    if (error) {
      console.log(`   ❌ Error: ${error.message}`);
      report.errors.push({ table, column, error: error.message });
      continue;
    }
    
    let count = 0;
    for (const record of data) {
      const url = record[column];
      if (url) {
        count++;
        report.sourceReferences++;
        
        if (!urlToRecords.has(url)) {
          urlToRecords.set(url, []);
        }
        
        urlToRecords.get(url).push({
          table,
          recordId: record.id,
          field: column,
          category
        });
      }
    }
    
    console.log(`   ✅ Found ${count} references`);
  }

  // Process business_settings
  console.log(`📋 Scanning business_settings...`);
  const { data: settingsData, error: settingsError } = await supabaseAdmin
    .from('business_settings')
    .select('id, logo_url, favicon_url')
    .single();
  
  if (settingsError) {
    console.log(`   ❌ Error: ${settingsError.message}`);
  } else {
    for (const { column, category } of BUSINESS_SETTINGS) {
      const url = settingsData[column];
      if (url) {
        report.sourceReferences++;
        
        if (!urlToRecords.has(url)) {
          urlToRecords.set(url, []);
        }
        
        urlToRecords.get(url).push({
          table: 'business_settings',
          recordId: settingsData.id,
          field: column,
          category
        });
      }
    }
    console.log(`   ✅ Found logo_url and favicon_url`);
  }

  report.uniqueUrls = urlToRecords.size;
  
  console.log(`\n📊 Summary: ${report.sourceReferences} references → ${report.uniqueUrls} unique URLs\n`);

  // Find duplicates
  for (const [url, records] of urlToRecords.entries()) {
    if (records.length > 1) {
      report.duplicateUrls.push({
        url,
        usageCount: records.length,
        tables: [...new Set(records.map(r => r.table))]
      });
    }
  }

  if (report.duplicateUrls.length > 0) {
    console.log(`🔄 Duplicate URLs detected: ${report.duplicateUrls.length} images used in multiple places\n`);
  }

  // Step 2: Process each unique URL
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('STEP 2: CREATING MEDIA_ASSETS RECORDS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  for (const [url, usageRecords] of urlToRecords.entries()) {
    const parsed = parseStorageUrl(url);
    
    if (!parsed) {
      console.log(`⚠️  Skipping unparseable URL: ${url.substring(0, 60)}...`);
      report.errors.push({ url, error: 'Could not parse URL' });
      continue;
    }

    if (parsed.isLocal) {
      console.log(`⚠️  Skipping local path: ${url}`);
      continue;
    }

    const { bucket, storagePath, filename, publicUrl } = parsed;
    const category = usageRecords[0].category;

    // Check if already exists
    const { data: existing } = await supabaseAdmin
      .from('media_assets')
      .select('id')
      .eq('bucket', bucket)
      .eq('path', storagePath)
      .single();

    if (existing) {
      console.log(`⏩ ${filename} (already exists)`);
      report.mediaAssetsSkipped++;
      
      // Ensure usage records exist
      for (const usage of usageRecords) {
        if (!DRY_RUN) {
          await supabaseAdmin
            .from('media_usage')
            .upsert({
              media_asset_id: existing.id,
              source_table: usage.table,
              source_record_id: usage.recordId,
              source_column: usage.field,
              source_url: url
            }, {
              onConflict: 'media_asset_id,source_table,source_record_id,source_column'
            });
          report.mediaUsageCreated++;
        }
      }
      
      continue;
    }

    // Get metadata
    const metadata = await getStorageMetadata(bucket, filename);
    
    if (metadata.error) {
      console.log(`❌ ${filename} - Storage error: ${metadata.error}`);
      report.missingFiles.push({ bucket, path: storagePath, url });
      continue;
    }

    // Create media_assets record
    const assetData = {
      bucket,
      path: storagePath,
      public_url: publicUrl,
      original_name: category,  // Store category in original_name for tracking
      mime_type: metadata.mimeType,
      file_size: metadata.size,
      width: metadata.width,
      height: metadata.height,
      uploaded_by: authData.user.id,
      content_hash: null // Will calculate later if needed
    };

    if (DRY_RUN) {
      console.log(`✅ ${filename} (${category}) [DRY RUN]`);
    } else {
      const { data: newAsset, error: insertError } = await supabaseAdmin
        .from('media_assets')
        .insert(assetData)
        .select()
        .single();

      if (insertError) {
        console.log(`❌ ${filename} - Insert error: ${insertError.message}`);
        report.errors.push({ filename, error: insertError.message });
        continue;
      }

      console.log(`✅ ${filename} (${category})`);
      report.mediaAssetsCreated++;

      // Create usage records
      for (const usage of usageRecords) {
        await supabaseAdmin
          .from('media_usage')
          .insert({
            media_asset_id: newAsset.id,
            source_table: usage.table,
            source_record_id: usage.recordId,
            source_column: usage.field,
            source_url: publicUrl
          });
        report.mediaUsageCreated++;
      }
    }

    // Update category distribution
    report.categoryDistribution[category] = (report.categoryDistribution[category] || 0) + 1;
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('BACKFILL COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log(`📊 Source References: ${report.sourceReferences}`);
  console.log(`📊 Unique URLs: ${report.uniqueUrls}`);
  console.log(`✅ Media Assets Created: ${report.mediaAssetsCreated}`);
  console.log(`⏩ Media Assets Skipped: ${report.mediaAssetsSkipped}`);
  console.log(`🔗 Media Usage Records: ${report.mediaUsageCreated}`);
  console.log(`❌ Missing Files: ${report.missingFiles.length}`);
  console.log(`🔄 Duplicate URLs: ${report.duplicateUrls.length}\n`);

  if (Object.keys(report.categoryDistribution).length > 0) {
    console.log('📁 Category Distribution:');
    for (const [category, count] of Object.entries(report.categoryDistribution)) {
      console.log(`   ${category}: ${count}`);
    }
    console.log();
  }

  if (report.missingFiles.length > 0) {
    console.log('⚠️  Missing Storage Files:');
    report.missingFiles.forEach(f => {
      console.log(`   ${f.bucket}/${f.path}`);
    });
    console.log();
  }

  if (report.errors.length > 0) {
    console.log('❌ Errors Encountered:');
    report.errors.forEach(e => {
      console.log(`   ${e.table || e.filename || e.url}: ${e.error}`);
    });
    console.log();
  }

  // Write report
  const reportFilename = `backfill-media-assets-report-${Date.now()}.json`;
  writeFileSync(reportFilename, JSON.stringify(report, null, 2));
  console.log(`📄 Report saved: ${reportFilename}\n`);

  if (DRY_RUN) {
    console.log('ℹ️  This was a DRY RUN. No changes were made to the database.');
    console.log('   Remove --dry-run to apply changes.\n');
  } else {
    console.log('✅ Backfill completed successfully!\n');
  }

} catch (error) {
  console.error('\n❌ BACKFILL FAILED:', error.message);
  console.error(error.stack);
  process.exit(1);
}
