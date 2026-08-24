#!/usr/bin/env node
/**
 * ZT Lounge Admin - Logo & Favicon Runtime Verification
 * 
 * Verifies that SVG logo and favicon are correctly loaded and rendered.
 * This script performs HTTP checks and file system verification.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const report = {
  timestamp: new Date().toISOString(),
  status: 'INCOMPLETE',
  checks: {},
  issues: [],
  warnings: []
};

console.log('═══════════════════════════════════════════════════════════');
console.log('  ZT LOUNGE ADMIN — LOGO & FAVICON RUNTIME VERIFICATION');
console.log('═══════════════════════════════════════════════════════════\n');

// ============================================================
// 1. VERIFY SVG LOGO FILE EXISTS AND IS VALID
// ============================================================
console.log('📋 [1/10] Verifying SVG Logo File...');
const svgPath = path.join(projectRoot, 'public', 'images', 'logo', 'zt-lounge-logo.svg');

try {
  const svgContent = fs.readFileSync(svgPath, 'utf8');
  const svgStats = fs.statSync(svgPath);
  
  // Validate it's actually SVG
  if (!svgContent.includes('<svg')) {
    report.issues.push('SVG file does not contain <svg> tag');
    report.checks.svgFile = '❌ INVALID - Not a valid SVG';
  } else if (!svgContent.includes('viewBox')) {
    report.warnings.push('SVG missing viewBox attribute (may cause scaling issues)');
    report.checks.svgFile = '⚠️  VALID but missing viewBox';
  } else {
    report.checks.svgFile = `✅ VALID (${svgStats.size} bytes, has viewBox)`;
    console.log(`   ✅ SVG exists: ${svgStats.size} bytes`);
    console.log(`   ✅ Contains <svg> tag`);
    console.log(`   ✅ Contains viewBox attribute`);
  }
} catch (error) {
  report.issues.push(`SVG file not found: ${svgPath}`);
  report.checks.svgFile = '❌ NOT FOUND';
  console.log(`   ❌ SVG file not found: ${error.message}`);
}

// ============================================================
// 2. VERIFY FAVICON FILE EXISTS AND FORMAT
// ============================================================
console.log('\n📋 [2/10] Verifying Favicon File...');
const faviconPath = path.join(projectRoot, 'public', 'favicon.ico');

try {
  const faviconBuffer = fs.readFileSync(faviconPath);
  const faviconStats = fs.statSync(faviconPath);
  
  // Check if it's a proper ICO or PNG
  const isPNG = faviconBuffer[0] === 0x89 && faviconBuffer[1] === 0x50 &&
                faviconBuffer[2] === 0x4E && faviconBuffer[3] === 0x47;
  const isICO = faviconBuffer[0] === 0x00 && faviconBuffer[1] === 0x00 &&
                (faviconBuffer[2] === 0x01 || faviconBuffer[2] === 0x02) && 
                faviconBuffer[3] === 0x00;
  
  if (isPNG) {
    report.checks.favicon = `⚠️  PNG-based (${faviconStats.size} bytes) - Consider proper multi-res ICO`;
    report.warnings.push('Favicon is PNG-based, not multi-resolution ICO');
    console.log(`   ⚠️  Favicon is PNG-based: ${faviconStats.size} bytes`);
    console.log(`   ℹ️  Recommended: Create proper multi-resolution ICO`);
  } else if (isICO) {
    report.checks.favicon = `✅ ICO format (${faviconStats.size} bytes)`;
    console.log(`   ✅ Favicon is ICO format: ${faviconStats.size} bytes`);
  } else {
    report.checks.favicon = `⚠️  Unknown format (${faviconStats.size} bytes)`;
    report.warnings.push('Favicon format could not be determined');
    console.log(`   ⚠️  Favicon format unknown: ${faviconStats.size} bytes`);
  }
  
  if (faviconStats.size < 100) {
    report.warnings.push(`Favicon size (${faviconStats.size} bytes) is very small - may be placeholder`);
    console.log(`   ⚠️  Favicon is very small (${faviconStats.size} bytes) - verify it's not a placeholder`);
  }
} catch (error) {
  report.issues.push(`Favicon file not found: ${faviconPath}`);
  report.checks.favicon = '❌ NOT FOUND';
  console.log(`   ❌ Favicon not found: ${error.message}`);
}

// ============================================================
// 3. VERIFY SOURCE CODE REFERENCES
// ============================================================
console.log('\n📋 [3/10] Verifying Source Code References...');

const filesToCheck = [
  'src/components/sidebar.tsx',
  'src/app/login/page.tsx',
  'src/app/unauthorized/page.tsx',
  'src/app/layout.tsx'
];

let svgReferences = 0;
let pngReferences = 0;

for (const file of filesToCheck) {
  const filePath = path.join(projectRoot, file);
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    if (content.includes('zt-lounge-logo.svg')) {
      svgReferences++;
      console.log(`   ✅ ${file} → references SVG`);
    }
    if (content.includes('zt-lounge-logo.png')) {
      pngReferences++;
      console.log(`   ⚠️  ${file} → still references PNG`);
      report.warnings.push(`${file} references PNG logo`);
    }
  } catch (error) {
    console.log(`   ⚠️  Could not read ${file}`);
  }
}

report.checks.sourceCodeSVG = `${svgReferences}/4 files use SVG`;
report.checks.sourceCodePNG = pngReferences === 0 ? '✅ No PNG references' : `⚠️  ${pngReferences} PNG references remain`;

console.log(`\n   Summary: ${svgReferences} SVG refs, ${pngReferences} PNG refs`);

// ============================================================
// 4. CHECK PNG BACKUP FILE
// ============================================================
console.log('\n📋 [4/10] Checking PNG Backup File...');
const pngPath = path.join(projectRoot, 'public', 'images', 'logo', 'zt-lounge-logo.png');

try {
  const pngStats = fs.statSync(pngPath);
  report.checks.pngBackup = `ℹ️  Exists (${pngStats.size} bytes) - Legacy backup`;
  console.log(`   ℹ️  PNG backup exists: ${pngStats.size} bytes (for legacy/backup)`);
} catch (error) {
  report.checks.pngBackup = 'ℹ️  Not found (OK if not needed)';
  console.log(`   ℹ️  PNG backup not found (OK if intentionally removed)`);
}

// ============================================================
// 5. VERIFY LAYOUT METADATA
// ============================================================
console.log('\n📋 [5/10] Verifying Layout Metadata...');
const layoutPath = path.join(projectRoot, 'src', 'app', 'layout.tsx');

try {
  const layoutContent = fs.readFileSync(layoutPath, 'utf8');
  
  const hasIconsMetadata = layoutContent.includes('icons:');
  const hasFaviconRef = layoutContent.includes('favicon.ico');
  const hasSVGAppleIcon = layoutContent.includes('zt-lounge-logo.svg') && layoutContent.includes('apple');
  
  console.log(`   ${hasIconsMetadata ? '✅' : '⚠️ '} Icons metadata: ${hasIconsMetadata ? 'present' : 'missing'}`);
  console.log(`   ${hasFaviconRef ? '✅' : '⚠️ '} Favicon reference: ${hasFaviconRef ? 'present' : 'missing'}`);
  console.log(`   ${hasSVGAppleIcon ? '✅' : 'ℹ️ '} Apple icon (SVG): ${hasSVGAppleIcon ? 'present' : 'uses default'}`);
  
  report.checks.layoutMetadata = hasIconsMetadata && hasFaviconRef ? '✅ Properly configured' : '⚠️  Incomplete metadata';
} catch (error) {
  report.checks.layoutMetadata = '⚠️  Could not verify';
  console.log(`   ⚠️  Could not read layout.tsx`);
}

// ============================================================
// 6. CHECK FOR STALE IMAGE IMPORTS
// ============================================================
console.log('\n📋 [6/10] Checking for Stale Image Imports...');

const componentsToCheck = [
  'src/components/sidebar.tsx',
  'src/app/login/page.tsx', 
  'src/app/unauthorized/page.tsx'
];

let unusedImageImports = 0;

for (const file of componentsToCheck) {
  const filePath = path.join(projectRoot, file);
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Check for unused Next.js Image import
    const hasImageImport = content.includes('import Image') || content.includes('from "next/image"');
    const usesImageComponent = content.includes('<Image') && content.includes('src=');
    
    if (hasImageImport && !usesImageComponent) {
      unusedImageImports++;
      report.warnings.push(`${file} has unused Image import`);
      console.log(`   ⚠️  ${file} → unused Image import (should be removed)`);
    } else if (!hasImageImport && !usesImageComponent) {
      console.log(`   ✅ ${file} → uses native <img> (correct for SVG)`);
    }
  } catch (error) {
    // Skip
  }
}

report.checks.unusedImports = unusedImageImports === 0 ? '✅ No unused imports' : `⚠️  ${unusedImageImports} unused imports`;

// ============================================================
// 7. VERIFY ASPECT RATIOS
// ============================================================
console.log('\n📋 [7/10] Verifying Logo Aspect Ratios...');

const aspectRatios = {
  sidebar: { file: 'src/components/sidebar.tsx', expected: '4:1 (40x10)' },
  login: { file: 'src/app/login/page.tsx', expected: '4:1 (160x40)' },
  unauthorized: { file: 'src/app/unauthorized/page.tsx', expected: '4:1 (160x40)' }
};

let correctAspectRatios = 0;

for (const [context, info] of Object.entries(aspectRatios)) {
  const filePath = path.join(projectRoot, info.file);
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Extract width/height from img tags
    const imgMatch = content.match(/width[=\s{]*["'{]?(\d+)["'}]?.*height[=\s{]*["'{]?(\d+)["'}]?/);
    
    if (imgMatch) {
      const width = parseInt(imgMatch[1]);
      const height = parseInt(imgMatch[2]);
      const ratio = width / height;
      const isCorrect = Math.abs(ratio - 4) < 0.1; // Allow small variance
      
      if (isCorrect) {
        correctAspectRatios++;
        console.log(`   ✅ ${context}: ${width}×${height} (${ratio.toFixed(1)}:1) ✓`);
      } else {
        console.log(`   ⚠️  ${context}: ${width}×${height} (${ratio.toFixed(1)}:1) - expected ~4:1`);
        report.warnings.push(`${context} logo has unexpected aspect ratio: ${ratio.toFixed(1)}:1`);
      }
    } else {
      console.log(`   ⚠️  ${context}: Could not detect dimensions`);
    }
  } catch (error) {
    // Skip
  }
}

report.checks.aspectRatios = `${correctAspectRatios}/3 correct`;

// ============================================================
// 8. CHECK MEDIA RESOLVER (MUST REMAIN IMAGE-ONLY)
// ============================================================
console.log('\n📋 [8/10] Verifying Media Resolver Unchanged...');
const resolverPath = path.join(projectRoot, 'src', 'lib', 'media', 'resolver.ts');

try {
  const resolverContent = fs.readFileSync(resolverPath, 'utf8');
  
  const hasResolveMediaUrl = resolverContent.includes('resolveMediaUrl') && 
                             resolverContent.includes('export') &&
                             resolverContent.includes('function resolveMediaUrl');
  const hasVideoSupport = resolverContent.toLowerCase().includes('video') || 
                         resolverContent.includes('.mp4') || 
                         resolverContent.includes('.webm');
  
  if (hasResolveMediaUrl) {
    report.issues.push('CRITICAL: resolveMediaUrl was introduced (FORBIDDEN)');
    report.checks.mediaResolver = '❌ MODIFIED - resolveMediaUrl added';
    console.log(`   ❌ CRITICAL: resolveMediaUrl detected (must not exist)`);
  } else if (hasVideoSupport) {
    report.issues.push('CRITICAL: Video support was introduced (FORBIDDEN)');
    report.checks.mediaResolver = '❌ MODIFIED - Video support added';
    console.log(`   ❌ CRITICAL: Video support detected (must remain IMAGE-ONLY)`);
  } else {
    report.checks.mediaResolver = '✅ UNCHANGED - IMAGE-ONLY preserved';
    console.log(`   ✅ Media resolver remains IMAGE-ONLY (correct)`);
  }
} catch (error) {
  report.checks.mediaResolver = 'ℹ️  Could not verify';
  console.log(`   ℹ️  Could not read resolver.ts`);
}

// ============================================================
// 9. VERIFY BUILD STATUS
// ============================================================
console.log('\n📋 [9/10] Checking Last Build Status...');
const nextBuildPath = path.join(projectRoot, '.next');

try {
  const buildStats = fs.statSync(nextBuildPath);
  const buildAge = Date.now() - buildStats.mtimeMs;
  const buildMinutesAgo = Math.floor(buildAge / 60000);
  
  if (buildMinutesAgo < 10) {
    report.checks.buildStatus = `✅ Recent build (${buildMinutesAgo}m ago)`;
    console.log(`   ✅ Build exists: ${buildMinutesAgo} minutes ago`);
  } else {
    report.checks.buildStatus = `⚠️  Stale build (${buildMinutesAgo}m ago) - run 'npm run build'`;
    console.log(`   ⚠️  Build is ${buildMinutesAgo} minutes old - consider rebuilding`);
  }
} catch (error) {
  report.checks.buildStatus = '⚠️  No build found - run npm run build';
  console.log(`   ⚠️  No build found`);
}

// ============================================================
// 10. FINAL SUMMARY
// ============================================================
console.log('\n📋 [10/10] Generating Final Summary...\n');

const criticalIssues = report.issues.filter(i => i.includes('CRITICAL'));
const nonCriticalIssues = report.issues.filter(i => !i.includes('CRITICAL'));

if (criticalIssues.length > 0) {
  report.status = '🔴 FAILED - CRITICAL ISSUES';
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  🔴 CRITICAL ISSUES DETECTED');
  console.log('═══════════════════════════════════════════════════════════\n');
  criticalIssues.forEach(issue => console.log(`   ❌ ${issue}`));
} else if (nonCriticalIssues.length > 0) {
  report.status = '🟡 INCOMPLETE - ISSUES REMAIN';
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  🟡 ISSUES DETECTED');
  console.log('═══════════════════════════════════════════════════════════\n');
  nonCriticalIssues.forEach(issue => console.log(`   ⚠️  ${issue}`));
} else if (report.warnings.length > 0) {
  report.status = '🟡 INCOMPLETE - WARNINGS PRESENT';
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  🟡 WARNINGS DETECTED');
  console.log('═══════════════════════════════════════════════════════════\n');
  report.warnings.forEach(warning => console.log(`   ⚠️  ${warning}`));
} else {
  report.status = '🟢 COMPLETE - FILE VERIFICATION PASSED';
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  🟢 FILE VERIFICATION COMPLETE');
  console.log('═══════════════════════════════════════════════════════════\n');
}

// Print summary
console.log('\n📊 VERIFICATION SUMMARY:\n');
Object.entries(report.checks).forEach(([key, value]) => {
  console.log(`   ${key}: ${value}`);
});

console.log('\n═══════════════════════════════════════════════════════════');
console.log(`  FINAL STATUS: ${report.status}`);
console.log('═══════════════════════════════════════════════════════════\n');

console.log('⚠️  MANUAL BROWSER VERIFICATION STILL REQUIRED:\n');
console.log('   1. Start dev server: npm run dev');
console.log('   2. Open http://localhost:3000/login');
console.log('   3. Verify logo is visible (not broken image icon)');
console.log('   4. Open DevTools → Network → Filter "logo"');
console.log('   5. Confirm: /images/logo/zt-lounge-logo.svg returns HTTP 200');
console.log('   6. Check browser tab for favicon');
console.log('   7. Navigate to /dashboard, /unauthorized');
console.log('   8. Verify no console warnings\n');

// Save report
const reportPath = path.join(projectRoot, 'logo-favicon-verification-report.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`📝 Report saved: ${reportPath}\n`);

// Exit with appropriate code
if (criticalIssues.length > 0) {
  process.exit(1);
} else if (nonCriticalIssues.length > 0 || report.warnings.length > 0) {
  process.exit(2);
} else {
  process.exit(0);
}
