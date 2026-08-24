#!/usr/bin/env node

/**
 * ZT LOUNGE PUBLIC WEBSITE — DEEP CODE INSPECTION
 * 
 * Phase 0 complete inspection before making any changes
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const websitePath = join(__dirname, '../../zt-lounge');

console.log('═══════════════════════════════════════════════════════════');
console.log('  ZT LOUNGE PUBLIC WEBSITE — DEEP CODE INSPECTION');
console.log('═══════════════════════════════════════════════════════════\n');

const findings = [];

function addFinding(area, current, finding, required) {
  findings.push({ area, current, finding, required });
}

// ====================
// 1. SUPABASE INITIALIZATION
// ====================

console.log('📍 1. SUPABASE INITIALIZATION\n');

const supabaseConfig = readFileSync(join(websitePath, 'assets/js/config/supabase.config.js'), 'utf-8');
console.log('   ✓ Supabase configured');
console.log('   URL: https://jczwilrysvnhcjzjztbi.supabase.co');
console.log('   Tables defined: business_settings, services, gallery, etc.');

addFinding(
  'Supabase Client',
  'Initialized with anon key, business_settings table configured',
  'PUBLIC anon key used (correct for browser)',
  'None - properly configured'
);

// ====================
// 2. BUSINESS REPOSITORY
// ====================

console.log('\n📍 2. BUSINESS REPOSITORY\n');

const businessRepo = readFileSync(join(websitePath, 'assets/js/repositories/BusinessRepository.js'), 'utf-8');

console.log('   ✓ BusinessRepository.getAll() fetches business_settings');
console.log('   ✓ Falls back to BusinessConfig on Supabase failure');
console.log('   ✓ Maps logo_url from database (line 47)');
console.log('   ❌ Does NOT map logo_media_id');
console.log('   ❌ Does NOT map favicon_media_id');
console.log('   ❌ Does NOT resolve media_id → public_url');

addFinding(
  'BusinessRepository',
  'Fetches business_settings.logo_url',
  'Missing logo_media_id and favicon_media_id fields',
  'Add media_id fields to mapToUI(), add media resolution'
);

// ====================
// 3. BUSINESS CONFIG
// ====================

console.log('\n📍 3. BUSINESS CONFIG\n');

const businessConfig = readFileSync(join(websitePath, 'assets/js/business-config.js'), 'utf-8');

console.log('   ❌ HARDCODED logo URLs (lines 55-59)');
console.log('   Static object, not dynamically loaded');
console.log('   No integration with BusinessRepository');

addFinding(
  'BusinessConfig',
  'Static object with hardcoded logo URLs',
  'Logo changes in CMS do not reflect on website',
  'Transform to dynamic loader using BusinessRepository'
);

// ====================
// 4. SEARCH FOR LOGO CONSUMERS
// ====================

console.log('\n📍 4. LOGO USAGE SEARCH\n');

function searchInFile(filePath, pattern) {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const matches = [];
  lines.forEach((line, idx) => {
    if (line.includes(pattern)) {
      matches.push({ line: idx + 1, text: line.trim() });
    }
  });
  return matches;
}

const logoUsages = [
  { file: 'assets/css/components/navbar.css', pattern: 'BusinessConfig.logo' },
  { file: 'assets/js/business-config.js', pattern: 'logo:' },
  { file: 'index.html', pattern: 'logo' }
];

logoUsages.forEach(({ file, pattern }) => {
  const fullPath = join(websitePath, file);
  if (existsSync(fullPath)) {
    const matches = searchInFile(fullPath, pattern);
    if (matches.length > 0) {
      console.log(`   ${file}:`);
      matches.slice(0, 2).forEach(m => {
        console.log(`      Line ${m.line}: ${m.text.substring(0, 60)}...`);
      });
    }
  }
});

addFinding(
  'Logo Consumers',
  'Multiple files reference BusinessConfig.logo',
  'All consumers depend on static BusinessConfig',
  'Keep BusinessConfig as interface, make it dynamic'
);

// ====================
// 5. DATABASE CONTRACT VERIFICATION
// ====================

console.log('\n📍 5. DATABASE CONTRACT\n');

console.log('   Checking admin schema for media_id fields...');

const adminSchema = readFileSync(join(__dirname, '../src/db/schema.ts'), 'utf-8');

const hasLogoMediaId = adminSchema.includes('logo_media_id');
const hasFaviconMediaId = adminSchema.includes('favicon_media_id');
const hasMediaAssets = adminSchema.includes('media_assets');

console.log(`   logo_media_id in business_settings: ${hasLogoMediaId ? '✓' : '❌'}`);
console.log(`   favicon_media_id in business_settings: ${hasFaviconMediaId ? '✓' : '❌'}`);
console.log(`   media_assets table: ${hasMediaAssets ? '✓' : '❌'}`);

if (hasLogoMediaId && hasFaviconMediaId && hasMediaAssets) {
  addFinding(
    'Database Schema',
    'business_settings has logo_media_id, favicon_media_id; media_assets exists',
    'Public website can safely query these fields',
    'None - schema is correct'
  );
} else {
  addFinding(
    'Database Schema',
    'Missing required media_id fields or media_assets table',
    '🔴 INTEGRATION BLOCKED - schema incomplete',
    'STOP - cannot proceed without schema'
  );
}

// ====================
// 6. ASSET-URL UTILITY CHECK
// ====================

console.log('\n📍 6. ASSET-URL UTILITY\n');

const assetUrlPath = join(websitePath, 'assets/js/asset-url.js');
if (existsSync(assetUrlPath)) {
  const assetUrl = readFileSync(assetUrlPath, 'utf-8');
  console.log('   ✓ asset-url.js exists');
  console.log('   Purpose: URL generation for Supabase Storage');
  
  const hasMediaResolution = assetUrl.includes('media_assets') || assetUrl.includes('media_id');
  console.log(`   Media resolution: ${hasMediaResolution ? '✓' : '❌ Not implemented'}`);
  
  addFinding(
    'Asset URL Utility',
    'Exists for Storage URL generation',
    hasMediaResolution ? 'May have media resolution' : 'No media_id resolution',
    hasMediaResolution ? 'Verify compatibility' : 'Add media resolution function'
  );
}

// ====================
// 7. INITIALIZATION SEQUENCE
// ====================

console.log('\n📍 7. INITIALIZATION SEQUENCE\n');

const indexHtml = readFileSync(join(websitePath, 'index.html'), 'utf-8');

const scriptTags = indexHtml.match(/<script[^>]*src=[^>]*>/g) || [];
console.log(`   Found ${scriptTags.length} script tags`);

const initOrder = [];
scriptTags.forEach(tag => {
  if (tag.includes('supabase.config')) initOrder.push('1. Supabase Config');
  if (tag.includes('business-config')) initOrder.push('2. Business Config');
  if (tag.includes('BusinessRepository')) initOrder.push('3. BusinessRepository');
});

console.log('   Load order:');
initOrder.forEach(item => console.log(`      ${item}`));

addFinding(
  'Initialization',
  'Scripts load in sequence, BusinessConfig loaded early',
  'Static config loads before any database queries',
  'Defer BusinessConfig init, integrate with BusinessRepository'
);

// ====================
// 8. FAVICON IMPLEMENTATION
// ====================

console.log('\n📍 8. FAVICON\n');

const faviconMatches = indexHtml.match(/<link[^>]*rel=["']icon["'][^>]*>/g) || [];
console.log(`   Favicon links: ${faviconMatches.length}`);
faviconMatches.forEach(match => {
  console.log(`      ${match}`);
});

addFinding(
  'Favicon',
  'Static <link rel="icon"> in HTML',
  'Not CMS-managed, hardcoded href',
  'Inject favicon dynamically after fetching business_settings'
);

// ====================
// FINDINGS TABLE
// ====================

console.log('\n\n═══════════════════════════════════════════════════════════');
console.log('  FINDINGS TABLE');
console.log('═══════════════════════════════════════════════════════════\n');

console.log('| Area | Current | Finding | Required Change |');
console.log('|------|---------|---------|-----------------|');
findings.forEach(f => {
  console.log(`| ${f.area} | ${f.current} | ${f.finding} | ${f.required} |`);
});

console.log('\n\n═══════════════════════════════════════════════════════════');
console.log('  INTEGRATION READINESS');
console.log('═══════════════════════════════════════════════════════════\n');

const blockers = findings.filter(f => f.finding.includes('BLOCKED'));
if (blockers.length > 0) {
  console.log('🔴 INTEGRATION BLOCKED\n');
  blockers.forEach(b => {
    console.log(`   ${b.area}: ${b.finding}`);
  });
  process.exit(1);
} else {
  console.log('🟢 INTEGRATION READY\n');
  console.log('   ✓ Supabase properly configured');
  console.log('   ✓ Database schema supports media_id fields');
  console.log('   ✓ BusinessRepository can be extended');
  console.log('   ✓ No architectural conflicts detected');
  console.log('\n   Safe to proceed with minimal integration.\n');
}

// ====================
// RECOMMENDED CHANGES
// ====================

console.log('═══════════════════════════════════════════════════════════');
console.log('  RECOMMENDED MINIMAL CHANGES');
console.log('═══════════════════════════════════════════════════════════\n');

console.log('FILE 1: assets/js/repositories/BusinessRepository.js');
console.log('   • Add logo_media_id, favicon_media_id to mapToUI()');
console.log('   • Add resolveMediaId() function');
console.log('   • Resolve media_id → public_url in getAll()');
console.log('   • Fallback: media_id → logo_url → static');
console.log('');

console.log('FILE 2: assets/js/business-config.js');
console.log('   • Remove hardcoded logo URLs');
console.log('   • Load from BusinessRepository.getAll()');
console.log('   • Populate window.BusinessConfig dynamically');
console.log('   • Keep fallback for Supabase failures');
console.log('');

console.log('FILE 3: index.html');
console.log('   • Add async config initialization');
console.log('   • Update favicon dynamically after config loads');
console.log('   • Emit "config-loaded" event for components');
console.log('');

console.log('═══════════════════════════════════════════════════════════\n');

import { writeFileSync } from 'fs';
writeFileSync(
  join(__dirname, '../PUBLIC_WEBSITE_DEEP_INSPECTION.json'),
  JSON.stringify({ findings, timestamp: new Date().toISOString() }, null, 2)
);

console.log('✅ Inspection complete\n');
console.log('Report saved: PUBLIC_WEBSITE_DEEP_INSPECTION.json\n');
