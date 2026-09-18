#!/usr/bin/env node

/**
 * PHASE 0 — BASELINE BRANDING STATE
 * 
 * Captures current state before any modifications:
 * - business_settings branding values
 * - referenced media_assets
 * - Media Library usage labels
 * - Current public URLs
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function captureBaseline() {
  console.log('='.repeat(60));
  console.log('PHASE 0 — BASELINE BRANDING STATE');
  console.log('Timestamp:', new Date().toISOString());
  console.log('='.repeat(60));
  console.log();

  // 1. business_settings branding fields
  console.log('1. BUSINESS_SETTINGS BRANDING FIELDS');
  console.log('-'.repeat(60));
  const { data: biz, error: bizError } = await supabase
    .from('business_settings')
    .select('id, business_name, logo_media_id, favicon_media_id, logo_url, favicon_url')
    .limit(1)
    .maybeSingle();

  if (bizError) {
    console.error('Error fetching business_settings:', bizError);
    process.exit(1);
  }

  console.log(JSON.stringify(biz, null, 2));
  console.log();

  // 2. Referenced media_assets
  console.log('2. REFERENCED MEDIA_ASSETS');
  console.log('-'.repeat(60));
  
  const mediaIds = [biz?.logo_media_id, biz?.favicon_media_id].filter(Boolean);
  
  if (mediaIds.length > 0) {
    const { data: assets, error: assetsError } = await supabase
      .from('media_assets')
      .select('id, title, bucket, path, public_url, mime_type, created_at')
      .in('id', mediaIds);

    if (assetsError) {
      console.error('Error fetching media_assets:', assetsError);
    } else {
      console.log(`Found ${assets.length} asset(s):`);
      assets.forEach(asset => {
        console.log('\nAsset:', asset.id);
        console.log('  Title:', asset.title);
        console.log('  Path:', asset.bucket + '/' + asset.path);
        console.log('  Public URL:', asset.public_url);
        console.log('  MIME:', asset.mime_type);
        console.log('  Created:', asset.created_at);
      });
    }
  } else {
    console.log('No media_assets referenced by branding fields.');
  }
  console.log();

  // 3. Media Library usage calculation
  console.log('3. MEDIA LIBRARY USAGE CALCULATION');
  console.log('-'.repeat(60));
  
  if (mediaIds.length > 0) {
    for (const mediaId of mediaIds) {
      console.log(`\nAsset: ${mediaId}`);
      
      // Check each usage source
      const usageSources = [
        { table: 'business_settings', field: 'logo_media_id', label: 'Branding → Logo' },
        { table: 'business_settings', field: 'favicon_media_id', label: 'Branding → Favicon' },
        { table: 'menu_items', field: 'media_id', label: 'Menu' },
        { table: 'services', field: 'media_id', label: 'Services' },
        { table: 'gallery', field: 'media_id', label: 'Gallery' },
        { table: 'hero_slides', field: 'media_id', label: 'Hero' },
        { table: 'testimonials', field: 'media_id', label: 'Testimonials' },
      ];

      const usages = [];
      for (const source of usageSources) {
        const { count, error } = await supabase
          .from(source.table)
          .select('*', { count: 'exact', head: true })
          .eq(source.field, mediaId);
        
        if (!error && count > 0) {
          usages.push(`${source.label} (${count})`);
        }
      }

      if (usages.length > 0) {
        console.log('  Used in:', usages.join(', '));
      } else {
        console.log('  Used in: [NONE DETECTED]');
      }
    }
  }
  console.log();

  // 4. Current public URLs
  console.log('4. CURRENT PUBLIC URLS');
  console.log('-'.repeat(60));
  console.log('Logo URL (legacy field):', biz?.logo_url || '[NULL]');
  console.log('Favicon URL (legacy field):', biz?.favicon_url || '[NULL]');
  console.log();

  // 5. Save baseline
  const baseline = {
    timestamp: new Date().toISOString(),
    business_settings: biz,
    media_assets: mediaIds.length > 0 ? await supabase
      .from('media_assets')
      .select('*')
      .in('id', mediaIds)
      .then(r => r.data) : [],
  };

  console.log('5. BASELINE SAVED');
  console.log('-'.repeat(60));
  console.log('File: artifacts/branding-baseline.json');
  console.log();
  
  const fs = await import('fs');
  const path = await import('path');
  const artifactsDir = path.join(process.cwd(), 'artifacts');
  
  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }
  
  fs.writeFileSync(
    path.join(artifactsDir, 'branding-baseline.json'),
    JSON.stringify(baseline, null, 2)
  );

  console.log('='.repeat(60));
  console.log('BASELINE CAPTURE COMPLETE');
  console.log('='.repeat(60));
}

captureBaseline().catch(console.error);
