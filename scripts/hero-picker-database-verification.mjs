#!/usr/bin/env node

/**
 * HERO PICKER DATABASE VERIFICATION
 * 
 * READ-ONLY investigation of actual media_assets data
 * to confirm or reject the bucket mismatch hypothesis.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootPath = join(__dirname, '..');

// Load environment variables
config({ path: join(rootPath, '.env.local') });
config({ path: join(rootPath, '.env') });

console.log('═══════════════════════════════════════════════════════════');
console.log('  HERO PICKER DATABASE VERIFICATION');
console.log('═══════════════════════════════════════════════════════════\n');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log('❌ Missing environment variables:');
  console.log(`   NEXT_PUBLIC_SUPABASE_URL: ${supabaseUrl ? '✓' : '❌'}`);
  console.log(`   SUPABASE_SERVICE_ROLE_KEY: ${supabaseKey ? '✓' : '❌'}`);
  console.log('\nPlease ensure .env.local or .env contains these values.\n');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const findings = {};

// ============================================================
// PHASE 1: CODE INSPECTION SUMMARY
// ============================================================

console.log('PHASE 1: CODE INSPECTION SUMMARY\n');

const mediaPickerPath = join(rootPath, 'src/features/media/media-picker-modal.tsx');
const mediaPicker = readFileSync(mediaPickerPath, 'utf-8');

const bucketMatch = mediaPicker.match(/bucket:\s*["']([^"']+)["']/);
if (bucketMatch) {
  console.log(`✓ MediaPickerModal hardcoded bucket: "${bucketMatch[1]}"`);
  findings.hardcodedBucket = bucketMatch[1];
} else {
  console.log('  No hardcoded bucket found in MediaPickerModal');
  findings.hardcodedBucket = null;
}

console.log('');

// ============================================================
// PHASE 2: DATABASE BUCKET DISTRIBUTION
// ============================================================

console.log('PHASE 2: DATABASE VERIFICATION\n');
console.log('Query 1: Bucket distribution\n');

try {
  const { data: bucketData, error: bucketError } = await supabase
    .from('media_assets')
    .select('bucket');

  if (bucketError) {
    console.log(`❌ Error querying media_assets: ${bucketError.message}`);
    process.exit(1);
  }

  const bucketCounts = {};
  bucketData.forEach(row => {
    const bucket = row.bucket || 'NULL';
    bucketCounts[bucket] = (bucketCounts[bucket] || 0) + 1;
  });

  console.log(`Total media_assets records: ${bucketData.length}\n`);
  console.log('Bucket distribution:');
  
  Object.entries(bucketCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([bucket, count]) => {
      const pct = ((count / bucketData.length) * 100).toFixed(1);
      console.log(`  • ${bucket}: ${count} records (${pct}%)`);
    });

  findings.totalRecords = bucketData.length;
  findings.bucketDistribution = bucketCounts;
  
  console.log('');

} catch (error) {
  console.log(`❌ Database query failed: ${error.message}`);
  process.exit(1);
}

// ============================================================
// PHASE 3: TEST HARDCODED QUERY
// ============================================================

console.log('PHASE 3: TEST HARDCODED PICKER QUERY\n');

if (findings.hardcodedBucket) {
  console.log(`Simulating picker query: WHERE bucket = '${findings.hardcodedBucket}'\n`);

  const { data: filteredData, error: filterError } = await supabase
    .from('media_assets')
    .select('id, title, bucket, mime_type, public_url')
    .eq('bucket', findings.hardcodedBucket)
    .limit(24);

  if (filterError) {
    console.log(`❌ Query error: ${filterError.message}`);
  } else {
    console.log(`✓ Query returned ${filteredData.length} records\n`);
    
    if (filteredData.length === 0) {
      console.log('🔴 CONFIRMED: Zero records match the hardcoded bucket filter\n');
      findings.queryResult = 'ZERO_RECORDS';
    } else {
      console.log('Sample results:');
      filteredData.slice(0, 3).forEach((asset, idx) => {
        console.log(`  ${idx + 1}. ${asset.title || 'Untitled'}`);
        console.log(`     Bucket: ${asset.bucket}`);
        console.log(`     Type: ${asset.mime_type}`);
      });
      findings.queryResult = filteredData.length;
    }
  }
} else {
  console.log('No hardcoded bucket to test (picker may show all media)\n');
}

console.log('');

// ============================================================
// PHASE 4: SAMPLE EXISTING MEDIA
// ============================================================

console.log('PHASE 4: SAMPLE EXISTING MEDIA ASSETS\n');

const { data: sampleData, error: sampleError } = await supabase
  .from('media_assets')
  .select('id, title, bucket, storage_path, mime_type, public_url, created_at')
  .order('created_at', { ascending: false })
  .limit(10);

if (sampleError) {
  console.log(`❌ Error: ${sampleError.message}`);
} else {
  console.log(`Showing ${sampleData.length} most recent media assets:\n`);
  
  sampleData.forEach((asset, idx) => {
    console.log(`${idx + 1}. ${asset.title || 'Untitled'}`);
    console.log(`   ID: ${asset.id}`);
    console.log(`   Bucket: ${asset.bucket || 'NULL'}`);
    console.log(`   Path: ${asset.storage_path || 'NULL'}`);
    console.log(`   Type: ${asset.mime_type || 'NULL'}`);
    console.log(`   URL: ${asset.public_url ? asset.public_url.substring(0, 80) + '...' : 'NULL'}`);
    console.log(`   Created: ${asset.created_at}`);
    console.log('');
  });
}

// ============================================================
// PHASE 5: CHECK HERO_SLIDES INTEGRATION
// ============================================================

console.log('PHASE 5: HERO_SLIDES INTEGRATION CHECK\n');

const { data: heroSlides, error: heroError } = await supabase
  .from('hero_slides')
  .select('id, title, media_id, image_url')
  .order('display_order', { ascending: true });

if (heroError) {
  console.log(`❌ Error: ${heroError.message}`);
} else {
  console.log(`Total hero_slides: ${heroSlides.length}\n`);
  
  let withMediaId = 0;
  let withImageUrl = 0;
  
  heroSlides.forEach((slide, idx) => {
    console.log(`${idx + 1}. ${slide.title}`);
    console.log(`   media_id: ${slide.media_id || 'NULL'}`);
    console.log(`   image_url: ${slide.image_url ? slide.image_url.substring(0, 80) + '...' : 'NULL'}`);
    
    if (slide.media_id) withMediaId++;
    if (slide.image_url) withImageUrl++;
    
    // Try to extract bucket from URL
    if (slide.image_url && slide.image_url.includes('/storage/v1/object/public/')) {
      const urlParts = slide.image_url.split('/storage/v1/object/public/');
      if (urlParts[1]) {
        const pathParts = urlParts[1].split('/');
        console.log(`   URL bucket hint: ${pathParts[0]}`);
      }
    }
    console.log('');
  });
  
  console.log(`Summary: ${withMediaId} with media_id, ${withImageUrl} with image_url\n`);
  findings.heroSlides = { total: heroSlides.length, withMediaId, withImageUrl };
}

// ============================================================
// PHASE 6: ROOT CAUSE DETERMINATION
// ============================================================

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  ROOT CAUSE ANALYSIS');
console.log('═══════════════════════════════════════════════════════════\n');

const defectConfirmed = 
  findings.hardcodedBucket &&
  findings.queryResult === 'ZERO_RECORDS' &&
  findings.totalRecords > 0;

if (defectConfirmed) {
  console.log('🔴 DEFECT CONFIRMED\n');
  console.log('Evidence:');
  console.log(`  1. MediaPickerModal hardcodes: bucket="${findings.hardcodedBucket}"`);
  console.log(`  2. Database contains: ${findings.totalRecords} total media_assets`);
  console.log(`  3. Query with bucket="${findings.hardcodedBucket}": ZERO results`);
  console.log(`  4. Actual buckets: ${Object.keys(findings.bucketDistribution).join(', ')}\n`);
  console.log('Conclusion:');
  console.log('  The hardcoded bucket filter does not match any actual database records.');
  console.log('  This causes the picker to永远 display "No media assets found".\n');
  
} else if (!findings.hardcodedBucket) {
  console.log('ℹ️  NO HARDCODED BUCKET FOUND\n');
  console.log('The MediaPickerModal may already allow all buckets.');
  console.log('Further investigation needed if picker still shows empty.\n');
  
} else if (findings.queryResult !== 'ZERO_RECORDS') {
  console.log('✅ NO DEFECT DETECTED\n');
  console.log(`The hardcoded bucket="${findings.hardcodedBucket}" returns ${findings.queryResult} records.`);
  console.log('If the picker shows empty, the issue is elsewhere (RLS, pagination, etc.).\n');
}

// ============================================================
// PHASE 7: RECOMMENDED FIX
// ============================================================

if (defectConfirmed) {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  RECOMMENDED FIX');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  const mostCommonBucket = Object.entries(findings.bucketDistribution)
    .sort((a, b) => b[1] - a[1])[0];
  
  console.log('OPTION A: Remove hardcoded bucket filter (RECOMMENDED)\n');
  console.log('File: src/features/media/media-picker-modal.tsx');
  console.log('Change:');
  console.log('  bucket: "media-content",  // ❌ Remove this line');
  console.log('  // or:');
  console.log('  bucket: undefined,  // ✅ Show all media\n');
  
  console.log('OPTION B: Make bucket configurable\n');
  console.log('Add optional bucket prop to MediaPickerModalProps');
  console.log('Pass bucket from parent component if filtering is needed\n');
  
  console.log(`OPTION C: Change to most common bucket: "${mostCommonBucket[0]}"\n`);
  console.log(`This would show ${mostCommonBucket[1]} assets`);
  console.log('But may exclude assets in other buckets\n');
  
  console.log('🟢 Recommended: Option A (smallest change, shows all media)\n');
}

// ============================================================
// SAVE REPORT
// ============================================================

const report = {
  timestamp: new Date().toISOString(),
  findings,
  defectConfirmed,
  recommendation: defectConfirmed ? 'Remove hardcoded bucket filter' : 'No fix needed'
};

import { writeFileSync } from 'fs';
writeFileSync(
  join(rootPath, 'HERO_PICKER_DATABASE_VERIFICATION.json'),
  JSON.stringify(report, null, 2)
);

console.log('═══════════════════════════════════════════════════════════');
console.log('  VERIFICATION COMPLETE');
console.log('═══════════════════════════════════════════════════════════\n');
console.log('Report saved: HERO_PICKER_DATABASE_VERIFICATION.json\n');

if (defectConfirmed) {
  console.log('Status: 🔴 DEFECT CONFIRMED — FIX READY\n');
  process.exit(0);
} else {
  console.log('Status: ✅ NO DEFECT — OR ALREADY FIXED\n');
  process.exit(0);
}
