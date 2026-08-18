/**
 * Fix Missing Logo Usage Record
 * 
 * Creates the missing media_usage record for business_settings.logo_url
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
console.log('║  FIX MISSING LOGO USAGE RECORD                                ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

try {
  // Get business_settings logo_url
  console.log('📋 Fetching business_settings...\n');
  
  const { data: settings, error: settingsError } = await supabaseAdmin
    .from('business_settings')
    .select('id, logo_url')
    .single();
  
  if (settingsError) {
    console.error('❌ Failed to fetch business_settings:', settingsError.message);
    process.exit(1);
  }
  
  console.log('Business settings:');
  console.log(`  ID: ${settings.id}`);
  console.log(`  logo_url: ${settings.logo_url}\n`);
  
  if (!settings.logo_url) {
    console.log('⚠️  No logo_url set in business_settings. Nothing to fix.\n');
    process.exit(0);
  }
  
  // Parse the URL to get bucket and path
  const urlMatch = settings.logo_url.match(/\/storage\/v1\/object\/public\/([^\/]+)\/(.+)$/);
  
  if (!urlMatch) {
    console.error('❌ Could not parse logo_url. Not a valid Supabase Storage URL.\n');
    process.exit(1);
  }
  
  const [, bucket, path] = urlMatch;
  
  console.log('Parsed logo URL:');
  console.log(`  Bucket: ${bucket}`);
  console.log(`  Path: ${path}\n`);
  
  // Find the media_asset for this logo
  console.log('🔍 Finding media_asset record...\n');
  
  const { data: asset, error: assetError } = await supabaseAdmin
    .from('media_assets')
    .select('id')
    .eq('bucket', bucket)
    .eq('path', path)
    .single();
  
  if (assetError) {
    console.error('❌ Failed to find media_asset:', assetError.message);
    console.error('   Make sure the logo is backfilled into media_assets first.\n');
    process.exit(1);
  }
  
  console.log(`✅ Found media_asset: ${asset.id}\n`);
  
  // Check if usage record already exists
  console.log('🔍 Checking for existing usage record...\n');
  
  const { data: existingUsage, error: usageCheckError } = await supabaseAdmin
    .from('media_usage')
    .select('id')
    .eq('media_asset_id', asset.id)
    .eq('source_table', 'business_settings')
    .eq('source_record_id', settings.id)
    .eq('source_column', 'logo_url')
    .maybeSingle();
  
  if (existingUsage) {
    console.log('✅ Usage record already exists. Nothing to fix.\n');
    process.exit(0);
  }
  
  console.log('📝 Creating missing usage record...\n');
  
  const { data: newUsage, error: insertError } = await supabaseAdmin
    .from('media_usage')
    .insert({
      media_asset_id: asset.id,
      source_table: 'business_settings',
      source_column: 'logo_url',
      source_record_id: settings.id.toString(),
      source_url: settings.logo_url
    })
    .select()
    .single();
  
  if (insertError) {
    console.error('❌ Failed to create usage record:', insertError.message);
    process.exit(1);
  }
  
  console.log('✅ Usage record created successfully!\n');
  console.log('Record details:');
  console.log(`  ID: ${newUsage.id}`);
  console.log(`  media_asset_id: ${newUsage.media_asset_id}`);
  console.log(`  source_table: ${newUsage.source_table}`);
  console.log(`  source_column: ${newUsage.source_column}`);
  console.log(`  source_record_id: ${newUsage.source_record_id}\n`);
  
  // Verify final count
  const { count } = await supabaseAdmin
    .from('media_usage')
    .select('*', { count: 'exact', head: true });
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('✅ FIX COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log(`Total media_usage records: ${count}\n`);
  
} catch (error) {
  console.error('\n❌ FIX FAILED:', error.message);
  console.error(error.stack);
  process.exit(1);
}
