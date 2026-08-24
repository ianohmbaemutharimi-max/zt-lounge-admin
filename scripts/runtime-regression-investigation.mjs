#!/usr/bin/env node

/**
 * RUNTIME REGRESSION INVESTIGATION
 * 
 * Systematic investigation of browser runtime errors:
 * 1. booking.config.js:49 - Unexpected token '}'
 * 2. ServicesRepository.getAll is not a function
 * 3. services?is_active=eq.true - HTTP 400
 * 4. UUID "conference" bug
 */

import { createClient } from '@supabase/supabase-js';
import { readFile, writeFile, readdir } from 'fs/promises';
import { join } from 'path';

// Simple recursive file finder
async function findFiles(dir, pattern) {
  const files = [];
  async function scan(currentDir) {
    try {
      const entries = await readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await scan(fullPath);
        } else if (entry.isFile() && pattern.test(entry.name)) {
          files.push(fullPath);
        }
      }
    } catch (e) {
      // Skip inaccessible directories
    }
  }
  await scan(dir);
  return files;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const report = {
  timestamp: new Date().toISOString(),
  findings: {}
};

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  RUNTIME REGRESSION INVESTIGATION                              ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// ============================================================
// 1. SERVICES SCHEMA - LIVE DATABASE
// ============================================================
console.log('═══ 1. SERVICES SCHEMA - LIVE DATABASE ===\n');

const { data: services, error: servicesError } = await supabase
  .from('services')
  .select('*')
  .limit(1)
  .single();

if (services) {
  const columns = Object.keys(services);
  console.log('Services table columns:');
  columns.forEach(col => console.log(`   • ${col}`));
  
  report.findings.services_schema = {
    columns,
    has_active: columns.includes('active'),
    has_is_active: columns.includes('is_active'),
    sample: services
  };
  
  console.log(`\n   ${columns.includes('is_active') ? '✅' : '❌'} has is_active column`);
  console.log(`   ${columns.includes('active') ? '✅' : '❌'} has active column\n`);
}

// Test the query that's failing
console.log('Testing: services?is_active=eq.true\n');
const { data: activeServices, error: activeError } = await supabase
  .from('services')
  .select('*')
  .eq('is_active', true);

if (activeError) {
  console.log(`   ❌ Query failed: ${activeError.message}`);
  console.log(`   Error code: ${activeError.code}`);
  report.findings.is_active_query = {
    success: false,
    error: activeError.message,
    code: activeError.code
  };
} else {
  console.log(`   ✅ Query succeeded (${activeServices?.length || 0} results)`);
  report.findings.is_active_query = {
    success: true,
    count: activeServices?.length || 0
  };
}
console.log('');

// ============================================================
// 2. SEARCH FOR ServicesRepository
// ============================================================
console.log('═══ 2. SERVICESREPOSITORY CONTRACT ===\n');

const repoFiles = await findFiles('src', /repository|Repository/i);

console.log(`Found ${repoFiles.length} repository files:\n`);
report.findings.repository_files = [];

for (const file of repoFiles) {
  const shortPath = file.replace(process.cwd(), '').replace(/\\/g, '/');
  console.log(`   • ${shortPath}`);
  
  const content = await readFile(file, 'utf-8');
  
  // Check for ServicesRepository
  if (content.includes('ServicesRepository') || content.includes('services') && content.includes('Repository')) {
    report.findings.repository_files.push({
      path: shortPath,
      has_getAll: content.includes('getAll'),
      has_export: content.includes('export'),
      has_window_assignment: content.includes('window.ServicesRepository')
    });
  }
}
console.log('');

// ============================================================
// 3. SEARCH FOR content-loader
// ============================================================
console.log('═══ 3. CONTENT-LOADER INVESTIGATION ===\n');

const loaderFiles = await glob('src/**/*{content-loader,contentLoader,content_loader}*.{ts,tsx,js,jsx}', {
  cwd: process.cwd(),
  absolute: true
});

console.log(`Found ${loaderFiles.length} content loader files:\n`);
report.findings.content_loader_files = [];

for (const file of loaderFiles) {
  const shortPath = file.replace(process.cwd(), '').replace(/\\/g, '/');
  console.log(`   • ${shortPath}`);
  
  const content = await readFile(file, 'utf-8');
  const lines = content.split('\n');
  
  // Look for ServicesRepository usage
  const repoUsage = lines.filter((line, idx) => 
    line.includes('ServicesRepository') && {line: idx + 1, content: line.trim()}
  );
  
  if (repoUsage.length > 0) {
    console.log(`\n   ServicesRepository usage found:`);
    repoUsage.forEach(({line, content}) => {
      console.log(`      Line ${line}: ${content}`);
    });
  }
  
  report.findings.content_loader_files.push({
    path: shortPath,
    uses_services_repository: content.includes('ServicesRepository')
  });
}
console.log('');

// ============================================================
// 4. UUID "conference" BUG INVESTIGATION
// ============================================================
console.log('═══ 4. UUID "conference" BUG ===\n');

