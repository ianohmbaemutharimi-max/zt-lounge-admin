#!/usr/bin/env node

/**
 * HERO IMAGE PICKER DIAGNOSTIC
 * 
 * READ-ONLY investigation of why Hero Slide picker shows "No media assets found"
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootPath = join(__dirname, '..');

console.log('═══════════════════════════════════════════════════════════');
console.log('  HERO IMAGE PICKER — READ-ONLY DIAGNOSTIC');
console.log('═══════════════════════════════════════════════════════════\n');

const findings = [];

// ============================================================
// STEP 1: INSPECT WEBSITE-CMS.TSX HERO MEDIA PICKER
// ============================================================

console.log('📍 STEP 1: Inspecting Hero Slide MediaPicker usage\n');

const websiteCmsPath = join(rootPath, 'src/features/cms/website-cms.tsx');
const websiteCms = readFileSync(websiteCmsPath, 'utf-8');

// Find MediaPickerModal usage for hero
const heroMediaPickerMatch = websiteCms.match(/<MediaPickerModal[\s\S]*?heroMediaPickerOpen[\s\S]*?\/>/);
if (heroMediaPickerMatch) {
  console.log('   Found Hero MediaPickerModal:');
  console.log(heroMediaPickerMatch[0].substring(0, 200) + '...\n');
  
  // Extract bucket prop
  const bucketMatch = heroMediaPickerMatch[0].match(/bucket=["']([^"']+)["']/);
  const bucket = bucketMatch ? bucketMatch[1] : 'NOT SPECIFIED';
  
  console.log(`   ✓ Bucket filter: ${bucket}`);
  findings.push({ component: 'Hero MediaPickerModal', bucket, line: 'Line ~250-260' });
} else {
  console.log('   ❌ Hero MediaPickerModal not found in expected format');
  findings.push({ component: 'Hero MediaPickerModal', bucket: 'NOT FOUND', line: 'N/A' });
}

// ============================================================
// STEP 2: INSPECT MEDIAPICKERMODAL COMPONENT
// ============================================================

console.log('\n📍 STEP 2: Inspecting MediaPickerModal component\n');

const mediaPickerPath = join(rootPath, 'src/features/media/media-picker-modal.tsx');
const mediaPicker = readFileSync(mediaPickerPath, 'utf-8');

// Find the fetch call
const fetchMatch = mediaPicker.match(/fetch\([^)]+\)/g);
if (fetchMatch) {
  console.log('   Fetch calls found:');
  fetchMatch.forEach((call, idx) => {
    console.log(`   ${idx + 1}. ${call}`);
  });
}

// Find bucket usage
const bucketUsageMatches = mediaPicker.match(/bucket[^=\n]*/g);
if (bucketUsageMatches) {
  console.log('\n   Bucket parameter usage:');
  bucketUsageMatches.slice(0, 5).forEach(usage => {
    console.log(`   • ${usage.trim()}`);
  });
}

