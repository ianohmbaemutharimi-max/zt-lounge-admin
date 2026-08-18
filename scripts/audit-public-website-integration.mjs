#!/usr/bin/env node

/**
 * COMPREHENSIVE MEDIA LIFECYCLE AUDIT
 * 
 * Verifies complete integration from:
 * Admin Upload → Storage → Database → Public Website → Browser
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

console.log('🔍 COMPREHENSIVE MEDIA LIFECYCLE AUDIT\n');
console.log('=' .repeat(80));

const results = {
  hardcodedImages: [],
  mediaAssetsUsage: [],
  publicWebsiteGaps: [],
  storagePathFormats: [],
  imageComponents: [],
  cmsReferences: [],
  warnings: [],
  errors: []
};

/**
 * Step 1: Check for hardcoded image paths in the repository
 */
async function auditHardcodedImages() {
  console.log('\n📁 STEP 1: Auditing for hardcoded image paths...\n');
  
  // This would require file system scanning
  // For now, we'll note common patterns to search for
  const patternsToCheck = [
    '/images/',
    '/public/images/',
    'image_url:',
    'imageUrl:',
    'src="/images',
    'src="http',
  ];
  
  console.log('Patterns that need manual verification:');
  patternsToCheck.forEach(pattern => {
    console.log(`  - Files containing: ${pattern}`);
  });
  
  results.warnings.push('Manual code search needed for hardcoded image references');
}

/**
 * Step 2: Verify media_assets table structure and access
 */
async function auditMediaAssetsTable() {
  console.log('\n📊 STEP 2: Auditing media_assets table...\n');
  
  try {
    // Check if media_assets is accessible
    const { data, error, count } = await supabase
      .from('media_assets')
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      if (error.code === 'PGRST116') {
        results.errors.push('media_assets table does not exist or is not accessible');
        console.log('❌ media_assets table: NOT ACCESSIBLE');
        console.log(`   Error: ${error.message}`);
        return;
      }
      throw error;
    }
    
    console.log(`✅ media_assets table: ACCESSIBLE`);
    console.log(`   Total records: ${count ?? 0}`);
    
    // Get sample records
    const { data: samples, error: sampleError } = await supabase
      .from('media_assets')
      .select('id, title, path, public_url, bucket, asset_type, usage_count')
      .limit(5);
    
    if (sampleError) throw sampleError;
    
    if (samples && samples.length > 0) {
      console.log('\n📋 Sample media_assets records:');
      samples.forEach(asset => {
        console.log(`\n   Asset ID: ${asset.id}`);
        console.log(`   Title: ${asset.title || 'N/A'}`);
        console.log(`   Path: ${asset.path}`);
        console.log(`   Public URL: ${asset.public_url || 'MISSING'}`);
        console.log(`   Bucket: ${asset.bucket}`);
        console.log(`   Type: ${asset.asset_type}`);
        console.log(`   Usage Count: ${asset.usage_count ?? 0}`);
        
        results.mediaAssetsUsage.push({
          id: asset.id,
          path: asset.path,
          publicUrl: asset.public_url,
          usageCount: asset.usage_count
        });
      });
    } else {
      console.log('\n⚠️  No media_assets records found');
      results.warnings.push('media_assets table is empty');
    }
    
  } catch (error) {
    console.error('❌ Error auditing media_assets:', error.message);
    results.errors.push(`media_assets audit failed: ${error.message}`);
  }
}

/**
 * Step 3: Check CMS table references to media_assets
 */
async function auditCMSReferences() {
  console.log('\n🔗 STEP 3: Auditing CMS references to media...\n');
  
  const tablesToCheck = [
    { name: 'menu_items', imageColumns: ['image_url'] },
    { name: 'gallery', imageColumns: ['image_url'] },
    { name: 'services', imageColumns: ['image_url'] },
    { name: 'hero_slides', imageColumns: ['image_url'] },
  ];
  
  for (const table of tablesToCheck) {
    try {
      const { data, error } = await supabase
        .from(table.name)
        .select(table.imageColumns.join(','))
        .limit(5);
      
      if (error) {
        console.log(`⚠️  ${table.name}: ${error.message}`);
        continue;
      }
      
      console.log(`\n📝 ${table.name}:`);
      if (data && data.length > 0) {
        data.forEach((row, idx) => {
          table.imageColumns.forEach(col => {
            const url = row[col];
            console.log(`   [${idx + 1}] ${col}: ${url || 'NULL'}`);
            
            if (url) {
              results.cmsReferences.push({
                table: table.name,
                column: col,
                url: url,
                isStorage: url.includes('supabase'),
                isLocal: url.startsWith('/images/') || url.startsWith('/public/'),
                isExternal: url.startsWith('http') && !url.includes('supabase')
              });
            }
          });
        });
      } else {
        console.log(`   No records found`);
      }
      
    } catch (error) {
      console.error(`❌ Error checking ${table.name}:`, error.message);
    }
  }
}

/**
 * Step 4: Test public URL accessibility
 */
