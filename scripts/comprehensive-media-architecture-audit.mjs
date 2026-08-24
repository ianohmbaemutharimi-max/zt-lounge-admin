#!/usr/bin/env node
/**
 * COMPREHENSIVE MEDIA ARCHITECTURE AUDIT
 * 
 * Performs a complete system audit to verify:
 * - Media Library as single source of truth
 * - No raw URL bypasses
 * - Consistent image workflow
 * - No video functionality
 * - Brand assets integration
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const report = {
  timestamp: new Date().toISOString(),
  phase: 'COMPREHENSIVE_MEDIA_ARCHITECTURE_AUDIT',
  findings: [],
  criticalIssues: [],
  highIssues: [],
  mediumIssues: [],
  lowIssues: [],
  filesInspected: 0,
  mediaRelatedFiles: []
};

// Search patterns
const patterns = {
  imageUrl: /image_?url|imageUrl/gi,
  logoUrl: /logo_?url|logoUrl/gi,
  faviconUrl: /favicon_?url|faviconUrl/gi,
  mediaId: /media_?id|mediaId/gi,
  publicUrl: /public_?url|publicUrl/gi,
  urlInput: /<input[^>]*type=["']text["'][^>]*url/gi,
  fileInput: /<input[^>]*type=["']file["']/gi,
  mediaLibrary: /MediaLibrary|media-library|media_library/gi,
  mediaPicker: /MediaPicker|media-picker|media_picker/gi,
  imageChange: /ImageChange|image-change|changeImage/gi,
  videoKeywords: /video|mp4|webm|ogg|VideoUpload|video-upload/gi,
  urlTextField: /placeholder=["'][^"']*url["']/gi,
};

function searchFile(filePath, relativePath) {
  try {
    const content = readFileSync(filePath, 'utf8');
    const findings = {};
    
    for (const [key, pattern] of Object.entries(patterns)) {
      const matches = content.match(pattern);
      if (matches && matches.length > 0) {
        findings[key] = matches.length;
      }
    }
    
    if (Object.keys(findings).length > 0) {
      report.mediaRelatedFiles.push({
        file: relativePath,
        findings
      });
    }
    
    report.filesInspected++;
  } catch (err) {
    // Skip files that can't be read
  }
}

function walkDirectory(dir, baseDir = dir) {
  const files = readdirSync(dir);
  
  for (const file of files) {
    const fullPath = join(dir, file);
    const relativePath = fullPath.replace(baseDir + '/', '');
    
    // Skip node_modules, .next, etc.
    if (relativePath.includes('node_modules') || 
        relativePath.includes('.next') ||
        relativePath.includes('dist') ||
        relativePath.includes('.git')) {
      continue;
    }
    
    try {
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        walkDirectory(fullPath, baseDir);
      } else if (stat.isFile()) {
        const ext = extname(file);
        if (['.ts', '.tsx', '.js', '.jsx', '.sql', '.json'].includes(ext)) {
          searchFile(fullPath, relativePath);
        }
      }
    } catch (err) {
      // Skip
    }
  }
}

console.log('🔍 Starting comprehensive media architecture audit...\n');

// Phase 1: Search entire codebase
console.log('📂 Phase 1: Searching entire codebase for media-related patterns...');
walkDirectory(join(rootDir, 'src'));
walkDirectory(join(rootDir, 'supabase'));

console.log(`✅ Inspected ${report.filesInspected} files`);
console.log(`📊 Found ${report.mediaRelatedFiles.length} media-related files\n`);

// Phase 2: Analyze findings
console.log('📊 Phase 2: Analyzing findings...\n');

// Group by concern
const urlInputFiles = report.mediaRelatedFiles.filter(f => f.findings.urlInput || f.findings.urlTextField);
const videoFiles = report.mediaRelatedFiles.filter(f => f.findings.videoKeywords);
const mediaLibraryFiles = report.mediaRelatedFiles.filter(f => f.findings.mediaLibrary || f.findings.mediaPicker);
const imageUrlFiles = report.mediaRelatedFiles.filter(f => f.findings.imageUrl);

console.log(`🔴 CRITICAL: Files with raw URL inputs: ${urlInputFiles.length}`);
if (urlInputFiles.length > 0) {
  report.criticalIssues.push({
    type: 'RAW_URL_INPUTS',
    severity: 'CRITICAL',
    count: urlInputFiles.length,
    files: urlInputFiles.map(f => f.file),
    description: 'Files contain raw URL text inputs that bypass Media Library'
  });
  console.log('   Files:');
  urlInputFiles.forEach(f => console.log(`   - ${f.file}`));
}

console.log(`\n🟠 HIGH: Files with video keywords: ${videoFiles.length}`);
if (videoFiles.length > 0) {
  report.highIssues.push({
    type: 'VIDEO_FUNCTIONALITY',
    severity: 'HIGH',
    count: videoFiles.length,
    files: videoFiles.map(f => f.file),
    description: 'Files contain video-related code (requirement: image-only)'
  });
  console.log('   Files:');
  videoFiles.slice(0, 10).forEach(f => console.log(`   - ${f.file}`));
  if (videoFiles.length > 10) console.log(`   ... and ${videoFiles.length - 10} more`);
}

console.log(`\n🟢 INFO: Media Library implementation files: ${mediaLibraryFiles.length}`);
console.log('   Key files:');
mediaLibraryFiles.slice(0, 5).forEach(f => console.log(`   - ${f.file}`));

console.log(`\n📊 INFO: Files with image_url references: ${imageUrlFiles.length}`);

// Phase 3: Check specific critical files
console.log('\n📂 Phase 3: Inspecting critical CMS files...\n');

const criticalFiles = [
  'src/features/cms/website-cms.tsx',
  'src/features/services/catalog-manager.tsx',
  'src/features/gallery/gallery-view.tsx',
  'src/features/media/media-picker-modal.tsx',
  'src/features/media/image-change-dialog.tsx',
  'src/lib/media/resolver.ts',
  'src/db/schema.ts',
  'src/lib/repository.ts'
];

for (const file of criticalFiles) {
  const exists = report.mediaRelatedFiles.find(f => f.file.includes(file));
  console.log(`${exists ? '✅' : '❌'} ${file}`);
  if (exists) {
    console.log(`   Matches: ${JSON.stringify(exists.findings)}`);
  }
}

// Write report
const reportPath = join(rootDir, 'MEDIA_ARCHITECTURE_AUDIT_DETAILED.json');
writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(`\n📄 Detailed report saved to: MEDIA_ARCHITECTURE_AUDIT_DETAILED.json`);

// Summary
console.log('\n' + '='.repeat(80));
console.log('AUDIT SUMMARY');
console.log('='.repeat(80));
console.log(`Files Inspected: ${report.filesInspected}`);
console.log(`Media-Related Files: ${report.mediaRelatedFiles.length}`);
console.log(`Critical Issues: ${report.criticalIssues.length}`);
console.log(`High Issues: ${report.highIssues.length}`);
console.log(`Medium Issues: ${report.mediumIssues.length}`);
console.log(`Low Issues: ${report.lowIssues.length}`);
console.log('='.repeat(80));

process.exit(report.criticalIssues.length > 0 ? 1 : 0);
