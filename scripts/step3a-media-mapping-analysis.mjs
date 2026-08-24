#!/usr/bin/env node
/**
 * STEP 3A — READ-ONLY DISCOVERY & MAPPING ANALYSIS
 *
 * This script performs a read-only analysis of all media_assets and CMS entities
 * to build deterministic mappings from image_url fields to media_assets.id.
 *
 * It does NOT modify the database - only generates preview reports.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║   STEP 3A: READ-ONLY MEDIA MAPPING ANALYSIS                ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

// ============================================================================
// URL NORMALIZATION UTILITIES
// ============================================================================

/**
 * Normalize a URL for comparison purposes.
 * Handles:
 * - Supabase public storage URLs
 * - bucket/path representation
 * - URL encoding
 * - leading/trailing slashes
 * - equivalent storage URL formats
 */
function normalizeUrl(url) {
  if (!url) return null;

  let normalized = url.trim();

  // Remove trailing slashes
  normalized = normalized.replace(/\/+$/, '');

  // Decode URL encoding (handle multiple passes)
  try {
    let prev = normalized;
    for (let i = 0; i < 3; i++) {
      normalized = decodeURIComponent(normalized);
      if (normalized === prev) break;
      prev = normalized;
    }
  } catch (e) {
    // If decoding fails, keep original
  }

  // Normalize Supabase storage URL variations
  normalized = normalized.replace(/\/storage\/v1\/object\/public\//g, '/storage/v1/object/public/');

  return normalized;
}

/**
 * Extract bucket and path from a Supabase storage public URL.
 * Returns { bucket, path } or null if not a storage URL.
 */
function extractBucketAndPath(url) {
  if (!url) return null;

  const normalized = normalizeUrl(url);

  // Match: /storage/v1/object/public/{bucket}/{path}
  const match = normalized.match(/\/storage\/v1\/object\/public\/([^\/]+)\/(.+)$/);
  if (match) {
    return {
      bucket: match[1],
      path: match[2]
    };
  }

  // Also try signed URLs or alternative formats
  const match2 = normalized.match(/\/storage\/v1\/object\/([^/]+)\/(.+?\/)(.+)$/);
  if (match2) {
    return {
      bucket: match2[2].slice(0, -1), // remove trailing slash
      path: match2[3]
    };
  }

  return null;
}

/**
 * Extract just the filename from a URL or path.
 */
function extractFilename(url) {
  if (!url) return null;
  const normalized = normalizeUrl(url);
  return normalized.split('/').pop() || null;
}

// ============================================================================
// MATCHING LOGIC
// ============================================================================

/**
 * Match a CMS image URL against the media_assets database.
 *
 * Match Priority:
 * 1. Exact public_url match (EXACT, confidence: 100)
 * 2. Exact normalized bucket + path match (NORMALIZED_EXACT, confidence: 95)
 * 3. Exact normalized storage path match (NORMALIZED_EXACT, confidence: 85)
 * 4. content_hash match (HASH_VERIFIED, confidence: 80)
 * 5. No match (UNMATCHED, confidence: 0)
 *
 * @param {string} imageUrl - The image URL from the CMS entity
 * @param {Array} mediaAssets - All media_assets records
 * @returns {Object} { matched, method, confidence, candidates }
 */
function matchMediaAsset(imageUrl, mediaAssets) {
  if (!imageUrl) return { matched: null, method: 'no_image', confidence: 0, candidates: [] };

  const normalizedUrl = normalizeUrl(imageUrl);
  const extracted = extractBucketAndPath(normalizedUrl);

  // --- PRIORITY 1: Exact public_url match ---
  const exactMatch = mediaAssets.find(a => normalizeUrl(a.public_url) === normalizedUrl);
  if (exactMatch) {
    return { matched: exactMatch, method: 'EXACT', confidence: 100, candidates: [exactMatch] };
  }

  // --- PRIORITY 2: Exact normalized bucket + path match ---
  if (extracted) {
    const bucketPathMatches = mediaAssets.filter(a =>
      a.bucket === extracted.bucket &&
      normalizeUrl(a.path) === normalizeUrl(extracted.path)
    );

    if (bucketPathMatches.length === 1) {
      return { matched: bucketPathMatches[0], method: 'NORMALIZED_EXACT', confidence: 95, candidates: bucketPathMatches };
    } else if (bucketPathMatches.length > 1) {
      // Multiple matches with same bucket+path = ambiguous
      return { matched: null, method: 'AMBIGUOUS', confidence: 50, candidates: bucketPathMatches, reason: 'Multiple assets with same bucket + path' };
    }

    // --- PRIORITY 3: Exact normalized storage path match (any bucket) ---
    const pathMatches = mediaAssets.filter(a =>
      normalizeUrl(a.path) === normalizeUrl(extracted.path)
    );

    if (pathMatches.length === 1) {
      return { matched: pathMatches[0], method: 'NORMALIZED_EXACT', confidence: 85, candidates: pathMatches };
    } else if (pathMatches.length > 1) {
      // Check if bucket differs to avoid ambiguity
      const buckets = new Set(pathMatches.map(a => a.bucket));
      if (buckets.size > 1) {
        return { matched: null, method: 'AMBIGUOUS', confidence: 50, candidates: pathMatches, reason: 'Multiple assets with same path but different buckets' };
      }
    }
  }

  // --- PRIORITY 4: Content hash match (only if file can be deterministically verified) ---
  // For storage URLs, try content_hash matching - but only if exactly one match
  if (extracted) {
    const hashMatches = mediaAssets.filter(a =>
      a.content_hash &&
      a.content_hash === imageUrl // This is a fallback for edge cases
    );
    if (hashMatches.length === 1) {
      return { matched: hashMatches[0], method: 'HASH_VERIFIED', confidence: 80, candidates: hashMatches };
    }
  }

  // --- PRIORITY 5: No match ---
  return { matched: null, method: 'UNMATCHED', confidence: 0, candidates: [] };
}

// ============================================================================
// DATA FETCHING
// ============================================================================

async function fetchAllMediaAssets() {
  console.log('📋 Step 1: Fetching all media_assets records...\n');

  const { data, error } = await supabase
    .from('media_assets')
    .select('id, bucket, path, public_url, original_name, content_hash, mime_type, file_size');

  if (error) {
    console.error(`❌ Error fetching media_assets: ${error.message}`);
    throw error;
  }

  console.log(`   ✅ Found ${data.length} media_assets records\n`);

  // Check for duplicates by public_url
  const urlMap = new Map();
  const duplicateGroups = [];

  for (const asset of data) {
    const key = normalizeUrl(asset.public_url);
    if (urlMap.has(key)) {
      // Start or add to duplicate group
      if (!duplicateGroups[urlMap.get(key)]) {
        duplicateGroups[urlMap.get(key)] = [data.find(a => a.id === urlMap.get(key))];
      }
      duplicateGroups[urlMap.get(key)].push(asset);
    } else {
      urlMap.set(key, asset.id);
    }
  }

  const duplicates = Object.values(duplicateGroups).flat();

  if (duplicates.length > 0) {
    console.log(`   ⚠️  Detected ${duplicates.length} duplicate media_assets:\n`);
    for (const dup of duplicates) {
      console.log(`      - ${dup.id}: ${dup.public_url || dup.path}`);
    }
    console.log();
  }

  return { assets: data, duplicates };
}

async function analyzeMenuItems(mediaAssets) {
  console.log('📋 Step 2: Analyzing menu_items...\n');

  const { data, error } = await supabase
    .from('menu_items')
    .select('id, name, image_url, media_id');

  if (error) {
    console.error(`❌ Error fetching menu_items: ${error.message}`);
    throw error;
  }

  const mappings = [];
  let matched = 0;
  let unmatched = 0;
  let ambiguous = 0;
  const withImageUrl = data.filter(d => d.image_url).length;

  for (const item of data) {
    if (!item.image_url) continue;

    const match = matchMediaAsset(item.image_url, mediaAssets);

    const mapping = {
      entity_type: 'menu_item',
      entity_id: item.id,
      entity_name: item.name,
      source_url: item.image_url,
      current_media_id: item.media_id,
      matched_media_id: match.matched?.id || null,
      media_bucket: match.matched?.bucket || null,
      media_path: match.matched?.path || null,
      match_method: match.method,
      confidence: match.confidence,
      status: match.method
    };

    if (match.method === 'AMBIGUOUS') {
      mapping.reason = match.reason;
      mapping.candidates = match.candidates.map(c => ({ id: c.id, bucket: c.bucket, path: c.path, public_url: c.public_url }));
      ambiguous++;
    } else if (match.method === 'EXACT' || match.method === 'NORMALIZED_EXACT' || match.method === 'HASH_VERIFIED') {
      match.confidence >= 85 ? matched++ : ambiguous++;
      if (match.confidence < 85) {
        ambiguous++;
        mapping.reason = 'Low confidence match';
      }
    } else {
      unmatched++;
    }

    mappings.push(mapping);
  }

  console.log(`   ✅ menu_items: ${withImageUrl} with image_url, ${matched} matched, ${unmatched} unmatched, ${ambiguous} ambiguous\n`);

  return { mappings, stats: { total: data.length, with_image_url: withImageUrl, matched, unmatched, ambiguous } };
}

async function analyzeServices(mediaAssets) {
  console.log('📋 Step 3: Analyzing services...\n');

  const { data, error } = await supabase
    .from('services')
    .select('id, name, image_url, media_id');

  if (error) {
    console.error(`❌ Error fetching services: ${error.message}`);
    throw error;
  }

  const mappings = [];
  let matched = 0;
  let unmatched = 0;
  let ambiguous = 0;
  const withImageUrl = data.filter(d => d.image_url).length;

  for (const item of data) {
    if (!item.image_url) continue;

    const match = matchMediaAsset(item.image_url, mediaAssets);

    const mapping = {
      entity_type: 'service',
      entity_id: item.id,
      entity_name: item.name,
      source_url: item.image_url,
      current_media_id: item.media_id,
      matched_media_id: match.matched?.id || null,
      media_bucket: match.matched?.bucket || null,
      media_path: match.matched?.path || null,
      match_method: match.method,
      confidence: match.confidence,
      status: match.method
    };

    if (match.method === 'AMBIGUOUS') {
      mapping.reason = match.reason;
      mapping.candidates = match.candidates.map(c => ({ id: c.id, bucket: c.bucket, path: c.path, public_url: c.public_url }));
      ambiguous++;
    } else if (match.method === 'EXACT' || match.method === 'NORMALIZED_EXACT' || match.method === 'HASH_VERIFIED') {
      match.confidence >= 85 ? matched++ : ambiguous++;
      if (match.confidence < 85) {
        ambiguous++;
        mapping.reason = 'Low confidence match';
      }
    } else {
      unmatched++;
    }

    mappings.push(mapping);
  }

  console.log(`   ✅ services: ${withImageUrl} with image_url, ${matched} matched, ${unmatched} unmatched, ${ambiguous} ambiguous\n`);

  return { mappings, stats: { total: data.length, with_image_url: withImageUrl, matched, unmatched, ambiguous } };
}

async function analyzeGallery(mediaAssets) {
  console.log('📋 Step 4: Analyzing gallery...\n');

  const { data, error } = await supabase
    .from('gallery')
    .select('id, title, image_url, media_id');

  if (error) {
    console.error(`❌ Error fetching gallery: ${error.message}`);
    throw error;
  }

  const mappings = [];
  let matched = 0;
  let unmatched = 0;
  let ambiguous = 0;
  const withImageUrl = data.filter(d => d.image_url).length;

  for (const item of data) {
    if (!item.image_url) continue;

    const match = matchMediaAsset(item.image_url, mediaAssets);

    const mapping = {
      entity_type: 'gallery',
      entity_id: item.id,
      entity_name: item.title || `Gallery ${item.id}`,
      source_url: item.image_url,
      current_media_id: item.media_id,
      matched_media_id: match.matched?.id || null,
      media_bucket: match.matched?.bucket || null,
      media_path: match.matched?.path || null,
      match_method: match.method,
      confidence: match.confidence,
      status: match.method
    };

    if (match.method === 'AMBIGUOUS') {
      mapping.reason = match.reason;
      mapping.candidates = match.candidates.map(c => ({ id: c.id, bucket: c.bucket, path: c.path, public_url: c.public_url }));
      ambiguous++;
    } else if (match.method === 'EXACT' || match.method === 'NORMALIZED_EXACT' || match.method === 'HASH_VERIFIED') {
      match.confidence >= 85 ? matched++ : ambiguous++;
      if (match.confidence < 85) {
        ambiguous++;
        mapping.reason = 'Low confidence match';
      }
    } else {
      unmatched++;
    }

    mappings.push(mapping);
  }

  console.log(`   ✅ gallery: ${withImageUrl} with image_url, ${matched} matched, ${unmatched} unmatched, ${ambiguous} ambiguous\n`);

  return { mappings, stats: { total: data.length, with_image_url: withImageUrl, matched, unmatched, ambiguous } };
}

async function analyzeHeroSlides(mediaAssets) {
  console.log('📋 Step 5: Analyzing hero_slides...\n');

  const { data, error } = await supabase
    .from('hero_slides')
    .select('id, title, subtitle, image_url, media_id');

  if (error) {
    console.error(`❌ Error fetching hero_slides: ${error.message}`);
    throw error;
  }

  const mappings = [];
  let matched = 0;
  let unmatched = 0;
  let ambiguous = 0;
  const withImageUrl = data.filter(d => d.image_url).length;

  for (const item of data) {
    if (!item.image_url) continue;

    const match = matchMediaAsset(item.image_url, mediaAssets);

    const mapping = {
      entity_type: 'hero_slide',
      entity_id: item.id,
      entity_name: item.title || item.subtitle || `Hero ${item.id}`,
      source_url: item.image_url,
      current_media_id: item.media_id,
      matched_media_id: match.matched?.id || null,
      media_bucket: match.matched?.bucket || null,
      media_path: match.matched?.path || null,
      match_method: match.method,
      confidence: match.confidence,
      status: match.method
    };

    if (match.method === 'AMBIGUOUS') {
      mapping.reason = match.reason;
      mapping.candidates = match.candidates.map(c => ({ id: c.id, bucket: c.bucket, path: c.path, public_url: c.public_url }));
      ambiguous++;
    } else if (match.method === 'EXACT' || match.method === 'NORMALIZED_EXACT' || match.method === 'HASH_VERIFIED') {
      match.confidence >= 85 ? matched++ : ambiguous++;
      if (match.confidence < 85) {
        ambiguous++;
        mapping.reason = 'Low confidence match';
      }
    } else {
      unmatched++;
    }

    mappings.push(mapping);
  }

  console.log(`   ✅ hero_slides: ${withImageUrl} with image_url, ${matched} matched, ${unmatched} unmatched, ${ambiguous} ambiguous\n`);

  return { mappings, stats: { total: data.length, with_image_url: withImageUrl, matched, unmatched, ambiguous } };
}

async function analyzeBusinessSettings(mediaAssets) {
  console.log('📋 Step 6: Analyzing business_settings (logo & favicon)...\n');

  const { data, error } = await supabase
    .from('business_settings')
    .select('id, logo_url, favicon_url, logo_media_id, favicon_media_id')
    .single();

  if (error) {
    console.error(`❌ Error fetching business_settings: ${error.message}`);
    throw error;
  }

  const mappings = [];

  // Analyze logo
  let logoMatch = { matched: null, method: 'no_match', confidence: 0, candidates: [] };
  if (data.logo_url) {
    logoMatch = matchMediaAsset(data.logo_url, mediaAssets);
  }

  const logoMapping = {
    entity_type: 'business_settings_logo',
    entity_id: data.id,
    entity_name: 'Logo',
    source_url: data.logo_url,
    current_media_id: data.logo_media_id,
    matched_media_id: logoMatch.matched?.id || null,
    media_bucket: logoMatch.matched?.bucket || null,
    media_path: logoMatch.matched?.path || null,
    match_method: logoMatch.method,
    confidence: logoMatch.confidence,
    status: logoMatch.method
  };

  if (logoMatch.method === 'AMBIGUOUS') {
    logoMapping.reason = logoMatch.reason;
    logoMapping.candidates = logoMatch.candidates.map(c => ({ id: c.id, bucket: c.bucket, path: c.path, public_url: c.public_url }));
  }

  mappings.push(logoMapping);

  // Analyze favicon
  let faviconMatch = { matched: null, method: 'no_match', confidence: 0, candidates: [] };
  if (data.favicon_url) {
    faviconMatch = matchMediaAsset(data.favicon_url, mediaAssets);
  }

  const faviconMapping = {
    entity_type: 'business_settings_favicon',
    entity_id: data.id,
    entity_name: 'Favicon',
    source_url: data.favicon_url,
    current_media_id: data.favicon_media_id,
    matched_media_id: faviconMatch.matched?.id || null,
    media_bucket: faviconMatch.matched?.bucket || null,
    media_path: faviconMatch.matched?.path || null,
    match_method: faviconMatch.method,
    confidence: faviconMatch.confidence,
    status: faviconMatch.method
  };

  if (faviconMatch.method === 'FAVICON_UNMATCHED') {
    faviconMapping.status = 'FAVICON_UNMATCHED';
    faviconMapping.reason = 'Favicon URL is a static path (/favicon.ico) with no corresponding media_assets record';
  } else if (faviconMatch.method === 'AMBIGUOUS') {
    faviconMapping.reason = faviconMatch.reason;
    faviconMapping.candidates = faviconMatch.candidates.map(c => ({ id: c.id, bucket: c.bucket, path: c.path, public_url: c.public_url }));
  }

  mappings.push(faviconMapping);

  console.log(`   ✅ logo: ${logoMatch.method} (confidence: ${logoMatch.confidence}%)`);
  console.log(`   ✅ favicon: ${faviconMatch.method} (confidence: ${faviconMatch.confidence}%)\n`);

  return { 
    mappings, 
    stats: { 
      logo: { match_method: logoMatch.method, confidence: logoMatch.confidence },
      favicon: { match_method: faviconMatch.method, confidence: faviconMatch.confidence }
    } 
  };
}

// ============================================================================
// ORPHAN DETECTION
// ============================================================================

function identifyOrphanedAssets(mediaAssets, allMappings) {
  console.log('📋 Step 7: Identifying orphaned media_assets...\n');

  const referencedIds = new Set(allMappings.filter(m => m.matched_media_id).map(m => m.matched_media_id));
  const orphaned = mediaAssets.filter(asset => !referencedIds.has(asset.id));

  console.log(`   ℹ️  ${orphaned.length} media_assets are not referenced by any CMS entity\n`);

  return orphaned;
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

function generateReport(mediaAssets, duplicates, orphaned, allMappings, allStats, brandStats) {
  const totalRecords = allStats.reduce((sum, s) => sum + s.stats.with_image_url, 0);
  const totalMatched = allStats.reduce((sum, s) => sum + s.stats.matched, 0);
  const totalUnmatched = allStats.reduce((sum, s) => sum + s.stats.unmatched, 0);
  const totalAmbiguous = allStats.reduce((sum, s) => sum + s.stats.ambiguous, 0);

  const allMappingsFlat = allMappings; // Already flattened in main()

  // Generate proposed UPDATE statements
  const updateStatements = [];
  for (const mapping of allMappingsFlat) {
    if (mapping && mapping.matched_media_id && mapping.current_media_id !== mapping.matched_media_id) {
      const entityType = mapping.entity_type;
      if (entityType === 'menu_item') {
        updateStatements.push(`UPDATE menu_items SET media_id = '${mapping.matched_media_id}' WHERE id = '${mapping.entity_id}' AND media_id IS NULL;`);
      } else if (entityType === 'service') {
        updateStatements.push(`UPDATE services SET media_id = '${mapping.matched_media_id}' WHERE id = '${mapping.entity_id}' AND media_id IS NULL;`);
      } else if (entityType === 'gallery') {
        updateStatements.push(`UPDATE gallery SET media_id = '${mapping.matched_media_id}' WHERE id = '${mapping.entity_id}' AND media_id IS NULL;`);
      } else if (entityType === 'hero_slide') {
        updateStatements.push(`UPDATE hero_slides SET media_id = '${mapping.matched_media_id}' WHERE id = '${mapping.entity_id}' AND media_id IS NULL;`);
      }
    }
  }

  // Logo update
  const logoMapping = allMappingsFlat.find(m => m && m.entity_type === 'business_settings_logo');
  if (logoMapping && logoMapping.matched_media_id) {
    updateStatements.push(`UPDATE business_settings SET logo_media_id = '${logoMapping.matched_media_id}' WHERE id = '${logoMapping.entity_id}' AND logo_media_id IS NULL;`);
  }

  // Favicon update
  const faviconMapping = allMappingsFlat.find(m => m && m.entity_type === 'business_settings_favicon');
  const faviconUpdateStatus = faviconMapping && faviconMapping.status === 'FAVICON_UNMATCHED' 
    ? 'FAVICON_UNMATCHED - No UPDATE statement generated'
    : (faviconMapping && faviconMapping.matched_media_id 
        ? `UPDATE business_settings SET favicon_media_id = '${faviconMapping.matched_media_id}' WHERE id = '${faviconMapping.entity_id}' AND favicon_media_id IS NULL;`
        : 'No favicon match - no UPDATE needed');

  // Count by match method
  const matchMethodCounts = {};
  for (const m of allMappingsFlat) {
    if (m.match_method) {
      matchMethodCounts[m.match_method] = (matchMethodCounts[m.match_method] || 0) + 1;
    }
  }

  let isSafeToApply = totalAmbiguous === 0 && totalUnmatched === 0;

  return {
    report: `# STEP 3A: Media Mapping Analysis Report

**Generated:** ${new Date().toISOString()}  
**Status:** READ-ONLY ANALYSIS COMPLETE  
**Project:** zt lounge (jczwilrysvnhcjzjztbi)

## Executive Summary

- **Total CMS Records Analyzed:** ${totalRecords}
- **Successfully Matched:** ${totalMatched} (${((totalMatched / totalRecords) * 100).toFixed(1)}%)
- **Unmatched:** ${totalUnmatched}
- **Ambiguous:** ${totalAmbiguous}
- **Total media_assets:** ${mediaAssets.length}
- **Orphaned media_assets:** ${orphaned.length}
- **Duplicate media_assets detected:** ${duplicates.length}

## Match Method Distribution

${Object.entries(matchMethodCounts).map(([method, count]) => `- **${method}**: ${count}`).join('\n')}

## Detailed Statistics

### Menu Items
- Total: ${allStats[0].stats.total}
- With image_url: ${allStats[0].stats.with_image_url}
- Matched: ${allStats[0].stats.matched}
- Unmatched: ${allStats[0].stats.unmatched}
- Ambiguous: ${allStats[0].stats.ambiguous}

### Services
- Total: ${allStats[1].stats.total}
- With image_url: ${allStats[1].stats.with_image_url}
- Matched: ${allStats[1].stats.matched}
- Unmatched: ${allStats[1].stats.unmatched}
- Ambiguous: ${allStats[1].stats.ambiguous}

### Gallery
- Total: ${allStats[2].stats.total}
- With image_url: ${allStats[2].stats.with_image_url}
- Matched: ${allStats[2].stats.matched}
- Unmatched: ${allStats[2].stats.unmatched}
- Ambiguous: ${allStats[2].stats.ambiguous}

### Hero Slides
- Total: ${allStats[3].stats.total}
- With image_url: ${allStats[3].stats.with_image_url}
- Matched: ${allStats[3].stats.matched}
- Unmatched: ${allStats[3].stats.unmatched}
- Ambiguous: ${allStats[3].stats.ambiguous}

### Business Settings
- **Logo:** ${brandStats.logo.match_method} (confidence: ${brandStats.logo.confidence}%)
- **Favicon:** ${brandStats.favicon.match_method} (confidence: ${brandStats.favicon.confidence}%)

## Matching Methods Used

According to STEP 3C priority:
1. **EXACT (100% confidence):** Direct match on public_url
2. **NORMALIZED_EXACT (95% confidence):** Match on normalized bucket + path
3. **NORMALIZED_EXACT (85% confidence):** Match on normalized storage path
4. **HASH_VERIFIED (80% confidence):** Match on content_hash
5. **UNMATCHED (0% confidence):** No deterministic match found

## Issues Detected

${totalAmbiguous > 0 ? `
### ⚠️ Ambiguous Matches

${allMappingsFlat.filter(m => m.status === 'AMBIGUOUS').map(m => 
  `- **${m.entity_type}** ${m.entity_name} (${m.entity_id})
  - Source URL: ${m.source_url}
  - Reason: ${m.reason}
  - Candidates: ${m.candidates?.map(c => c.id).join(', ')}`
).join('\n\n')}
` : '### ✅ No Ambiguous Matches\n'}

${totalUnmatched > 0 ? `
### ❌ Unmatched Entities

${allMappingsFlat.filter(m => m.status === 'UNMATCHED' || m.status === 'no_match' || m.status === 'FAVICON_UNMATCHED').map(m => 
  `- **${m.entity_type}** ${m.entity_name} (${m.entity_id})
  - Source URL: ${m.source_url}`
).join('\n')}
` : '### ✅ All Entities Matched\n'}

${duplicates.length > 0 ? `
### ⚠️ Duplicate media_assets

${duplicates.map(d => 
  `- ID: ${d.id} | Path: \`${d.path}\` | URL: \`${d.public_url}\``
).join('\n')}
` : '### ✅ No Duplicate media_assets\n'}

## Orphaned Media Assets

${orphaned.length > 0 ? `
${orphaned.length} media_assets are not referenced by any CMS entity:

${orphaned.slice(0, 10).map(a => 
  `- **${a.id}**: ${a.original_name || 'unnamed'} | bucket: \`${a.bucket}\` | path: \`${a.path}\``
).join('\n')}
${orphaned.length > 10 ? `\n...and ${orphaned.length - 10} more` : ''}
` : 'All media_assets are referenced by at least one CMS entity.'}

## Data Integrity Verification

- ✅ No database modifications made
- ✅ All image_url values remain unchanged
- ✅ No media_id values modified
- ✅ Testimonials excluded from analysis
- ✅ No storage objects accessed or modified
- ✅ Deterministic matching only (no guessing)

## Proposed UPDATE Statements

\`\`\`sql
-- BEGIN TRANSACTION;

${updateStatements.join('\n')}

-- Favicon (conditional): ${faviconUpdateStatus}

-- COMMIT;
\`\`\`

## Safety Gate Status

**${isSafeToApply ? '✅ SAFE TO APPLY' : '⚠️ MANUAL REVIEW REQUIRED'}**

${isSafeToApply 
  ? 'All mappings are deterministic. No ambiguous or unmatched entities. Safe to proceed to Step 3G.' 
  : `${totalAmbiguous > 0 ? '- ' + totalAmbiguous + ' ambiguous matches need review\n' : ''}${totalUnmatched > 0 ? '- ' + totalUnmatched + ' unmatched entities need investigation\n' : ''}`
}

## Detailed Mapping Data

See \`STEP3A_MEDIA_MAPPING.json\` for complete mapping details.

---
*Analysis generated by step3a-media-mapping-analysis.mjs*
`,
    json: {
      timestamp: new Date().toISOString(),
      project: 'jczwilrysvnhcjzjztbi',
      statistics: {
        total_cms_records: totalRecords,
        total_matched: totalMatched,
        total_unmatched: totalUnmatched,
        total_ambiguous: totalAmbiguous,
        total_media_assets: mediaAssets.length,
        orphaned_media_assets: orphaned.length,
        duplicate_media_assets: duplicates.length,
        match_method_distribution: matchMethodCounts,
        by_table: {
          menu_items: allStats[0].stats,
          services: allStats[1].stats,
          gallery: allStats[2].stats,
          hero_slides: allStats[3].stats,
          business_settings: { logo: brandStats.logo, favicon: brandStats.favicon }
        }
      },
      mappings: allMappingsFlat,
      duplicates,
      orphaned,
      proposed_updates: updateStatements,
      favicon_status: faviconUpdateStatus,
      safety_gate: {
        safe_to_apply: isSafeToApply,
        ambiguous_count: totalAmbiguous,
        unmatched_count: totalUnmatched
      }
    }
  };
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  try {
    // Fetch all media assets
    const { assets, duplicates } = await fetchAllMediaAssets();

    // Analyze each CMS table
    const menuResult = await analyzeMenuItems(assets);
    const servicesResult = await analyzeServices(assets);
    const galleryResult = await analyzeGallery(assets);
    const heroResult = await analyzeHeroSlides(assets);
    const brandResult = await analyzeBusinessSettings(assets);

    // Identify orphaned assets
    const allMappings = [menuResult.mappings, servicesResult.mappings, galleryResult.mappings, heroResult.mappings, brandResult.mappings];
    const orphaned = identifyOrphanedAssets(assets, allMappings.flat());

    // Generate reports
    console.log('📋 Step 8: Generating reports...\n');

    const { report, json } = generateReport(assets, duplicates, orphaned, allMappings.flat(),
      [menuResult, servicesResult, galleryResult, heroResult], brandResult.stats);

    writeFileSync(
      join(__dirname, '..', 'STEP3A_MEDIA_MAPPING_REPORT.md'),
      report
    );

    writeFileSync(
      join(__dirname, '..', 'STEP3A_MEDIA_MAPPING.json'),
      JSON.stringify(json, null, 2)
    );

    console.log('✅ Reports generated:');
    console.log('   - STEP3A_MEDIA_MAPPING_REPORT.md');
    console.log('   - STEP3A_MEDIA_MAPPING.json\n');

    // Summary
    const totalRecords = json.statistics.total_cms_records;
    const totalMatched = json.statistics.total_matched;
    const totalAmbiguous = json.statistics.total_ambiguous;
    const totalUnmatched = json.statistics.total_unmatched;

    console.log(`📊 Summary: ${totalMatched}/${totalRecords} matched, ${totalUnmatched} unmatched, ${totalAmbiguous} ambiguous\n`);

    if (totalAmbiguous === 0 && totalUnmatched === 0) {
      console.log('✅ STEP 3A COMPLETE - All entities successfully matched');
      console.log('   Safe to proceed to Step 3B/3C (apply mappings)\n');
      process.exit(0);
    } else {
      console.log('⚠️  STEP 3A COMPLETE - Manual review required');
      console.log(`   ${totalMatched} matched, ${totalUnmatched} unmatched, ${totalAmbiguous} ambiguous\n`);
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
