#!/usr/bin/env node
/**
 * Phase 3 Storage Configuration
 *
 * Configures the public-assets bucket to match Phase 3 specifications:
 * - File size limit: 10 MB
 * - Allowed MIME types: image/jpeg, image/png, image/webp ONLY
 *
 * Uses Supabase Management API for reliable updates.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
dotenv.config({ path: join(root, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY (required to update bucket)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const TEN_MB = 10 * 1024 * 1024;

/**
 * Get the project ref from the Supabase URL
 */
function getProjectRef(url) {
  const match = url.match(/https:\/\/([a-z0-9-]+)\.supabase\.co/i);
  return match ? match[1] : null;
}

async function main() {
  console.log('Phase 3 Storage Configuration');
  console.log('==============================\n');

  const projectRef = getProjectRef(supabaseUrl);
  if (!projectRef) {
    console.log('❌ Could not extract project reference from URL');
    process.exit(1);
  }

  console.log(`Project ref: ${projectRef}`);
  console.log('NOTE: For complete bucket configuration, please also set via Supabase Dashboard:');
  console.log('  Storage → public-assets → Configuration → File size limit: 10 MB');
  console.log('  Storage → public-assets → Configuration → Allowed MIME types: image/jpeg, image/png, image/webp\n');

  // 1. Try updating via JS client
  console.log('1. Updating bucket via JS client...');
  try {
    const { data, error } = await supabase.storage.updateBucket(
      'public-assets',
      {
        public: true,
        file_size_limit: TEN_MB,
        allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'],
      }
    );

    if (error) {
      console.log('   ❌ JS client ERROR:', error.message);
    } else {
      console.log('   ✅ JS client reported success');
    }
  } catch (error) {
    console.log('   ❌ JS client EXCEPTION:', error.message);
  }

  // 2. Try using Management API directly
  console.log('\n2. Updating bucket via Management API...');
  try {
    const managementUrl = `https://api.supabase.com/storage/v1/buckets/${projectRef}/public-assets`;
    // Note: This uses the project's JWT service_role key
    const managementResponse = await fetch(
      `https://api.supabase.com/storage/v1/buckets/${projectRef}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          name: 'public-assets',
          public: true,
          file_size_limit: TEN_MB,
          allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'],
        }),
      }
    );

    if (managementResponse.ok) {
      console.log('   ✅ Management API updated successfully');
    } else {
      const body = await managementResponse.text();
      console.log(`   ⚠️  Management API returned ${managementResponse.status}`);
      console.log('   Details:', body.substring(0, 200));
    }
  } catch (error) {
    console.log('   ⚠️  Management API exception:', error.message);
  }

  // 3. Verify
  console.log('\n3. Verifying updated configuration...');
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets();

    if (error) {
      console.log('   ❌ ERROR:', error.message);
    } else {
      const bucket = buckets?.find(b => b.name === 'public-assets');

      if (bucket) {
        const sizeLimitMB = bucket.file_size_limit ? `${bucket.file_size_limit / (1024*1024)} MB` : 'NOT SET';
        const sizeLimitCorrect = bucket.file_size_limit === TEN_MB ? '✅' : '⚠️';
        console.log(`   ${sizeLimitCorrect} File Size Limit: ${sizeLimitMB}`);

        const mimeTypes = bucket.allowed_mime_types || [];
        const mimeCorrect = mimeTypes.length === 3 &&
          mimeTypes.includes('image/jpeg') &&
          mimeTypes.includes('image/png') &&
          mimeTypes.includes('image/webp');

        if (mimeCorrect) {
          console.log('   ✅ Allowed MIME types correct (JPEG, PNG, WebP only)');
        } else {
          console.log('   ⚠️  Allowed MIME types:', JSON.stringify(mimeTypes));
          console.log('   NOTE: API server-side Sharp validation provides defense-in-depth.');
          console.log('   Please update via Supabase Dashboard: Storage → public-assets → Configuration');
        }
      } else {
        console.log('   ❌ Bucket not found');
      }
    }
  } catch (error) {
    console.log('   ❌ EXCEPTION:', error.message);
  }

  console.log('\n==============================');
  console.log('Configuration complete.');
  console.log('\nIMPORTANT: If bucket limits were not updated above, please update manually via:');
  console.log('  https://supabase.com/dashboard/project/_/storage/buckets');
  console.log('  1. Find "public-assets" bucket');
  console.log('  2. Set File size limit to 10 MB');
  console.log('  3. Set Allowed MIME types to: image/jpeg, image/png, image/webp');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
