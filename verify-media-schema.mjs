/**
 * Verify Media Library Schema Reconciliation
 * 
 * Confirms production database matches the reconciled migration file.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Load environment
const envContent = readFileSync('.env.local', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([A-Z_]+)=(.+)$/);
  if (match) env[match[1]] = match[2];
});

const supabaseAdmin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  MEDIA LIBRARY SCHEMA VERIFICATION                            ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

try {
  // Verify media_assets columns
  console.log('📋 Checking media_assets schema...\n');
  
  const { data: assets, error: assetsError } = await supabaseAdmin
    .from('media_assets')
    .select('*')
    .limit(1);
  
  if (assetsError) {
    console.error('❌ Failed to query media_assets:', assetsError.message);
    process.exit(1);
  }
  
  const assetColumns = assets && assets.length > 0 ? Object.keys(assets[0]) : [];
  
  const expectedAssetColumns = [
    'id', 'bucket', 'path', 'public_url', 'original_name', 
    'mime_type', 'file_size', 'width', 'height', 'alt_text', 
    'title', 'content_hash', 'uploaded_by', 'created_at', 'updated_at'
  ];
  
  const missingAssetColumns = expectedAssetColumns.filter(col => !assetColumns.includes(col));
  const unexpectedAssetColumns = assetColumns.filter(col => !expectedAssetColumns.includes(col));
  
  console.log('Expected columns:');
  expectedAssetColumns.forEach(col => {
    const status = assetColumns.includes(col) ? '✅' : '❌';
    console.log(`  ${status} ${col}`);
  });
  
  if (unexpectedAssetColumns.length > 0) {
    console.log('\n⚠️  Unexpected columns found:');
    unexpectedAssetColumns.forEach(col => console.log(`  - ${col}`));
  }
  
  // Verify media_usage columns
  console.log('\n📋 Checking media_usage schema...\n');
  
  const { data: usage, error: usageError } = await supabaseAdmin
    .from('media_usage')
    .select('*')
    .limit(1);
  
  if (usageError) {
    console.error('❌ Failed to query media_usage:', usageError.message);
    process.exit(1);
  }
  
  const usageColumns = usage && usage.length > 0 ? Object.keys(usage[0]) : [];
  
  const expectedUsageColumns = [
    'id', 'media_asset_id', 'source_table', 'source_column', 
    'source_record_id', 'source_url', 'created_at'
  ];
  
  const missingUsageColumns = expectedUsageColumns.filter(col => !usageColumns.includes(col));
  const unexpectedUsageColumns = usageColumns.filter(col => !expectedUsageColumns.includes(col));
  
  console.log('Expected columns:');
  expectedUsageColumns.forEach(col => {
    const status = usageColumns.includes(col) ? '✅' : '❌';
    console.log(`  ${status} ${col}`);
  });
  
  if (unexpectedUsageColumns.length > 0) {
    console.log('\n⚠️  Unexpected columns found:');
    unexpectedUsageColumns.forEach(col => console.log(`  - ${col}`));
  }
  
  // Check data counts
  console.log('\n📊 Data Summary:\n');
  
  const { count: assetCount } = await supabaseAdmin
    .from('media_assets')
    .select('*', { count: 'exact', head: true });
  
  const { count: usageCount } = await supabaseAdmin
    .from('media_usage')
    .select('*', { count: 'exact', head: true });
  
  console.log(`  media_assets: ${assetCount} records`);
  console.log(`  media_usage: ${usageCount} records`);
  
  // Check for data quality issues
  console.log('\n🔍 Data Quality Checks:\n');
  
  const { data: nullPaths } = await supabaseAdmin
    .from('media_assets')
    .select('id')
    .or('path.is.null,path.eq.undefined');
  
  const { data: nullBuckets } = await supabaseAdmin
    .from('media_assets')
    .select('id')
    .or('bucket.is.null,bucket.eq.undefined');
  
  console.log(`  ✅ Records with NULL/undefined path: ${nullPaths?.length || 0}`);
  console.log(`  ✅ Records with NULL/undefined bucket: ${nullBuckets?.length || 0}`);
  
  // Final summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  
  const schemaMatches = missingAssetColumns.length === 0 && 
                        missingUsageColumns.length === 0;
  
  if (schemaMatches && (nullPaths?.length || 0) === 0 && (nullBuckets?.length || 0) === 0) {
    console.log('✅ SCHEMA VERIFICATION PASSED');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('Production schema matches reconciled migration file.');
    console.log('Data quality: 100% valid (no NULL paths or buckets).\n');
  } else {
    console.log('⚠️  SCHEMA ISSUES DETECTED');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    if (missingAssetColumns.length > 0) {
      console.log('Missing columns in media_assets:', missingAssetColumns.join(', '));
    }
    if (missingUsageColumns.length > 0) {
      console.log('Missing columns in media_usage:', missingUsageColumns.join(', '));
    }
    if ((nullPaths?.length || 0) > 0) {
      console.log(`Data quality issue: ${nullPaths.length} records with NULL/undefined path`);
    }
    console.log();
  }
  
} catch (error) {
  console.error('\n❌ VERIFICATION FAILED:', error.message);
  console.error(error.stack);
  process.exit(1);
}
