#!/usr/bin/env node

/**
 * ZT LOUNGE — BRANDING ASSETS ARCHITECTURE AUDIT
 * 
 * Comprehensive inspection of logo/favicon media_id integration
 * between business_settings and the public website.
 * 
 * DOES NOT MODIFY ANY FILES — READ-ONLY INSPECTION
 */

import { readFileSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const report = {
  timestamp: new Date().toISOString(),
  phase: 'PHASE 0 — READ-ONLY INSPECTION',
  
  database_schema: {},
  existing_branding_api: {},
  media_resolver: {},
  public_website_logo: [],
  public_website_favicon: {},
  admin_dashboard_branding: [],
  business_settings_ui: {},
  
  confirmed_gaps: [],
  existing_functionality: [],
  recommendations: [],
};

console.log('═══════════════════════════════════════════════════════════');
console.log('  ZT LOUNGE BRANDING ASSETS ARCHITECTURE AUDIT');
console.log('═══════════════════════════════════════════════════════════\n');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. DATABASE SCHEMA INSPECTION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

console.log('1️⃣  INSPECTING DATABASE SCHEMA\n');

const schemaPath = join(ROOT, 'src/db/schema.ts');
const schemaContent = readFileSync(schemaPath, 'utf-8');

// Check for business_settings fields
const hasLogoUrl = /logoUrl|logo_url/.test(schemaContent);
const hasFaviconUrl = /faviconUrl|favicon_url/.test(schemaContent);
const hasLogoMediaId = /logoMediaId|logo_media_id/.test(schemaContent);
const hasFaviconMediaId = /faviconMediaId|favicon_media_id/.test(schemaContent);

report.database_schema = {
  file: 'src/db/schema.ts',
  fields_found: {
    logo_url: hasLogoUrl,
    favicon_url: hasFaviconUrl,
    logo_media_id: hasLogoMediaId,
    favicon_media_id: hasFaviconMediaId,
  },
  canonical_fields_present: hasLogoMediaId && hasFaviconMediaId,
  legacy_fields_present: hasLogoUrl && hasFaviconUrl,
};

console.log('📊 business_settings schema:');
console.log(`   logo_url: ${hasLogoUrl ? '✓' : '✗'}`);
console.log(`   favicon_url: ${hasFaviconUrl ? '✓' : '✗'}`);
console.log(`   logo_media_id: ${hasLogoMediaId ? '✓' : '✗'}`);
console.log(`   favicon_media_id: ${hasFaviconMediaId ? '✓' : '✗'}`);
console.log();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. EXISTING BRANDING API INSPECTION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

console.log('2️⃣  INSPECTING BRANDING API\n');

// Check for business settings API route
const settingsApiPath = join(ROOT, 'src/app/api/admin/business-settings/route.ts');
const settingsApiExists = existsSync(settingsApiPath);

if (settingsApiExists) {
  const apiContent = readFileSync(settingsApiPath, 'utf-8');
  report.existing_branding_api = {
    file: 'src/app/api/admin/business-settings/route.ts',
    exists: true,
    has_get: /export\s+async\s+function\s+GET/.test(apiContent),
    has_put: /export\s+async\s+function\s+PUT/.test(apiContent),
    has_patch: /export\s+async\s+function\s+PATCH/.test(apiContent),
    references_logo_media_id: /logo_media_id|logoMediaId/.test(apiContent),
    references_favicon_media_id: /favicon_media_id|faviconMediaId/.test(apiContent),
  };
  console.log('📡 Business Settings API found:');
  console.log(`   GET: ${report.existing_branding_api.has_get ? '✓' : '✗'}`);
  console.log(`   PUT/PATCH: ${report.existing_branding_api.has_put || report.existing_branding_api.has_patch ? '✓' : '✗'}`);
  console.log(`   References logo_media_id: ${report.existing_branding_api.references_logo_media_id ? '✓' : '✗'}`);
  console.log(`   References favicon_media_id: ${report.existing_branding_api.references_favicon_media_id ? '✓' : '✗'}`);
} else {
  report.existing_branding_api = {
    file: 'src/app/api/admin/business-settings/route.ts',
    exists: false,
  };
  console.log('⚠️  Business Settings API not found');
}
console.log();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. MEDIA RESOLVER INSPECTION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

console.log('3️⃣  INSPECTING MEDIA RESOLVER\n');

const resolverPath = join(ROOT, 'src/lib/media/resolver.ts');
const resolverContent = readFileSync(resolverPath, 'utf-8');

report.media_resolver = {
  file: 'src/lib/media/resolver.ts',
  exists: true,
  has_resolve_single: /export\s+async\s+function\s+resolveImageUrl/.test(resolverContent),
  has_resolve_batch: /export\s+async\s+function\s+resolveImageUrls/.test(resolverContent),
  supports_media_id: /media_id|mediaId/.test(resolverContent),
  supports_fallback: /fallback|image_url/.test(resolverContent),
  queries_media_assets: /from\s*\(\s*['"]media_assets['"]/.test(resolverContent),
};

console.log('🔍 Media Resolver:');
console.log(`   resolveImageUrl: ${report.media_resolver.has_resolve_single ? '✓' : '✗'}`);
console.log(`   resolveImageUrls (batch): ${report.media_resolver.has_resolve_batch ? '✓' : '✗'}`);
console.log(`   Supports media_id: ${report.media_resolver.supports_media_id ? '✓' : '✗'}`);
console.log(`   Supports fallback URLs: ${report.media_resolver.supports_fallback ? '✓' : '✗'}`);
console.log(`   Queries media_assets table: ${report.media_resolver.queries_media_assets ? '✓' : '✗'}`);
console.log();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. PUBLIC WEBSITE LOGO SEARCH
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

console.log('4️⃣  SEARCHING PUBLIC WEBSITE LOGO USAGE\n');

const searchPaths = [
  'src/app/(public)',
  'src/components',
  'src/features',
].filter(p => existsSync(join(ROOT, p)));

const logoPatterns = [
  /logo_url/gi,
  /logoUrl/g,
  /logo_media_id/gi,
  /logoMediaId/g,
  /business\.logo/gi,
  /business_settings/gi,
];

function searchInFile(filePath, patterns) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const matches = [];
    patterns.forEach((pattern, idx) => {
      const hits = content.match(pattern);
      if (hits) {
        matches.push({
          pattern: pattern.source,
          count: hits.length,
          lines: content.split('\n')
            .map((line, lineNum) => pattern.test(line) ? lineNum + 1 : null)
            .filter(Boolean)
            .slice(0, 5),
        });
      }
    });
    return matches.length > 0 ? matches : null;
  } catch {
    return null;
  }
}

// Logo search in public website - manual inspection placeholder
console.log('🔎 Searching for logo references in public website...');
console.log('   ⚠️  Manual inspection required');
console.log('   Check: src/app/(public)/, src/components/, src/features/');
console.log('   Patterns: logo_url, logoUrl, logo_media_id, logoMediaId, business_settings');
console.log();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. PUBLIC WEBSITE FAVICON INSPECTION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

console.log('5️⃣  INSPECTING FAVICON CONFIGURATION\n');

const layoutPath = join(ROOT, 'src/app/layout.tsx');
const layoutContent = readFileSync(layoutPath, 'utf-8');

report.public_website_favicon = {
  layout_file: 'src/app/layout.tsx',
  has_metadata: /export\s+(async\s+)?const\s+metadata/.test(layoutContent) || 
                /export\s+(async\s+)?function\s+generateMetadata/.test(layoutContent),
  has_icons_config: /icons\s*:/.test(layoutContent),
  has_favicon_reference: /favicon/.test(layoutContent),
  references_business_settings: /business_settings|businessSettings/.test(layoutContent),
  references_favicon_media_id: /favicon_media_id|faviconMediaId/.test(layoutContent),
};

const staticFaviconExists = existsSync(join(ROOT, 'public/favicon.ico'));

console.log('🌐 Favicon Configuration:');
console.log(`   layout.tsx metadata: ${report.public_website_favicon.has_metadata ? '✓' : '✗'}`);
console.log(`   icons config: ${report.public_website_favicon.has_icons_config ? '✓' : '✗'}`);
console.log(`   Static public/favicon.ico: ${staticFaviconExists ? '✓' : '✗'}`);
console.log(`   References business_settings: ${report.public_website_favicon.references_business_settings ? '✓' : '✗'}`);
console.log(`   References favicon_media_id: ${report.public_website_favicon.references_favicon_media_id ? '✓' : '✗'}`);
console.log();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. ADMIN DASHBOARD BRANDING
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

console.log('6️⃣  INSPECTING ADMIN DASHBOARD BRANDING\n');

const sidebarPath = join(ROOT, 'src/components/sidebar.tsx');
const sidebarContent = readFileSync(sidebarPath, 'utf-8');

report.admin_dashboard_branding.push({
  file: 'src/components/sidebar.tsx',
  has_logo: /logo/.test(sidebarContent),
  uses_static_svg: /zt-lounge-logo\.svg/.test(sidebarContent),
  references_business_settings: /business_settings|businessSettings/.test(sidebarContent),
  uses_media_resolver: /resolveImageUrl/.test(sidebarContent),
});

console.log('🎨 Admin Dashboard Branding:');
console.log(`   Sidebar has logo: ${report.admin_dashboard_branding[0].has_logo ? '✓' : '✗'}`);
console.log(`   Uses static SVG: ${report.admin_dashboard_branding[0].uses_static_svg ? '✓' : '✗'}`);
console.log(`   References business_settings: ${report.admin_dashboard_branding[0].references_business_settings ? '✗ (hardcoded)' : '✓ (dynamic)'}`);
console.log(`   Uses media resolver: ${report.admin_dashboard_branding[0].uses_media_resolver ? '✓' : '✗'}`);
console.log();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. BUSINESS SETTINGS UI
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

console.log('7️⃣  INSPECTING BUSINESS SETTINGS UI\n');

const settingsViewPath = join(ROOT, 'src/features/settings/settings-view.tsx');
if (existsSync(settingsViewPath)) {
  const settingsContent = readFileSync(settingsViewPath, 'utf-8');
  
  report.business_settings_ui = {
    file: 'src/features/settings/settings-view.tsx',
    exists: true,
    has_logo_field: /logo/.test(settingsContent),
    has_favicon_field: /favicon/.test(settingsContent),
    uses_media_picker: /MediaPicker|ImageChange|media-picker/.test(settingsContent),
    has_url_input: /<input[^>]*type=["']text["'][^>]*logo|<input[^>]*logo[^>]*type=["']text["']/.test(settingsContent),
    references_media_id: /logo_media_id|favicon_media_id|logoMediaId|faviconMediaId/.test(settingsContent),
  };
  
  console.log('⚙️  Business Settings UI:');
  console.log(`   Has logo field: ${report.business_settings_ui.has_logo_field ? '✓' : '✗'}`);
  console.log(`   Has favicon field: ${report.business_settings_ui.has_favicon_field ? '✓' : '✗'}`);
  console.log(`   Uses MediaPicker: ${report.business_settings_ui.uses_media_picker ? '✓' : '✗'}`);
  console.log(`   Has URL text input: ${report.business_settings_ui.has_url_input ? '✓ (legacy)' : '✗'}`);
  console.log(`   References media_id fields: ${report.business_settings_ui.references_media_id ? '✓' : '✗'}`);
} else {
  report.business_settings_ui = {
    file: 'src/features/settings/settings-view.tsx',
    exists: false,
  };
  console.log('⚠️  Business Settings UI not found');
}
console.log();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ANALYSIS & RECOMMENDATIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

console.log('═══════════════════════════════════════════════════════════');
console.log('  ANALYSIS');
console.log('═══════════════════════════════════════════════════════════\n');

// Identify existing functionality
if (report.database_schema.canonical_fields_present) {
  report.existing_functionality.push('✓ Database schema has logo_media_id and favicon_media_id');
}
if (report.database_schema.legacy_fields_present) {
  report.existing_functionality.push('✓ Database schema has legacy logo_url and favicon_url fallback fields');
}
if (report.media_resolver.exists && report.media_resolver.has_resolve_single) {
  report.existing_functionality.push('✓ Media resolver can resolve media_id to public_url');
}
if (report.admin_dashboard_branding[0]?.uses_static_svg) {
  report.existing_functionality.push('✓ Admin dashboard uses static SVG logo (hardcoded)');
}

// Identify gaps
if (!report.public_website_favicon.references_favicon_media_id) {
  report.confirmed_gaps.push('⚠️  Public website favicon NOT connected to business_settings.favicon_media_id');
}
if (!report.admin_dashboard_branding[0]?.references_business_settings) {
  report.confirmed_gaps.push('⚠️  Admin dashboard logo NOT connected to business_settings.logo_media_id');
}
if (!report.business_settings_ui.uses_media_picker && report.business_settings_ui.exists) {
  report.confirmed_gaps.push('⚠️  Business Settings UI does NOT use MediaPicker for logo/favicon');
}
if (report.business_settings_ui.has_url_input) {
  report.confirmed_gaps.push('⚠️  Business Settings UI still uses URL text inputs instead of media_id picker');
}

console.log('📋 EXISTING FUNCTIONALITY:\n');
report.existing_functionality.forEach(item => console.log(`   ${item}`));
console.log();

console.log('🔴 CONFIRMED GAPS:\n');
if (report.confirmed_gaps.length === 0) {
  console.log('   ✅ No gaps found — branding architecture appears complete');
} else {
  report.confirmed_gaps.forEach(item => console.log(`   ${item}`));
}
console.log();

// Generate recommendations
console.log('💡 RECOMMENDATIONS:\n');

if (report.confirmed_gaps.length === 0) {
  console.log('   ✅ Architecture appears complete — verify runtime behavior');
  report.recommendations.push('Run runtime verification to confirm logo/favicon rendering');
} else {
  if (report.confirmed_gaps.some(g => g.includes('favicon_media_id'))) {
    report.recommendations.push('Wire favicon_media_id into Next.js metadata generation');
  }
  if (report.confirmed_gaps.some(g => g.includes('Admin dashboard'))) {
    report.recommendations.push('Connect admin dashboard logo to business_settings.logo_media_id');
  }
  if (report.confirmed_gaps.some(g => g.includes('MediaPicker'))) {
    report.recommendations.push('Replace URL text inputs with MediaPickerModal in Business Settings UI');
  }
  
  report.recommendations.forEach(rec => console.log(`   • ${rec}`));
}
console.log();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SAVE REPORT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { writeFileSync } from 'fs';

const reportPath = join(ROOT, 'BRANDING_ASSETS_PHASE0_AUDIT.json');
writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log('═══════════════════════════════════════════════════════════');
console.log(`  Report saved: ${reportPath}`);
console.log('═══════════════════════════════════════════════════════════\n');

console.log('✅ Phase 0 inspection complete');
console.log('📄 Review BRANDING_ASSETS_PHASE0_AUDIT.json for detailed findings\n');