// Search for gallery and FAQ queries
const queryFiles = await glob('src/**/*.{ts,tsx,js,jsx}', {
  cwd: process.cwd(),
  absolute: true,
  ignore: ['**/node_modules/**', '**/.next/**']
});

console.log('Searching for UUID/service slug confusion...\n');
report.findings.uuid_conference_bug = [];

for (const file of queryFiles) {
  const content = await readFile(file, 'utf-8');
  const shortPath = file.replace(process.cwd(), '').replace(/\\/g, '/');
  
  // Look for patterns that might pass "conference" as UUID
  const patterns = [
    /\.eq\(['"]id['"],\s*['"]conference['"]\)/g,
    /service_id.*conference/gi,
    /gallery.*conference/gi,
    /faq.*conference/gi,
    /\?id=conference/g,
    /\[id\].*conference/g
  ];
  
  for (const pattern of patterns) {
    const matches = content.match(pattern);
    if (matches) {
      console.log(`   ⚠️  Potential issue in ${shortPath}:`);
      matches.forEach(m => console.log(`      ${m}`));
      report.findings.uuid_conference_bug.push({
        file: shortPath,
        matches
      });
    }
  }
}

if (report.findings.uuid_conference_bug.length === 0) {
  console.log('   ✅ No obvious UUID/slug confusion found in source files');
}
console.log('');

// ============================================================
// 5. CHECK FOR RECENT CHANGES
// ============================================================
console.log('═══ 5. CHECKING FOR RECENT FILE MODIFICATIONS ===\n');

const recentlyModifiedFiles = await glob('src/**/*.{ts,tsx,js,jsx}', {
  cwd: process.cwd(),
  absolute: true,
  ignore: ['**/node_modules/**', '**/.next/**']
});

const fileStats = [];
for (const file of recentlyModifiedFiles) {
  const stats = await import('fs').then(fs => fs.promises.stat(file));
  fileStats.push({
    path: file.replace(process.cwd(), '').replace(/\\/g, '/'),
    modified: stats.mtime
  });
}

// Sort by modification time
fileStats.sort((a, b) => b.modified - a.modified);

console.log('Recently modified files (last 10):\n');
fileStats.slice(0, 10).forEach(({path, modified}) => {
  console.log(`   • ${path}`);
  console.log(`     Modified: ${modified.toISOString()}`);
});
console.log('');

report.findings.recently_modified = fileStats.slice(0, 20);

// ============================================================
// 6. BASEREPOSITORY INVESTIGATION
// ============================================================
console.log('═══ 6. BASEREPOSITORY INVESTIGATION ===\n');

const baseRepoFiles = await glob('src/**/BaseRepository*.{ts,tsx,js,jsx}', {
  cwd: process.cwd(),
  absolute: true
});

console.log(`Found ${baseRepoFiles.length} BaseRepository files:\n`);

for (const file of baseRepoFiles) {
  const shortPath = file.replace(process.cwd(), '').replace(/\\/g, '/');
  console.log(`   • ${shortPath}`);
  
  const content = await readFile(file, 'utf-8');
  
  // Check for UUID handling
  const hasUuidHandling = content.includes('uuid') || content.includes('UUID');
  const hasIdParam = content.includes('id:') || content.includes('[id]');
  
  console.log(`     UUID handling: ${hasUuidHandling ? 'Yes' : 'No'}`);
  console.log(`     ID parameters: ${hasIdParam ? 'Yes' : 'No'}`);
}
console.log('');

// ============================================================
// SAVE REPORT
// ============================================================
const reportPath = `RUNTIME_REGRESSION_INVESTIGATION_${Date.now()}.json`;
await writeFile(reportPath, JSON.stringify(report, null, 2));

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  INVESTIGATION COMPLETE                                        ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

console.log(`📄 Report saved: ${reportPath}\n`);

// ============================================================
// SUMMARY
// ============================================================
console.log('SUMMARY:\n');

const issues = [];
const findings = [];

if (!report.findings.services_schema?.has_is_active) {
  issues.push('❌ services table missing is_active column');
} else {
  findings.push('✅ services table has is_active column');
}

if (!report.findings.is_active_query?.success) {
  issues.push('❌ Query for is_active=true fails');
} else {
  findings.push('✅ Query for is_active=true works');
}

if (report.findings.repository_files.length === 0) {
  issues.push('❌ No ServicesRepository files found');
} else {
  findings.push(`✅ Found ${report.findings.repository_files.length} repository files`);
}

if (report.findings.uuid_conference_bug.length > 0) {
  issues.push(`❌ Found ${report.findings.uuid_conference_bug.length} potential UUID/slug confusion`);
} else {
  findings.push('✅ No obvious UUID/slug confusion');
}

findings.forEach(f => console.log(f));
console.log('');
issues.forEach(i => console.log(i));

console.log(`\n${issues.length} ISSUES FOUND\n`);

process.exit(issues.length > 0 ? 1 : 0);
