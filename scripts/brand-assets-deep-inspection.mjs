#!/usr/bin/env node

/**
 * BRAND ASSETS DEEP INSPECTION
 * 
 * Complete read-only inspection of logo/favicon architecture
 * to determine exactly what needs to be wired up.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

console.log('═══════════════════════════════════════════════════════════');
console.log('  BRAND ASSETS DEEP INSPECTION');
console.log('═══════════════════════════════════════════════════════════\n');

const findings = {
  timestamp: new Date().toISOString(),
  phase: 'PHASE 0 — DEEP READ-ONLY INSPECTION',
  
  // What we're looking for
  publicWebsiteStructure: {},
  publicWebsiteLogo: {},
  publicWebsiteFavicon: {},
  adminBrandingUI: {},
  businessSettingsAPI: {},
  dataFlow: {},
  confirmedGaps: []
};

// ========================================
// 1. PUBLIC WEBSITE STRUCTURE
// ========================================

console.log('1️⃣  INSPECTING PUBLIC WEBSITE STRUCTURE\n');

const publicPagePath = join(projectRoot, 'src/app/page.tsx');
const publicLayoutPath = join(projectRoot, 'src/app/layout.tsx');

if (existsSync(publicPagePath)) {
  const content = readFileSync(publicPagePath, 'utf-8');
  findings.publicWebsiteStructure.mainPage = {
    exists: true,
    hasBusinessSettings: content.includes('business_settings') || content.includes('businessSettings'),
    hasLogo: content.includes('logo') || content.includes('Logo'),
    importsComponents: Array.from(content.matchAll(/import.*from ['"]@\/(.*)['"]/g)).map(m => m[1])
  };
  console.log('   ✓ Public homepage found');
} else {
  findings.publicWebsiteStructure.mainPage = { exists: false };
  console.log('   ⚠️  No public homepage at src/app/page.tsx');
}

// ========================================
// 2. PUBLIC LAYOUT & FAVICON
// ========================================

console.log('\n2️⃣  INSPECTING PUBLIC LAYOUT & FAVICON\n');

if (existsSync(publicLayoutPath)) {
  const content = readFileSync(publicLayoutPath, 'utf-8');
  
  findings.publicWebsiteFavicon = {
    layoutFile: publicLayoutPath,
    hasMetadata: content.includes('metadata'),
    hasGenerateMetadata: content.includes('generateMetadata'),
    hasIcons: content.includes('icons'),
    hasFaviconUrl: content.includes('favicon_url') || content.includes('faviconUrl'),
    hasFaviconMediaId: content.includes('favicon_media_id') || content.includes('faviconMediaId'),
    usesBusinessSettings: content.includes('business_settings') || content.includes('businessSettings'),
    staticFaviconReferences: Array.from(content.matchAll(/['"]([^'"]*favicon[^'"]*)['"]/gi)).map(m => m[1])
  };
  
  console.log(`   Metadata approach: ${content.includes('generateMetadata') ? 'generateMetadata()' : 'static metadata'}`);
  console.log(`   References business_settings: ${findings.publicWebsiteFavicon.usesBusinessSettings ? '✓' : '✗'}`);
  console.log(`   References favicon_media_id: ${findings.publicWebsiteFavicon.hasFaviconMediaId ? '✓' : '✗'}`);
} else {
  findings.publicWebsiteFavicon = { exists: false };
}

// ========================================
// 3. BUSINESS SETTINGS DATA FLOW
// ========================================

console.log('\n3️⃣  INSPECTING BUSINESS SETTINGS DATA FLOW\n');

// Check for business settings API endpoint
const bizSettingsAPIPath = join(projectRoot, 'src/app/api/admin/business-settings/route.ts');
const genericResourcePath = join(projectRoot, 'src/app/api/admin/[resource]/route.ts');

if (existsSync(bizSettingsAPIPath)) {
  const content = readFileSync(bizSettingsAPIPath, 'utf-8');
  findings.businessSettingsAPI = {
    dedicatedEndpoint: true,
    path: bizSettingsAPIPath,
    supportsPATCH: content.includes('export const PATCH') || content.includes('export async function PATCH'),
    supportsGET: content.includes('export const GET') || content.includes('export async function GET'),
    handlesLogoMediaId: content.includes('logo_media_id'),
    handlesFaviconMediaId: content.includes('favicon_media_id')
  };
  console.log('   ✓ Dedicated business_settings API found');
} else if (existsSync(genericResourcePath)) {
  const content = readFileSync(genericResourcePath, 'utf-8');
  findings.businessSettingsAPI = {
    dedicatedEndpoint: false,
    usesGenericResource: true,
    path: genericResourcePath,
    handlesMediaResolution: content.includes('logo_media_id') || content.includes('favicon_media_id')
  };
  console.log('   ✓ Using generic [resource] API');
  console.log(`   Handles media resolution: ${findings.businessSettingsAPI.handlesMediaResolution ? '✓' : '✗'}`);
} else {
  findings.businessSettingsAPI = { exists: false };
  console.log('   ⚠️  No business_settings API found');
}

// ========================================
// 4. ADMIN BRANDING UI
// ========================================

console.log('\n4️⃣  INSPECTING ADMIN BRANDING UI\n');

// Check website CMS (might handle branding)
const websiteCMSPath = join(projectRoot, 'src/features/cms/website-cms.tsx');
if (existsSync(websiteCMSPath)) {
  const content = readFileSync(websiteCMSPath, 'utf-8');
  findings.adminBrandingUI = {
    file: websiteCMSPath,
    hasLogoField: content.includes('logo'),
    hasFaviconField: content.includes('favicon'),
    hasLogoMediaId: content.includes('logo_media_id'),
    hasFaviconMediaId: content.includes('favicon_media_id'),
    usesMediaPicker: content.includes('MediaPicker') || content.includes('ImageChangeDialog'),
    hasImageUpload: content.includes('upload') || content.includes('Upload')
  };
  
  console.log('   ✓ Website CMS component found');
  console.log(`   Has logo field: ${findings.adminBrandingUI.hasLogoField ? '✓' : '✗'}`);
  console.log(`   Has favicon field: ${findings.adminBrandingUI.hasFaviconField ? '✓' : '✗'}`);
  console.log(`   Uses MediaPicker: ${findings.adminBrandingUI.usesMediaPicker ? '✓' : '✗'}`);
  console.log(`   References logo_media_id: ${findings.adminBrandingUI.hasLogoMediaId ? '✓' : '✗'}`);
  console.log(`   References favicon_media_id: ${findings.adminBrandingUI.hasFaviconMediaId ? '✓' : '✗'}`);
} else {
  findings.adminBrandingUI = { exists: false };
  console.log('   ⚠️  Website CMS component not found');
}

// ========================================
// 5. PUBLIC WEBSITE COMPONENTS SEARCH
// ========================================

console.log('\n5️⃣  SEARCHING FOR PUBLIC WEBSITE COMPONENTS\n');

// Common component locations
const possiblePublicComponents = [
  'src/components/header.tsx',
  'src/components/Header.tsx',
  'src/components/navbar.tsx',
  'src/components/Navbar.tsx',
  'src/components/public/header.tsx',
  'src/components/public/Header.tsx',
  'src/features/public/header.tsx',
  'src/app/(public)/layout.tsx'
];

findings.publicWebsiteLogo = { componentSearched: [], found: [] };

for (const componentPath of possiblePublicComponents) {
  const fullPath = join(projectRoot, componentPath);
  findings.publicWebsiteLogo.componentSearched.push(componentPath);
  
  if (existsSync(fullPath)) {
    const content = readFileSync(fullPath, 'utf-8');
    findings.publicWebsiteLogo.found.push({
      path: componentPath,
      hasLogo: content.includes('logo') || content.includes('Logo'),
      hasImage: content.includes('<Image') || content.includes('<img'),
      usesBusinessSettings: content.includes('business_settings') || content.includes('businessSettings'),
      staticLogoPath: Array.from(content.matchAll(/src=['"]([^'"]*logo[^'"]*)['"]/gi)).map(m => m[1])
    });
    console.log(`   ✓ Found: ${componentPath}`);
  }
}

if (findings.publicWebsiteLogo.found.length === 0) {
  console.log('   ⚠️  No public header/navbar components found');
  console.log('   ℹ️  Logo might be in main page.tsx or layout.tsx');
}

// ========================================
// 6. CONFIRMED GAPS
// ========================================

console.log('\n6️⃣  ANALYZING GAPS\n');

// Gap 1: Admin UI not using MediaPicker
if (findings.adminBrandingUI.exists !== false) {
  if (!findings.adminBrandingUI.usesMediaPicker) {
    findings.confirmedGaps.push({
      area: 'ADMIN_UI',
      issue: 'Business Settings UI not using MediaPicker for logo/favicon',
      severity: 'HIGH',
      fix: 'Add MediaPickerModal integration to website-cms.tsx'
    });
  }
  if (!findings.adminBrandingUI.hasLogoMediaId || !findings.adminBrandingUI.hasFaviconMediaId) {
    findings.confirmedGaps.push({
      area: 'ADMIN_UI',
      issue: 'Business Settings form not handling logo_media_id/favicon_media_id',
      severity: 'HIGH',
      fix: 'Add form fields for logo_media_id and favicon_media_id'
    });
  }
}

// Gap 2: Public favicon not connected
if (!findings.publicWebsiteFavicon.hasFaviconMediaId) {
  findings.confirmedGaps.push({
    area: 'PUBLIC_FAVICON',
    issue: 'Public website favicon not resolving from favicon_media_id',
    severity: 'HIGH',
    fix: 'Wire favicon_media_id resolution into layout.tsx metadata'
  });
}

// Gap 3: Public logo not connected
if (findings.publicWebsiteLogo.found.length > 0) {
  const hasConnectedLogo = findings.publicWebsiteLogo.found.some(c => c.usesBusinessSettings);
  if (!hasConnectedLogo) {
    findings.confirmedGaps.push({
      area: 'PUBLIC_LOGO',
      issue: 'Public website logo not resolving from logo_media_id',
      severity: 'HIGH',
      fix: 'Wire logo_media_id resolution into public header component'
    });
  }
} else {
  findings.confirmedGaps.push({
    area: 'PUBLIC_LOGO',
    issue: 'Cannot locate public website logo component',
    severity: 'MEDIUM',
    fix: 'Inspect page.tsx to determine logo rendering approach'
  });
}

// Gap 4: API data flow
if (findings.businessSettingsAPI.exists === false) {
  findings.confirmedGaps.push({
    area: 'API',
    issue: 'No business_settings API endpoint found',
    severity: 'CRITICAL',
    fix: 'Verify if using generic [resource] API or create dedicated endpoint'
  });
}

// ========================================
// OUTPUT
// ========================================

console.log('═══════════════════════════════════════════════════════════');
console.log('  SUMMARY');
console.log('═══════════════════════════════════════════════════════════\n');

console.log(`📊 CONFIRMED GAPS: ${findings.confirmedGaps.length}\n`);

findings.confirmedGaps.forEach((gap, i) => {
  console.log(`${i + 1}. [${gap.severity}] ${gap.area}`);
  console.log(`   Issue: ${gap.issue}`);
  console.log(`   Fix:   ${gap.fix}\n`);
});

console.log('═══════════════════════════════════════════════════════════');
console.log(`  Report saved: BRAND_ASSETS_DEEP_INSPECTION.json`);
console.log('═══════════════════════════════════════════════════════════\n');

// Save report
import { writeFileSync } from 'fs';
writeFileSync(
  join(projectRoot, 'BRAND_ASSETS_DEEP_INSPECTION.json'),
  JSON.stringify(findings, null, 2)
);

console.log('✅ Deep inspection complete\n');
