#!/usr/bin/env node
/**
 * PHASE 2 — COLLECTION ARCHITECTURE AUDIT
 * 
 * Search entire codebase for:
 * - .slice() calls
 * - .limit() calls
 * - pagination limits
 * - MAX_ constants
 * - array truncations
 * 
 * Classify each as:
 * A = legitimate pagination
 * B = intentional UI preview
 * C = security/rate-limit
 * D = payload protection
 * E = business rule
 * F = ACCIDENTAL CMS LIMIT ⚠️
 * G = unrelated
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const patterns = [
  /\.slice\([^)]*\)/g,
  /\.splice\([^)]*\)/g,
  /\.limit\([^)]*\)/g,
  /\.take\([^)]*\)/g,
  /\.first\([^)]*\)/g,
  /Math\.min\([^)]*\)/g,
  /length\s*<\s*\d+/g,
  /length\s*>\s*\d+/g,
  /pageSize|page_size|paginationLimit/g,
  /MAX_[A-Z_]+/g,
];

const searchDirs = [
  'src',
  'supabase',
];

const ignorePatterns = [
  'node_modules',
  '.next',
  'dist',
  '.git',
];

function isIgnored(filePath) {
  return ignorePatterns.some(pattern => filePath.includes(pattern));
}

function searchFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const results = [];
  
  lines.forEach((line, lineNum) => {
    patterns.forEach(pattern => {
      const matches = line.matchAll(pattern);
      for (const match of matches) {
        results.push({
          file: filePath,
          line: lineNum + 1,
          code: line.trim(),
          match: match[0]
        });
      }
    });
  });
  
  return results;
}

function walkDir(dir) {
  const results = [];
  const items = fs.readdirSync(dir);
  
  items.forEach(item => {
    const filePath = path.join(dir, item);
    if (isIgnored(filePath)) return;
    
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      results.push(...walkDir(filePath));
    } else if (/\.(ts|tsx|js|mjs|sql)$/.test(filePath)) {
      results.push(...searchFile(filePath));
    }
  });
  
  return results;
}

async function audit() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║ PHASE 2 — COLLECTION ARCHITECTURE AUDIT                        ║');
  console.log('║ Searching for limits, slices, truncations                       ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  let allResults = [];
  
  for (const dir of searchDirs) {
    const fullPath = path.join(ROOT, dir);
    if (fs.existsSync(fullPath)) {
      console.log(`Searching: ${dir}/`);
      const results = walkDir(fullPath);
      allResults.push(...results);
    }
  }
  
  console.log(`\nFound: ${allResults.length} patterns\n`);
  
  // Group by file and sort
  const byFile = {};
  allResults.forEach(r => {
    if (!byFile[r.file]) byFile[r.file] = [];
    byFile[r.file].push(r);
  });
  
  // Output results
  console.log('════════════════════════════════════════════════════════════════');
  console.log('SEARCH RESULTS');
  console.log('════════════════════════════════════════════════════════════════\n');
  
  Object.entries(byFile).forEach(([file, results]) => {
    const relPath = path.relative(ROOT, file);
    console.log(`\n📄 ${relPath}`);
    console.log('─'.repeat(70));
    
    results.forEach(r => {
      console.log(`  Line ${r.line}: ${r.match}`);
      console.log(`  > ${r.code.substring(0, 80)}`);
    });
  });
  
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(`TOTALS: ${allResults.length} patterns found`);
  console.log('════════════════════════════════════════════════════════════════');
  
  // Save to file for review
  const reportFile = path.join(ROOT, 'PHASE2_COLLECTION_AUDIT.json');
  fs.writeFileSync(reportFile, JSON.stringify(allResults, null, 2));
  console.log(`\n✅ Saved detailed audit to: PHASE2_COLLECTION_AUDIT.json`);
}

audit().catch(console.error);
