#!/usr/bin/env node

/**
 * ZT LOUNGE PUBLIC WEBSITE — COMPREHENSIVE BRANDING AUDIT
 * 
 * READ-ONLY inspection of the public website to determine:
 * - Current logo architecture
 * - Current favicon architecture  
 * - Supabase connection
 * - Business settings integration
 * - Media resolution capability
 * - Exact integration points for CMS branding
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const publicWebsitePath = join(__dirname, '../../zt-lounge');

console.log('═══════════════════════════════════════════════════════════');
console.log('  ZT LOUNGE PUBLIC WEBSITE — BRANDING ARCHITECTURE AUDIT');
console.log('═══════════════════════════════════════════════════════════\n');

const report = {
  timestamp: new Date().toISOString(),
  website: {
    path: publicWebsitePath,
    exists: false
  },
  framework: {},
  logoArchitecture: {},
  faviconArchitecture: {},
  supabaseConnection: {},
  businessSettings: {},
  mediaResolution: {},
  confirmedProblems: [],
  targetArchitecture: {},
  filesToModify: [],
  filesNotToModify: []
};

// ========================================
// PHASE 1 — VERIFY PUBLIC WEBSITE EXISTS
// ========================================

console.log('📍 PHASE 1 — LOCATING PUBLIC WEBSITE\n');

if (!existsSync(publicWebsitePath)) {
  console.log(`   ❌ Public website not found at: ${publicWebsitePath}\n`);
  report.website.exists = false;
  process.exit(1);
}

report.website.exists = true;
console.log(`   ✓ Found: ${publicWebsitePath}`);

// Check for package.json
const packageJsonPath = join(publicWebsitePath, 'package.json');
if (existsSync(packageJsonPath)) {
  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  report.framework = {
    name: pkg.dependencies?.next ? 'Next.js' : pkg.dependencies?.react ? 'React' : 'Unknown',
    version: pkg.dependencies?.next || pkg.dependencies?.react || 'unknown',
    hasNext: !!pkg.dependencies?.next,
    hasPages: existsSync(join(publicWebsitePath, 'pages')),
    hasApp: existsSync(join(publicWebsitePath, 'app')),
    scripts: pkg.scripts || {}
  };
  console.log(`   Framework: ${report.framework.name} ${report.framework.version}`);
}

// Check structure
const hasIndexHtml = existsSync(join(publicWebsitePath, 'index.html'));
const hasNextDir = existsSync(join(publicWebsitePath, '.next'));
const hasPagesDir = existsSync(join(publicWebsitePath, 'pages'));

report.framework.type = hasIndexHtml ? 'Static HTML' : hasPagesDir ? 'Pages Router' : 'Unknown';
console.log(`   Type: ${report.framework.type}`);
console.log(`   Static Export: ${hasIndexHtml ? 'Yes' : 'No'}\n`);

// ========================================
// PHASE 2 — SEARCH FOR BRANDING REFERENCES
// ========================================

console.log('🔍 PHASE 2 — SEARCHING FOR BRANDING PATTERNS\n');

function searchDirectory(dir, patterns, maxDepth = 3, currentDepth = 0) {
  if (currentDepth > maxDepth) return [];
  
  const results = [];
  try {
    const items = readdirSync(dir);
    
    for (const item of items) {
      // Skip node_modules, .git, .next
      if (['node_modules', '.git', '.next', 'backup'].includes(item)) continue;
      
      const fullPath = join(dir, item);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        results.push(...searchDirectory(fullPath, patterns, maxDepth, currentDepth + 1));
      } else if (stat.isFile() && /\.(js|jsx|ts|tsx|html|css)$/.test(item)) {
        try {
          const content = readFileSync(fullPath, 'utf-8');
          patterns.forEach(pattern => {
            if (content.toLowerCase().includes(pattern.toLowerCase())) {
              results.push({
                file: fullPath.replace(publicWebsitePath, '').replace(/\\/g, '/'),
                pattern,
                lines: content.split('\n').filter((line, idx) => 
                  line.toLowerCase().includes(pattern.toLowerCase())
                ).length
              });
            }
          });
        } catch (e) {
          // Skip files that can't be read
        }
      }
    }
  } catch (e) {
    // Skip directories that can't be read
  }
  
  return results;
}

const brandingPatterns = [
  'logo',
  'favicon',
  'logo_url',
  'favicon_url',
  'logo_media_id',
  'favicon_media_id',
  'resolved_logo_url',
  'resolved_favicon_url',
  'business_settings',
  'zt-lounge-logo',
  'supabase'
];

console.log('   Scanning website files...\n');
const searchResults = {};

brandingPatterns.forEach(pattern => {
  const matches = searchDirectory(publicWebsitePath, [pattern], 3);
  if (matches.length > 0) {
    searchResults[pattern] = matches;
    console.log(`   ${pattern}: ${matches.length} occurrences`);
    matches.slice(0, 3).forEach(m => {
      console.log(`      - ${m.file} (${m.lines} lines)`);
    });
  }
});

report.logoArchitecture.searchResults = searchResults;

console.log('\n');

// ========================================
// PHASE 3 — INSPECT SUPABASE CONNECTION
// ========================================

console.log('🔌 PHASE 3 — SUPABASE CONNECTION\n');

const envLocalPath = join(publicWebsitePath, '.env.local');
const envPath = join(publicWebsitePath, '.env');

let hasSupabaseConfig = false;

if (existsSync(envLocalPath)) {
  const env = readFileSync(envLocalPath, 'utf-8');
  hasSupabaseConfig = env.includes('SUPABASE_URL') || env.includes('NEXT_PUBLIC_SUPABASE');
  report.supabaseConnection.hasEnvLocal = true;
  report.supabaseConnection.hasSupabaseUrl = env.includes('SUPABASE_URL');
  console.log('   ✓ .env.local found');
  console.log(`   Supabase configured: ${hasSupabaseConfig ? 'Yes' : 'No'}`);
}

if (existsSync(envPath)) {
  report.supabaseConnection.hasEnv = true;
  console.log('   ✓ .env found');
}

console.log('\n');

// ========================================
// PHASE 4 — INSPECT CURRENT LOGO
// ========================================

console.log('🖼️  PHASE 4 — CURRENT LOGO IMPLEMENTATION\n');

// Check for logo files in assets
const assetsDir = join(publicWebsitePath, 'assets');
if (existsSync(assetsDir)) {
  const logoFiles = readdirSync(assetsDir, { recursive: true })
    .filter(f => f.toString().toLowerCase().includes('logo'));
  
  report.logoArchitecture.localAssets = logoFiles;
  console.log(`   Local logo assets: ${logoFiles.length}`);
  logoFiles.slice(0, 5).forEach(f => console.log(`      - ${f}`));
}

console.log('\n');

// ========================================
// PHASE 5 — INSPECT CURRENT FAVICON
// ========================================

console.log('⭐ PHASE 5 — CURRENT FAVICON IMPLEMENTATION\n');

const faviconLocations = [
  'favicon.ico',
  'assets/images/favicon.ico',
  'public/favicon.ico'
];

faviconLocations.forEach(loc => {
  const fullPath = join(publicWebsitePath, loc);
  if (existsSync(fullPath)) {
    console.log(`   ✓ Found: ${loc}`);
    report.faviconArchitecture.staticFiles = report.faviconArchitecture.staticFiles || [];
    report.faviconArchitecture.staticFiles.push(loc);
  }
});

// Check index.html for favicon references
const indexHtmlPath = join(publicWebsitePath, 'index.html');
if (existsSync(indexHtmlPath)) {
  const html = readFileSync(indexHtmlPath, 'utf-8');
  const faviconMatches = html.match(/<link[^>]*rel=["']icon["'][^>]*>/g) || [];
  report.faviconArchitecture.htmlReferences = faviconMatches;
  console.log(`   HTML favicon links: ${faviconMatches.length}`);
}

console.log('\n');

// ========================================
// PHASE 6 — CONFIRMED PROBLEMS
// ========================================

console.log('⚠️  PHASE 6 — CONFIRMED PROBLEMS\n');

if (!searchResults.business_settings || searchResults.business_settings.length === 0) {
  report.confirmedProblems.push({
    severity: 'HIGH',
    area: 'BUSINESS_SETTINGS',
    issue: 'Public website does not fetch business_settings from Supabase'
  });
  console.log('   ❌ No business_settings integration');
}

if (!searchResults.logo_media_id && !searchResults.resolved_logo_url) {
  report.confirmedProblems.push({
    severity: 'HIGH',
    area: 'LOGO',
    issue: 'Logo not connected to CMS media architecture'
  });
  console.log('   ❌ Logo not using CMS');
}

if (!searchResults.favicon_media_id && !searchResults.resolved_favicon_url) {
  report.confirmedProblems.push({
    severity: 'HIGH',
    area: 'FAVICON',
    issue: 'Favicon not connected to CMS media architecture'
  });
  console.log('   ❌ Favicon not using CMS');
}

if (!hasSupabaseConfig) {
  report.confirmedProblems.push({
    severity: 'CRITICAL',
    area: 'SUPABASE',
    issue: 'No Supabase connection configured'
  });
  console.log('   ❌ No Supabase connection');
}

console.log(`\n   Total problems: ${report.confirmedProblems.length}\n`);

// ========================================
// OUTPUT
// ========================================

console.log('═══════════════════════════════════════════════════════════');
console.log('  Report saved: PUBLIC_WEBSITE_BRANDING_AUDIT.json');
console.log('═══════════════════════════════════════════════════════════\n');

import { writeFileSync } from 'fs';
const reportPath = join(__dirname, '../PUBLIC_WEBSITE_BRANDING_AUDIT.json');
writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log('✅ Audit complete\n');

// Exit with error code if critical problems found
const hasCritical = report.confirmedProblems.some(p => p.severity === 'CRITICAL');
process.exit(hasCritical ? 1 : 0);
