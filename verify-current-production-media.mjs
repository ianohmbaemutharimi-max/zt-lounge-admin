/**
 * ZT LOUNGE — VERIFY CURRENT PRODUCTION MEDIA LIBRARY STATE
 * 
 * Fresh verification without assumptions about schema
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const TEST_EMAIL = process.argv[2];
const TEST_PASSWORD = process.argv[3];

if (!TEST_EMAIL || !TEST_PASSWORD) {
  console.error('Usage: node verify-current-production-media.mjs <email> <password>');
  process.exit(1);
}

const envContent = readFileSync('.env.local', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([A-Z_]+)=(.+)$/);
  if (match) env[match[1]] = match[2];
});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  VERIFY CURRENT PRODUCTION MEDIA LIBRARY STATE              ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

try {
  // Get actual data samples
  const { data: assets, error: assetsError } = await supabaseAdmin
    .from('media_assets')
    .select('*')
    .limit(5);

  const { data: usage, error: usageError } = await supabaseAdmin
    .from('media_usage')
    .select('*')
    .limit(5);

  if (assetsError) {
    console.error('❌ media_assets error:', assetsError.message);
  } else {
    console.log('✅ media_assets sample (5 records):\n');
    assets.forEach((asset, i) => {
      console.log(`Record ${i + 1}:`);
      console.log(JSON.stringify(asset, null, 2));
      console.log();
    });
  }

  if (usageError) {
    console.error('❌ media_usage error:', usageError.message);
  } else {
    console.log('\n✅ media_usage sample (5 records):\n');
    usage.forEach((u, i) => {
      console.log(`Record ${i + 1}:`);
      console.log(JSON.stringify(u, null, 2));
      console.log();
    });
  }

  // Count totals
  const { count: assetsCount } = await supabaseAdmin
    .from('media_assets')
    .select('*', { count: 'exact', head: true });

  const { count: usageCount } = await supabaseAdmin
    .from('media_usage')
    .select('*', { count: 'exact', head: true });

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`Total media_assets: ${assetsCount}`);
  console.log(`Total media_usage: ${usageCount}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Check for undefined/null paths
  const { data: undefinedPaths } = await supabaseAdmin
    .from('media_assets')
    .select('id, bucket, path, public_url')
    .or('path.is.null,path.eq.undefined,path.eq.null');

  console.log(`Records with null/undefined path: ${undefinedPaths?.length || 0}`);
  if (undefinedPaths && undefinedPaths.length > 0) {
    console.log('Sample:');
    undefinedPaths.slice(0, 3).forEach(r => {
      console.log(`  ID: ${r.id}, bucket: ${r.bucket}, path: ${r.path}, url: ${r.public_url?.substring(0, 60)}...`);
    });
  }

  // Check bucket/path consistency with public_url
  console.log('\nChecking bucket/path consistency with public_url...\n');
  
  const { data: allAssets } = await supabaseAdmin
    .from('media_assets')
    .select('bucket, path, public_url');

  let mismatches = 0;
  let validPaths = 0;
  const sampleValid = [];
  const sampleInvalid = [];

  allAssets?.forEach(asset => {
    // Check if public_url contains /public/{bucket}/{path}
    const expectedSegment = `/public/${asset.bucket}/${asset.path}`;
    if (asset.public_url?.includes(expectedSegment)) {
      validPaths++;
      if (sampleValid.length < 3) {
        sampleValid.push({bucket: asset.bucket, path: asset.path});
      }
    } else {
      mismatches++;
      if (sampleInvalid.length < 3) {
        sampleInvalid.push({
          bucket: asset.bucket,
          path: asset.path,
          url: asset.public_url?.substring(0, 80)
        });
      }
    }
  });

  console.log(`✅ Valid path references: ${validPaths}`);
  console.log(`❌ Mismatched path references: ${mismatches}\n`);

  if (sampleValid.length > 0) {
    console.log('Sample valid paths:');
    sampleValid.forEach(s => console.log(`  ${s.bucket}/${s.path}`));
    console.log();
  }

  if (sampleInvalid.length > 0) {
    console.log('Sample invalid paths:');
    sampleInvalid.forEach(s => {
      console.log(`  bucket: ${s.bucket}, path: ${s.path}`);
      console.log(`  url: ${s.url}...`);
    });
    console.log();
  }

  // Check duplicates
  const { data: dupCheck } = await supabaseAdmin
    .from('media_assets')
    .select('bucket, path, public_url');

  const pathMap = new Map();
  const urlMap = new Map();

  dupCheck?.forEach(a => {
    const pathKey = `${a.bucket}/${a.path}`;
    pathMap.set(pathKey, (pathMap.get(pathKey) || 0) + 1);
    urlMap.set(a.public_url, (urlMap.get(a.public_url) || 0) + 1);
  });

  const dupPaths = Array.from(pathMap.entries()).filter(([_, count]) => count > 1);
  const dupUrls = Array.from(urlMap.entries()).filter(([_, count]) => count > 1);

  console.log(`Duplicate bucket/path combinations: ${dupPaths.length}`);
  if (dupPaths.length > 0) {
    console.log('Sample:');
    dupPaths.slice(0, 3).forEach(([path, count]) => console.log(`  ${path} (${count}x)`));
  }

  console.log(`\nDuplicate public_url values: ${dupUrls.length}`);

  // Check orphaned usage
  const { data: allUsage } = await supabaseAdmin
    .from('media_usage')
    .select('media_asset_id');

  const { data: allAssetIds } = await supabaseAdmin
    .from('media_assets')
    .select('id');

  const assetIdSet = new Set(allAssetIds?.map(a => a.id));
  const orphaned = allUsage?.filter(u => !assetIdSet.has(u.media_asset_id)) || [];

  console.log(`\nOrphaned media_usage records: ${orphaned.length}\n`);

  // Check for business_settings logo usage
  const { data: logoAssets } = await supabaseAdmin
    .from('media_assets')
    .select('id, bucket, path')
    .eq('bucket', 'logos');

  console.log(`Logo assets: ${logoAssets?.length || 0}`);
  
  if (logoAssets && logoAssets.length > 0) {
    const logoId = logoAssets[0].id;
    const { data: logoUsage } = await supabaseAdmin
      .from('media_usage')
      .select('*')
      .eq('media_asset_id', logoId);

    console.log(`Logo usage records: ${logoUsage?.length || 0}`);
    if (!logoUsage || logoUsage.length === 0) {
      console.log('⚠️  Logo has NO usage record\n');
    }
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('VERIFICATION COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════\n');

} catch (error) {
  console.error('\n❌ ERROR:', error.message);
  console.error(error.stack);
  process.exit(1);
}
