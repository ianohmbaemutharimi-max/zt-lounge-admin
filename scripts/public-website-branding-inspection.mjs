#!/usr/bin/env node

/**
 * PUBLIC WEBSITE BRANDING ARCHITECTURE INSPECTION
 * 
 * Complete read-only audit to understand:
 * - How the public website currently fetches/renders branding
 * - Where logo/favicon are used
 * - What CMS contract is consumed
 * - What needs to be wired up
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

console.log('═══════════════════════════════════════════════════════════');
console.log('  PUBLIC WEBSITE BRANDING INSPECTION');
console.log('═══════════════════════════════════════════════════════════\n');

const report = {
  timestamp: new Date().toISOString(),
  framework: {},
  routing: {},
  businessSettingsFetch: {},
  logoLocations: [],
  faviconImplementation: {},
  metadata: {},
  searchResults: {},
  confirmedDefects: []
};

// ========================================
// 1. FRAMEWORK DETECTION
// ========================================

console.log('1️⃣  FRAMEWORK DETECTION\n');

try {
  const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf-8'));
  report.framework = {
    name: 'Next.js',
    version: pkg.dependencies?.next || pkg.devDependencies?.next || 'unknown',
    react: pkg.dependencies?.react || 'unknown'
  };
  console.log(`   Framework: Next.js ${report.framework.version}`);
  console.log(`   React: ${report.framework.react}`);
} catch (e) {
  report.framework = { error: e.message };
}

// Determine App Router vs Pages Router
const hasAppDir = existsSync(join(projectRoot, 'src/app'));
const hasPagesDir = existsSync(join(projectRoot, 'src/pages')) || existsSync(join(projectRoot, 'pages'));

report.routing = {
  appRouter: hasAppDir,
  pagesRouter: hasPagesDir,
  type: hasAppDir ? 'App Router' : hasPagesDir ? 'Pages Router' : 'Unknown'
};

console.log(`   Routing: ${report.routing.type}\n`);

// ========================================
// 2. SEARCH FOR BRANDING REFERENCES
// ========================================

console.log('2️⃣  SEARCHING FOR BRANDING REFERENCES\n');

const searchTerms = [
  'logo_url',
  'favicon_url',
  'logo_media_id',
  'favicon_media_id',
  'resolved_logo_url',
  'resolved_favicon_url',
  'business_settings',
  'businessSettings'
];

function searchInFile(filePath, term) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const matches = [];
    
    lines.forEach((line, idx) => {
      if (line.toLowerCase().includes(term.toLowerCase())) {
        matches.push({
          line: idx + 1,
          content: line.trim().substring(0, 100)
        });
      }
    });
    
    return matches.length > 0 ? matches : null;
  } catch {
    return null;
  }
}

const keyFiles = [
  'src/app/layout.tsx',
  'src/app/page.tsx',
  'src/components/header.tsx',
  'src/components/Header.tsx',
  'src/components/navbar.tsx',
  'src/components/Navbar.tsx',
  'src/components/footer.tsx',
  'src/components/Footer.tsx',
  'src/lib/api.ts',
  'src/lib/supabase.ts',
  'src/lib/business-settings.ts'
];

report.searchResults = {};

searchTerms.forEach(term => {
  console.log(`   Searching for: ${term}`);
  const results = [];
  
  keyFiles.forEach(file => {
    const fullPath = join(projectRoot, file);
    if (existsSync(fullPath)) {
      const matches = searchInFile(fullPath, term);
      if (matches) {
        results.push({ file, matches: matches.length });
      }
    }
  });
  
  report.searchResults[term] = results;
  if (results.length > 0) {
    console.log(`      Found in: ${results.map(r => r.file).join(', ')}`);
  }
});

console.log('');

// ========================================
// 3. INSPECT ROOT LAYOUT
// ========================================

console.log('3️⃣  INSPECTING ROOT LAYOUT\n');

const layoutPath = join(projectRoot, 'src/app/layout.tsx');
if (existsSync(layoutPath)) {
  const content = readFileSync(layoutPath, 'utf-8');
  
  report.metadata = {
    file: 'src/app/layout.tsx',
    exists: true,
    hasMetadataExport: content.includes('export const metadata'),
    hasGenerateMetadata: content.includes('export async function generateMetadata'),
    hasIcons: content.includes('icons:'),
    references: {
      businessSettings: content.includes('business_settings') || content.includes('businessSettings'),
      faviconUrl: content.includes('favicon_url') || content.includes('faviconUrl'),
      faviconMediaId: content.includes('favicon_media_id') || content.includes('faviconMediaId'),
      resolvedFaviconUrl: content.includes('resolved_favicon_url') || content.includes('resolvedFaviconUrl')
    }
  };
  
  console.log(`   Metadata approach: ${report.metadata.hasGenerateMetadata ? 'generateMetadata()' : report.metadata.hasMetadataExport ? 'static metadata' : 'none'}`);
  console.log(`   References business_settings: ${report.metadata.references.businessSettings ? '✓' : '✗'}`);
  console.log(`   References favicon fields: ${Object.values(report.metadata.references).some(v => v) ? '✓' : '✗'}`);
} else {
  report.metadata = { exists: false };
  console.log('   ⚠️  layout.tsx not found');
}

console.log('');

// ========================================
// 4. CHECK FOR BUSINESS SETTINGS FETCHER
// ========================================

console.log('4️⃣  BUSINESS SETTINGS DATA LAYER\n');

const possiblePaths = [
  'src/lib/business-settings.ts',
  'src/lib/businessSettings.ts',
  'src/lib/api.ts',
  'src/lib/supabase.ts',
  'src/lib/data/business-settings.ts'
];

report.businessSettingsFetch = { searched: possiblePaths, found: [] };

possiblePaths.forEach(path => {
  const fullPath = join(projectRoot, path);
  if (existsSync(fullPath)) {
    const content = readFileSync(fullPath, 'utf-8');
    if (content.includes('business_settings') || content.includes('businessSettings')) {
      report.businessSettingsFetch.found.push({
        file: path,
        hasFunction: /export (async )?function.*business.*settings/i.test(content),
        hasQuery: content.includes('.from(') && content.includes('business_settings'),
        snippet: content.substring(0, 300)
      });
      console.log(`   ✓ Found in: ${path}`);
    }
  }
});

if (report.businessSettingsFetch.found.length === 0) {
  console.log('   ⚠️  No dedicated business settings fetcher found');
  report.confirmedDefects.push({
    area: 'DATA_LAYER',
    severity: 'HIGH',
    issue: 'No business settings fetch mechanism detected'
  });
}

console.log('');

// ========================================
// 5. DEFECT SUMMARY
// ========================================

console.log('5️⃣  INITIAL DEFECT ANALYSIS\n');

if (!report.metadata.references?.businessSettings) {
  report.confirmedDefects.push({
    area: 'FAVICON',
    severity: 'HIGH',
    issue: 'Favicon not connected to CMS business_settings'
  });
}

if (report.searchResults.logo_url?.length === 0 && report.searchResults.resolved_logo_url?.length === 0) {
  report.confirmedDefects.push({
    area: 'LOGO',
    severity: 'HIGH',
    issue: 'Logo not consuming CMS branding data'
  });
}

console.log(`   📊 Confirmed defects: ${report.confirmedDefects.length}\n`);

report.confirmedDefects.forEach((defect, i) => {
  console.log(`   ${i + 1}. [${defect.severity}] ${defect.area}`);
  console.log(`      ${defect.issue}`);
});

// ========================================
// OUTPUT
// ========================================

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  Report saved: PUBLIC_WEBSITE_BRANDING_INSPECTION.json');
console.log('═══════════════════════════════════════════════════════════\n');

import { writeFileSync } from 'fs';
writeFileSync(
  join(projectRoot, 'PUBLIC_WEBSITE_BRANDING_INSPECTION.json'),
  JSON.stringify(report, null, 2)
);

console.log('✅ Inspection complete\n');
