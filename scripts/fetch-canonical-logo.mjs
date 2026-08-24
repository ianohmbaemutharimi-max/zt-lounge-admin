#!/usr/bin/env node

/**
 * Fetch Canonical Logo from Supabase Storage
 * 
 * Downloads the verified ZT Lounge logo from Supabase storage
 * to replace the corrupted placeholder in public/images/logo/
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fetchCanonicalLogo() {
  console.log('🔍 Searching for canonical ZT Lounge logo in Supabase storage...\n');

  try {
    // Check brand-assets bucket for logo
    const { data: brandAssets, error: brandError } = await supabase
      .storage
      .from('brand-assets')
      .list('logos', {
        limit: 100,
        sortBy: { column: 'name', order: 'asc' }
      });

    if (brandError) {
      console.log('⚠️  brand-assets bucket not accessible:', brandError.message);
    } else if (brandAssets && brandAssets.length > 0) {
      console.log('📁 Found assets in brand-assets/logos:');
      brandAssets.forEach(file => {
        console.log(`   - ${file.name} (${(file.metadata?.size || 0)} bytes)`);
      });

      // Look for the main logo
      const logoFile = brandAssets.find(f => 
        f.name.toLowerCase().includes('zt') && 
        f.name.toLowerCase().includes('logo') &&
        f.name.endsWith('.png')
      );

      if (logoFile) {
        console.log(`\n✅ Found canonical logo: ${logoFile.name}`);
        
        // Download the logo
        const { data: logoData, error: downloadError } = await supabase
          .storage
          .from('brand-assets')
          .download(`logos/${logoFile.name}`);

        if (downloadError) {
          console.error('❌ Download error:', downloadError);
          return null;
        }

        const buffer = Buffer.from(await logoData.arrayBuffer());
        console.log(`📦 Downloaded ${buffer.length} bytes`);
        return { buffer, filename: logoFile.name };
      }
    }

    // Check media-library bucket
    console.log('\n🔍 Checking media-library bucket...');
    const { data: mediaAssets, error: mediaError } = await supabase
      .storage
      .from('media-library')
      .list('', {
        limit: 100,
        sortBy: { column: 'name', order: 'asc' }
      });

    if (mediaError) {
      console.log('⚠️  media-library bucket not accessible:', mediaError.message);
    } else if (mediaAssets && mediaAssets.length > 0) {
      console.log('📁 Found assets in media-library:');
      mediaAssets.forEach(file => {
        console.log(`   - ${file.name}`);
      });

      const logoFile = mediaAssets.find(f => 
        f.name.toLowerCase().includes('logo') &&
        f.name.endsWith('.png')
      );

      if (logoFile) {
        console.log(`\n✅ Found logo in media-library: ${logoFile.name}`);
        
        const { data: logoData, error: downloadError } = await supabase
          .storage
          .from('media-library')
          .download(logoFile.name);

        if (downloadError) {
          console.error('❌ Download error:', downloadError);
          return null;
        }

        const buffer = Buffer.from(await logoData.arrayBuffer());
        console.log(`📦 Downloaded ${buffer.length} bytes`);
        return { buffer, filename: logoFile.name };
      }
    }

    // Check database for logo media_id reference
    console.log('\n🔍 Checking database for logo reference...');
    const { data: brandInfo, error: dbError } = await supabase
      .from('business_info')
      .select('logo_media_id')
      .single();

    if (!dbError && brandInfo?.logo_media_id) {
      console.log(`✅ Found logo_media_id: ${brandInfo.logo_media_id}`);
      
      const { data: mediaAsset, error: assetError } = await supabase
        .from('media_assets')
        .select('*')
        .eq('id', brandInfo.logo_media_id)
        .single();

      if (!assetError && mediaAsset) {
        console.log(`📁 Media asset: ${mediaAsset.filename}`);
        console.log(`📍 Storage path: ${mediaAsset.storage_path}`);
        console.log(`🔗 Public URL: ${mediaAsset.public_url}`);

        // Try to download using the storage path
        const bucketMatch = mediaAsset.storage_path.match(/^([^/]+)\//);
        if (bucketMatch) {
          const bucket = bucketMatch[1];
          const filePath = mediaAsset.storage_path.substring(bucket.length + 1);
          
          const { data: logoData, error: downloadError } = await supabase
            .storage
            .from(bucket)
            .download(filePath);

          if (!downloadError && logoData) {
            const buffer = Buffer.from(await logoData.arrayBuffer());
            console.log(`📦 Downloaded ${buffer.length} bytes from ${bucket}/${filePath}`);
            return { buffer, filename: mediaAsset.filename };
          }
        }
      }
    }

    console.log('\n⚠️  No canonical logo found in Supabase storage');
    console.log('💡 Will create a simple placeholder logo instead');
    return null;

  } catch (error) {
    console.error('❌ Error:', error.message);
    return null;
  }
}

async function createPlaceholderLogo() {
  console.log('\n🎨 Creating placeholder logo...');
  
  // Create a simple SVG logo that can be converted to PNG
  const svg = `<svg width="400" height="100" xmlns="http://www.w3.org/2000/svg">
  <rect width="400" height="100" fill="#1a1a1a"/>
  <text x="200" y="60" font-family="Arial, sans-serif" font-size="48" font-weight="bold" 
        fill="#D4AF37" text-anchor="middle">ZT LOUNGE</text>
</svg>`;

  return Buffer.from(svg, 'utf-8');
}

async function main() {
  const result = await fetchCanonicalLogo();
  
  let logoBuffer;
  let filename;

  if (result) {
    logoBuffer = result.buffer;
    filename = result.filename;
  } else {
    // Create placeholder
    logoBuffer = await createPlaceholderLogo();
    filename = 'zt-lounge-logo.svg';
  }

  // Save to public/images/logo/
  const publicLogoPath = path.join(__dirname, '..', 'public', 'images', 'logo', 'zt-lounge-logo.png');
  const ext = path.extname(filename);
  
  if (ext === '.svg') {
    // Save as SVG for now
    const svgPath = path.join(__dirname, '..', 'public', 'images', 'logo', 'zt-lounge-logo.svg');
    fs.writeFileSync(svgPath, logoBuffer);
    console.log(`\n✅ Saved SVG logo: ${svgPath}`);
    console.log(`📏 File size: ${logoBuffer.length} bytes`);
  } else {
    fs.writeFileSync(publicLogoPath, logoBuffer);
    console.log(`\n✅ Saved logo: ${publicLogoPath}`);
    console.log(`📏 File size: ${logoBuffer.length} bytes`);
  }

  console.log('\n✅ Logo fetch complete');
}

main().catch(console.error);
