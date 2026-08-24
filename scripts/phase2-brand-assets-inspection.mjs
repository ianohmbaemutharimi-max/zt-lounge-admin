#!/usr/bin/env node
/**
 * PHASE 2 — BRAND ASSETS INSPECTION
 *
 * Locate actual production logo and favicon.
 * Inspect local files + Supabase Storage + media_assets.
 *
 * READ-ONLY: No modifications to database or files.
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

config({ path: path.join(ROOT, '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log(`
═══════════════════════════════════════════════════════════
  PHASE 2 — BRAND ASSETS INSPECTION
  READ-ONLY ANALYSIS
═══════════════════════════════════════════════════════════
`);

const report = {
  timestamp: new Date().toISOString(),
  logo: {
    local_files: [],
    storage_objects: [],
    media_assets_records: [],
    canonical_match: null
  },
  favicon: {
    local_files: [],
    storage_objects: [],
    media_assets_records: [],
    canonical_match: null
  }
};

// ============================================================
// 1. INSPECT LOCAL LOGO FILES
// ============================================================

console.log('📋 [1/4] Inspecting local logo files...\n');

async function inspectLocalLogo() {
  const logoDirs = [
    path.join(ROOT, 'public/images/logo'),
    path.join(ROOT, 'public/images'),
    path.join(ROOT, 'public')
  ];

  for (const dir of logoDirs) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile()) {
          const name = entry.name.toLowerCase();
          if (name.includes('logo') || name.includes('favicon') || name.includes('icon')) {
            const fullPath = path.join(dir, entry.name);
            const stats = await fs.stat(fullPath);
            
            // Get relative path from public for URL reference
            const relPath = path.relative(path.join(ROOT, 'public'), fullPath).replace(/\\/g, '/');
            
            const logoEntry = {
              file: entry.name,
              relative_path: relPath,
              absolute_path: fullPath,
              size_bytes: stats.size,
              is_logo: name.includes('logo'),
              is_favicon: name.includes('favicon') || name.includes('icon')
            };
            
            if (logoEntry.is_logo) {
              report.logo.local_files.push(logoEntry);
              console.log(`   📷 ${entry.name} — ${stats.size} bytes (${relPath})`);
            }
            if (logoEntry.is_favicon) {
              report.favicon.local_files.push(logoEntry);
              console.log(`   🟡 ${entry.name} — ${stats.size} bytes (${relPath}) [FAVICON]`);
            }
          }
        }
      }
    } catch (err) {
      // Directory may not exist
    }
  }
}

await inspectLocalLogo();

// ============================================================
// 2. INSPECT STORAGE OBJECTS
// ============================================================

console.log('\n📋 [2/4] Inspecting Supabase Storage objects...\n');

async function inspectStorageObjects() {
  const buckets = ['logos', 'public-assets', 'brand-assets', 'assets'];

  for (const bucket of buckets) {
    try {
      // List all objects in the bucket
      const { data, error } = await supabase.storage
        .from(bucket)
        .list('', { limit: 100 });
      
      if (error) {
        console.log(`   ⚠️  Bucket "${bucket}": ${error.message}`);
        continue;
      }
      
      const logoObjects = data?.filter(item => {
        const name = item.name.toLowerCase();
        return name.includes('logo') && !item.name.endsWith('/');
      }) || [];
      
      const faviconObjects = data?.filter(item => {
        const name = item.name.toLowerCase();
        return (name.includes('favicon') || name.includes('favicon.ico') || name.includes('icon')) && !item.name.endsWith('/');
      }) || [];
      
      if (logoObjects.length > 0) {
        report.logo.storage_objects.push({ bucket, objects: logoObjects });
        console.log(`   📦 Bucket: ${bucket} — ${logoObjects.length} logo objects`);
        for (const obj of logoObjects) {
          console.log(`      ${obj.name} — ${obj.metadata?.size || 'size?'} bytes`);
        }
      }
      
      if (faviconObjects.length > 0) {
        report.favicon.storage_objects.push({ bucket, objects: faviconObjects });
        console.log(`   📦 Bucket: ${bucket} — ${faviconObjects.length} favicon objects`);
        for (const obj of faviconObjects) {
          console.log(`      ${obj.name} — ${obj.metadata?.size || 'size?'} bytes`);
        }
      }
    } catch (err) {
      console.log(`   ⚠️  Bucket "${bucket}": ${err.message}`);
    }
  }
}

await inspectStorageObjects();

// ============================================================
// 3. MATCH TO media_assets
// ============================================================

console.log('\n📋 [3/4] Matching to media_assets...\n');

async function matchMediaAssets() {
  // Load all media_assets
  const { data: mediaAssets, error } = await supabase
    .from('media_assets')
    .select('*');

  if (error) {
    console.log(`   ❌ Failed to load media_assets: ${error.message}`);
    return;
  }

  // Find logo matches
  const logoMatches = mediaAssets.filter(a => {
    return a.bucket === 'logos' || 
           (a.path && a.path.toLowerCase().includes('logo')) ||
           (a.title && a.title.toLowerCase().includes('logo'));
  });

  if (logoMatches.length === 1) {
    report.logo.media_assets_records = logoMatches;
    report.logo.canonical_match = logoMatches[0];
    console.log(`   ✅ Logo match found in media_assets`);
    console.log(`      ID: ${logoMatches[0].id}`);
    console.log(`      bucket: ${logoMatches[0].bucket}`);
    console.log(`      path: ${logoMatches[0].path}`);
    console.log(`      public_url: ${logoMatches[0].public_url}`);
  } else if (logoMatches.length > 1) {
    report.logo.media_assets_records = logoMatches;
    report.logo.canonical_match = null;
    console.log(`   ⚠️  Multiple logo records in media_assets (${logoMatches.length})`);
  }

  // Find favicon matches
  const faviconMatches = mediaAssets.filter(a => {
    return (a.path && a.path.toLowerCase().includes('favicon')) ||
           (a.path && a.path.toLowerCase().includes('icon')) ||
           (a.title && a.title.toLowerCase().includes('favicon')) ||
           (a.title && a.title.toLowerCase().includes('icon'));
  });

  if (faviconMatches.length > 0) {
    report.favicon.media_assets_records = faviconMatches;
    report.favicon.canonical_match = faviconMatches[0];
    console.log(`   ✅ Favicon match(es) found in media_assets (${faviconMatches.length})`);
    for (const match of faviconMatches) {
      console.log(`      ID: ${match.id}, path: ${match.path}, bucket: ${match.bucket}`);
    }
  } else {
    console.log(`   ⚠️  No favicon found in media_assets`);
    console.log(`      Favicon uses local path: /favicon.ico`);
  }

  // Check for the logo URL from business_settings in media_assets
  const bizLogoUrl = 'https://jczwilrysvnhcjzjztbi.supabase.co/storage/v1/object/public/logos/logo.webp';
  const exactLogoMatch = mediaAssets.find(a => a.public_url === bizLogoUrl);
  
  if (exactLogoMatch && !report.logo.canonical_match) {
    report.logo.canonical_match = exactLogoMatch;
    console.log(`   ✅ Exact match for business_settings logo_url in media_assets`);
    console.log(`      ID: ${exactLogoMatch.id}`);
  }
}

await matchMediaAssets();

// ============================================================
// 4. VERIFY STORAGE OBJECT EXISTS
// ============================================================

console.log('\n📋 [4/4] Verifying Storage objects exist...\n');

async function verifyStorageObjects() {
  // Verify logo exists in Storage
  if (report.logo.canonical_match) {
    const asset = report.logo.canonical_match;
    try {
      const { data: { publicUrl } } = supabase.storage
        .from(asset.bucket)
        .getPublicUrl(asset.path);
      
      const res = await fetch(publicUrl, { method: 'HEAD' });
      if (res.ok) {
        console.log(`   ✅ Logo Storage object accessible: ${asset.bucket}/${asset.path}`);
        report.logo.storage_verified = true;
      } else {
        console.log(`   ❌ Logo Storage object returned ${res.status}`);
        report.logo.storage_verified = false;
      }
    } catch (err) {
      console.log(`   ⚠️  Could not verify logo Storage object: ${err.message}`);
    }
  }

  // Check favicon — it's a local file
  const faviconPath = path.join(ROOT, 'public/favicon.ico');
  try {
    const stats = await fs.stat(faviconPath);
    console.log(`   ✅ Local favicon exists: /favicon.ico (${stats.size} bytes)`);
    report.favicon.local_verified = true;
  } catch {
    console.log(`   ⚠️  Local favicon not found: /favicon.ico`);
    
    // Check other locations
    const iconPaths = [
      path.join(ROOT, 'public/images/logo/zt-lounge-logo.png'),
      path.join(ROOT, 'public/images/favicon.ico'),
    ];
    
    for (const p of iconPaths) {
      try {
        const stats = await fs.stat(p);
        console.log(`   ℹ️  Found at: ${path.relative(path.join(ROOT, 'public'), p).replace(/\\/g, '/')} (${stats.size} bytes)`);
        report.favicon.local_files.push({
          file: path.basename(p),
          relative_path: path.relative(path.join(ROOT, 'public'), p).replace(/\\/g, '/'),
          size_bytes: stats.size
        });
      } catch {
        // not found
      }
    }
  }
}

await verifyStorageObjects();

// ============================================================
// SUMMARY
// ============================================================

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  PHASE 2 BRAND ASSETS SUMMARY');
console.log('═══════════════════════════════════════════════════════════\n');

console.log('LOGO:');
if (report.logo.canonical_match) {
  console.log(`   media_asset ID: ${report.logo.canonical_match.id}`);
  console.log(`   bucket: ${report.logo.canonical_match.bucket}`);
  console.log(`   path: ${report.logo.canonical_match.path}`);
  console.log(`   public_url: ${report.logo.canonical_match.public_url}`);
  console.log(`   Storage verified: ${report.logo.storage_verified ? '✅' : '⚠️'}`);
  console.log(`   Local files: ${report.logo.local_files.length}`);
  console.log(`   Ready for business_settings: ✅`);
} else {
  console.log(`   Status: NO CANONICAL MATCH FOUND`);
  console.log(`   Ready for business_settings: ❌ (needs creation)`);
}

console.log('\nFAVICON:');
if (report.favicon.canonical_match) {
  console.log(`   media_asset ID: ${report.favicon.canonical_match.id}`);
  console.log(`   Ready for business_settings: ✅`);
} else {
  console.log(`   Status: LOCAL FILE (/favicon.ico)`);
  console.log(`   media_asset available: ❌ (needs creation or use local fallback)`);
  console.log(`   Ready for business_settings: ⚠️  (will use local fallback)`);
}

// ============================================================
// SAVE REPORT
// ============================================================

const reportPath = path.join(ROOT, 'PHASE2_BRAND_ASSETS_INSPECTION.json');
await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

console.log(`\n📝 Report saved: ${reportPath}`);
console.log('\n═══════════════════════════════════════════════════════════');
console.log('  PHASE 2 COMPLETE');
console.log('  NEXT: Phase 3 — Populate CMS media_id values');
console.log('═══════════════════════════════════════════════════════════');