// Find the exact API call
const apiCallMatch = mediaPicker.match(/\/api\/media[^\s'"<>]*/);
if (apiCallMatch) {
  console.log(`\n   ✓ API endpoint: ${apiCallMatch[0]}`);
  findings.push({ component: 'MediaPickerModal', apiEndpoint: apiCallMatch[0] });
}

// ============================================================
// STEP 3: INSPECT /api/media ROUTE
// ============================================================

console.log('\n📍 STEP 3: Inspecting /api/media route implementation\n');

const apiMediaPath = join(rootPath, 'src/app/api/media/route.ts');
const apiMedia = readFileSync(apiMediaPath, 'utf-8');

console.log('   Route implementation analysis:');

// Find bucket filtering
if (apiMedia.includes('bucket')) {
  const bucketLines = apiMedia.split('\n').filter(line => line.includes('bucket'));
  console.log('\n   Bucket-related code:');
  bucketLines.slice(0, 10).forEach(line => {
    console.log(`   ${line.trim()}`);
  });
} else {
  console.log('   ❌ No bucket filtering found in /api/media');
}

// Find the database query
const queryMatch = apiMedia.match(/\.from\(['"]([^'"]+)['"]\)/);
if (queryMatch) {
  console.log(`\n   ✓ Database table queried: ${queryMatch[1]}`);
  findings.push({ component: '/api/media', table: queryMatch[1] });
}

// Check for WHERE conditions
const whereMatches = apiMedia.match(/\.eq\(['"]([^'"]+)['"],\s*([^)]+)\)/g);
if (whereMatches) {
  console.log('\n   WHERE conditions:');
  whereMatches.forEach(condition => {
    console.log(`   • ${condition}`);
  });
}

// ============================================================
// STEP 4: QUERY ACTUAL MEDIA_ASSETS DATA
// ============================================================

console.log('\n📍 STEP 4: Querying actual media_assets data\n');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

try {
  // Get all media assets
  const { data: allMedia, error: allError } = await supabase
    .from('media_assets')
    .select('id, title, bucket, media_type, public_url, created_at')
    .order('created_at', { ascending: false });

  if (allError) {
    console.log(`   ❌ Error querying media_assets: ${allError.message}`);
  } else {
    console.log(`   ✓ Total media_assets records: ${allMedia.length}\n`);
    
    // Group by bucket
    const bucketCounts = {};
    allMedia.forEach(asset => {
      const bucket = asset.bucket || 'NULL';
      bucketCounts[bucket] = (bucketCounts[bucket] || 0) + 1;
    });
    
    console.log('   Bucket distribution:');
    Object.entries(bucketCounts).forEach(([bucket, count]) => {
      console.log(`   • ${bucket}: ${count} assets`);
    });
    
    findings.push({ component: 'media_assets', totalRecords: allMedia.length, buckets: bucketCounts });
    
    // Show sample records
    console.log('\n   Sample records (first 5):');
    allMedia.slice(0, 5).forEach((asset, idx) => {
      console.log(`\n   ${idx + 1}. ${asset.title || 'Untitled'}`);
      console.log(`      ID: ${asset.id}`);
      console.log(`      Bucket: ${asset.bucket || 'NULL'}`);
      console.log(`      Type: ${asset.media_type || 'NULL'}`);
      console.log(`      URL: ${asset.public_url ? asset.public_url.substring(0, 60) + '...' : 'NULL'}`);
    });
  }
  
  // Query with bucket filter (simulating Hero picker request)
  console.log('\n   Testing Hero picker query (bucket=media-content):');
  const { data: heroMedia, error: heroError } = await supabase
    .from('media_assets')
    .select('*')
    .eq('bucket', 'media-content')
    .limit(24);
  
  if (heroError) {
    console.log(`   ❌ Error: ${heroError.message}`);
  } else {
    console.log(`   ✓ Results: ${heroMedia.length} records`);
    if (heroMedia.length === 0) {
      console.log('   🔴 CONFIRMED: Zero records match bucket=media-content');
    }
  }
  
  findings.push({ query: 'bucket=media-content', results: heroMedia?.length || 0 });
  
} catch (error) {
  console.log(`   ❌ Database query failed: ${error.message}`);
}

// ============================================================
// STEP 5: CHECK HERO_SLIDES RECORDS
// ============================================================

console.log('\n📍 STEP 5: Inspecting hero_slides records\n');

try {
  const { data: slides, error } = await supabase
    .from('hero_slides')
    .select('*')
    .order('display_order', { ascending: true });
  
  if (error) {
    console.log(`   ❌ Error: ${error.message}`);
  } else {
    console.log(`   ✓ Total hero_slides: ${slides.length}\n`);
    
    slides.forEach((slide, idx) => {
      console.log(`   ${idx + 1}. ${slide.title}`);
      console.log(`      media_id: ${slide.media_id || 'NULL'}`);
      console.log(`      image_url: ${slide.image_url || 'NULL'}`);
      if (slide.image_url) {
        const urlParts = slide.image_url.split('/');
        const bucket = urlParts.includes('storage') ? urlParts[urlParts.indexOf('storage') + 3] : 'UNKNOWN';
        console.log(`      Extracted bucket from URL: ${bucket}`);
      }
      console.log('');
    });
    
    findings.push({
      table: 'hero_slides',
      totalRecords: slides.length,
      withMediaId: slides.filter(s => s.media_id).length,
      withImageUrl: slides.filter(s => s.image_url).length
    });
  }
} catch (error) {
  console.log(`   ❌ Query failed: ${error.message}`);
}

// ============================================================
// STEP 6: CHECK MEDIA LIBRARY PICKER
// ============================================================

console.log('\n📍 STEP 6: Comparing with Media Library implementation\n');

const mediaLibraryPath = join(rootPath, 'src/features/media/media-library-view.tsx');
const mediaLibrary = readFileSync(mediaLibraryPath, 'utf-8');

// Find how Media Library queries
const mlApiMatch = mediaLibrary.match(/\/api\/[^\s'"<>]*/g);
if (mlApiMatch) {
  console.log('   Media Library API calls:');
  [...new Set(mlApiMatch)].forEach(api => {
    console.log(`   • ${api}`);
  });
}

// ============================================================
// COMPARISON TABLE
// ============================================================

console.log('\n\n═══════════════════════════════════════════════════════════');
console.log('  COMPARISON TABLE');
console.log('═══════════════════════════════════════════════════════════\n');

console.log('| Component | Requests | Actual Data | Match |');
console.log('|-----------|----------|-------------|-------|');

const heroBucketRequest = findings.find(f => f.component === 'Hero MediaPickerModal')?.bucket || 'UNKNOWN';
const actualBuckets = findings.find(f => f.component === 'media_assets')?.buckets || {};
const queryResults = findings.find(f => f.query === 'bucket=media-content')?.results || 0;

console.log(`| Picker bucket filter | ${heroBucketRequest} | ${Object.keys(actualBuckets).join(', ')} | ${queryResults === 0 ? '❌' : '✅'} |`);
console.log(`| Query results | Expected: >0 | Actual: ${queryResults} | ${queryResults === 0 ? '❌ ZERO' : '✅'} |`);

// ============================================================
// ROOT CAUSE ANALYSIS
// ============================================================

console.log('\n\n═══════════════════════════════════════════════════════════');
console.log('  ROOT CAUSE ANALYSIS');
console.log('═══════════════════════════════════════════════════════════\n');

const actualBucketNames = Object.keys(actualBuckets);
const hasMediaContent = actualBucketNames.includes('media-content');
const totalAssets = findings.find(f => f.component === 'media_assets')?.totalRecords || 0;

if (queryResults === 0 && totalAssets > 0) {
  console.log('🔴 ROOT CAUSE IDENTIFIED:\n');
  console.log(`   Hero Slide picker requests: bucket="${heroBucketRequest}"`);
  console.log(`   Actual media_assets buckets: ${actualBucketNames.join(', ')}`);
  console.log(`   Query returns: ${queryResults} records\n`);
  
  if (!hasMediaContent) {
    console.log('   ❌ BUCKET MISMATCH');
    console.log(`   No media_assets records have bucket="media-content"`);
    console.log(`   All ${totalAssets} media assets use different bucket values\n`);
  }
  
  console.log('HYPOTHESIS:');
  console.log('   Hero Slide picker was designed to filter bucket="media-content"');
  console.log('   but media_assets records were created with different bucket values.');
  console.log('   This creates a permanent empty state in the picker.\n');
}

// ============================================================
// RECOMMENDED FIX
// ============================================================

console.log('═══════════════════════════════════════════════════════════');
console.log('  RECOMMENDED FIX');
console.log('═══════════════════════════════════════════════════════════\n');

if (queryResults === 0) {
  const mostCommonBucket = Object.entries(actualBuckets).sort((a, b) => b[1] - a[1])[0];
  
  console.log('OPTION A: Remove bucket filter from Hero picker');
  console.log('   • Modify website-cms.tsx MediaPickerModal');
  console.log('   • Remove bucket="media-content" prop');
  console.log('   • Shows all media_assets records');
  console.log('   • Smallest change, safest option\n');
  
  console.log('OPTION B: Update media_assets bucket values');
  console.log('   • Update existing records to bucket="media-content"');
  console.log('   • Requires database migration');
  console.log('   • Risk: May break other components expecting current bucket values\n');
  
  console.log('OPTION C: Change bucket filter to match actual data');
  console.log(`   • Change filter from "media-content" to "${mostCommonBucket[0]}"`);
  console.log('   • Still filters, but matches actual data');
  console.log('   • May exclude some assets\n');
  
  console.log('🟢 RECOMMENDED: Option A (remove bucket filter)');
  console.log('   Safest, smallest change, immediately fixes the issue.\n');
}

// ============================================================
// FILES TO MODIFY
// ============================================================

console.log('═══════════════════════════════════════════════════════════');
console.log('  FILES REQUIRING MODIFICATION (Option A)');
console.log('═══════════════════════════════════════════════════════════\n');

console.log('1. src/features/cms/website-cms.tsx');
console.log('   Line ~250-260 (Hero MediaPickerModal)');
console.log('   Remove: bucket="media-content"');
console.log('   Or change to: bucket={undefined}\n');

// ============================================================
// SAVE REPORT
// ============================================================

const report = {
  timestamp: new Date().toISOString(),
  findings,
  rootCause: queryResults === 0 ? 'Bucket filter mismatch' : 'Unknown',
  recommendation: 'Remove bucket filter from Hero MediaPickerModal',
  filesToModify: ['src/features/cms/website-cms.tsx']
};

import { writeFileSync } from 'fs';
writeFileSync(
  join(__dirname, '../HERO_IMAGE_PICKER_DIAGNOSTIC_REPORT.json'),
  JSON.stringify(report, null, 2)
);

console.log('═══════════════════════════════════════════════════════════');
console.log('  DIAGNOSTIC COMPLETE');
console.log('═══════════════════════════════════════════════════════════\n');

console.log('Report saved: HERO_IMAGE_PICKER_DIAGNOSTIC_REPORT.json\n');
console.log('Next step: Review findings and apply recommended fix.\n');