async function testPublicURLs() {
  console.log('\n🌐 STEP 4: Testing public URL accessibility...\n');
  
  if (results.mediaAssetsUsage.length === 0) {
    console.log('⚠️  No media assets to test');
    return;
  }
  
  for (const asset of results.mediaAssetsUsage.slice(0, 3)) {
    if (!asset.publicUrl) {
      console.log(`⚠️  Asset ${asset.id}: No public_url`);
      results.warnings.push(`Asset ${asset.id} missing public_url`);
      continue;
    }
    
    try {
      console.log(`\n🔗 Testing: ${asset.publicUrl}`);
      const response = await fetch(asset.publicUrl, { method: 'HEAD' });
      
      if (response.ok) {
        console.log(`   ✅ Status: ${response.status} - Image accessible`);
        console.log(`   Content-Type: ${response.headers.get('content-type')}`);
      } else {
        console.log(`   ❌ Status: ${response.status} - Image NOT accessible`);
        results.errors.push(`Public URL returned ${response.status}: ${asset.publicUrl}`);
      }
    } catch (error) {
      console.log(`   ❌ Fetch failed: ${error.message}`);
      results.errors.push(`Cannot fetch ${asset.publicUrl}: ${error.message}`);
    }
  }
}

/**
 * Step 5: Check for usage in actual CMS data
 */
async function checkMediaUsageInCMS() {
  console.log('\n📊 STEP 5: Analyzing media usage patterns...\n');
  
  const storageUrls = results.cmsReferences.filter(ref => ref.isStorage).length;
  const localUrls = results.cmsReferences.filter(ref => ref.isLocal).length;
  const externalUrls = results.cmsReferences.filter(ref => ref.isExternal).length;
  
  console.log(`Storage URLs (Supabase): ${storageUrls}`);
  console.log(`Local paths (/images/): ${localUrls}`);
  console.log(`External URLs: ${externalUrls}`);
  
  if (localUrls > 0) {
    results.warnings.push(`Found ${localUrls} local /images/ references that may not sync with admin uploads`);
  }
}

/**
 * Step 6: Check next.config.ts for remotePatterns
 */
async function checkNextConfig() {
  console.log('\n⚙️  STEP 6: Checking Next.js image configuration...\n');
  
  try {
    const fs = await import('fs/promises');
    const configPath = join(__dirname, '..', 'next.config.ts');
    const configContent = await fs.readFile(configPath, 'utf-8');
    
    if (configContent.includes('remotePatterns')) {
      console.log('✅ remotePatterns found in next.config.ts');
      
      // Extract the remote patterns
      const match = configContent.match(/remotePatterns:\s*\[([\s\S]*?)\]/);
      if (match) {
        console.log('\n📋 Current remotePatterns configuration:');
        console.log(match[0]);
      }
    } else {
      console.log('⚠️  No remotePatterns found in next.config.ts');
      results.warnings.push('next.config.ts may need remotePatterns for Supabase Storage');
    }
    
    // Check for image domains
    if (configContent.includes('domains:')) {
      console.log('✅ image domains configuration found');
    }
    
  } catch (error) {
    console.error('❌ Error reading next.config.ts:', error.message);
  }
}

/**
 * Generate final report
 */
function generateReport() {
  console.log('\n' + '='.repeat(80));
  console.log('📊 AUDIT SUMMARY\n');
  
  console.log('MEDIA ASSETS:');
  console.log(`  - Records found: ${results.mediaAssetsUsage.length}`);
  console.log(`  - With public_url: ${results.mediaAssetsUsage.filter(a => a.publicUrl).length}`);
  
  console.log('\nCMS REFERENCES:');
  console.log(`  - Total image references: ${results.cmsReferences.length}`);
  console.log(`  - Using Supabase Storage: ${results.cmsReferences.filter(r => r.isStorage).length}`);
  console.log(`  - Using local /images/: ${results.cmsReferences.filter(r => r.isLocal).length}`);
  console.log(`  - Using external URLs: ${results.cmsReferences.filter(r => r.isExternal).length}`);
  
  if (results.warnings.length > 0) {
    console.log(`\n⚠️  WARNINGS (${results.warnings.length}):`);
    results.warnings.forEach(w => console.log(`  - ${w}`));
  }
  
  if (results.errors.length > 0) {
    console.log(`\n❌ ERRORS (${results.errors.length}):`);
    results.errors.forEach(e => console.log(`  - ${e}`));
  }
  
  console.log('\n' + '='.repeat(80));
  
  // Identify gaps
  console.log('\n🎯 INTEGRATION GAPS IDENTIFIED:\n');
  
  const gaps = [];
  
  if (results.cmsReferences.filter(r => r.isLocal).length > 0) {
    gaps.push('CMS tables still reference local /images/ paths instead of media_assets');
  }
  
  if (results.mediaAssetsUsage.some(a => !a.publicUrl)) {
    gaps.push('Some media_assets records missing public_url');
  }
  
  if (results.mediaAssetsUsage.some(a => a.usageCount === 0)) {
    gaps.push('Uploaded media exists but may not be consumed by CMS');
  }
  
  if (gaps.length === 0) {
    console.log('✅ No major integration gaps detected\n');
  } else {
    gaps.forEach((gap, idx) => {
      console.log(`${idx + 1}. ${gap}`);
    });
  }
  
  console.log('\n' + '='.repeat(80));
}

/**
 * Main execution
 */
async function main() {
  try {
    await auditHardcodedImages();
    await auditMediaAssetsTable();
    await auditCMSReferences();
    await testPublicURLs();
    await checkMediaUsageInCMS();
    await checkNextConfig();
    
    generateReport();
    
    if (results.errors.length > 0) {
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n❌ AUDIT FAILED:', error);
    process.exit(1);
  }
}

main();
