#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const BASE = 'd:\\zt lounge\\zt-lounge-demo\\zt-lounge-admin';

console.log('='.repeat(80));
console.log('PHASE 3 — PROMOTIONS DATA MODEL & END-TO-END AUDIT');
console.log('='.repeat(80));

// PHASE 3.1 — DISCOVER ALL PROMOTION IMPLEMENTATIONS
console.log('\n📋 PHASE 3.1 — FILE INVENTORY\n');

const findings = {
  database: [],
  types: [],
  repository: [],
  api: [],
  admin: [],
  public: [],
  migrations: [],
  config: [],
};

// Search for all promotion-related files
try {
  const result = execSync(`findstr /R /S "promotion" "${BASE}\\src" 2>nul || echo "No matches"`, { encoding: 'utf8' });
  console.log('✓ Search for "promotion" keyword completed');
} catch (e) {
  console.log('Note: findstr not available or no matches');
}

// Check for specific files
const filesToCheck = [
  { path: `${BASE}\\src\\types\\promotions.ts`, category: 'types' },
  { path: `${BASE}\\src\\features\\promotions\\promotions-view.tsx`, category: 'admin' },
  { path: `${BASE}\\src\\app\\api\\admin\\promotions\\route.ts`, category: 'api' },
  { path: `${BASE}\\src\\app\\dashboard\\promotions\\page.tsx`, category: 'admin' },
  { path: `${BASE}\\src\\app\\promotions\\page.tsx`, category: 'public' },
  { path: `${BASE}\\supabase\\migrations`, category: 'migrations' },
];

console.log('\n📁 FILE INVENTORY:\n');

filesToCheck.forEach(({ path: filePath, category }) => {
  const exists = fs.existsSync(filePath);
  const status = exists ? '✓' : '✗';
  console.log(`${status} ${category.toUpperCase()}: ${filePath}`);
  if (exists) {
    findings[category].push(filePath);
  }
});

// Check for migrations related to promotions
console.log('\n📜 MIGRATIONS SEARCH:\n');

const migrationsDir = `${BASE}\\supabase\\migrations`;
if (fs.existsSync(migrationsDir)) {
  const files = fs.readdirSync(migrationsDir);
  files.forEach(file => {
    if (file.includes('promotion') || file.includes('promo')) {
      console.log(`✓ Found: ${file}`);
      findings.migrations.push(file);
    }
  });
  if (findings.migrations.length === 0) {
    console.log('✗ No migration files with "promotion" in name');
  }
}

// PHASE 3.1c — READ PROMOTIONS-VIEW.TSX
console.log('\n📄 PROMOTIONS-VIEW.TSX ANALYSIS:\n');

const promosViewPath = `${BASE}\\src\\features\\promotions\\promotions-view.tsx`;
if (fs.existsSync(promosViewPath)) {
  const content = fs.readFileSync(promosViewPath, 'utf8');
  
  // Extract database column names from comments
  const columnMatch = content.match(/Live promotions columns:[\s\S]*?- updated_at/);
  if (columnMatch) {
    console.log('✓ Database columns referenced in code:');
    const columns = columnMatch[0].split('\n').filter(line => line.includes('- '));
    columns.forEach(col => console.log(`  ${col.trim()}`));
  }

  // Extract form fields
  const formFields = content.match(/register\("(\w+)"\)/g) || [];
  console.log('\n✓ Form fields used:');
  formFields.forEach(field => console.log(`  ${field}`));

  // Check for API calls
  if (content.includes('api.list("promotions")')) {
    console.log('\n✓ API: Uses generic api.list("promotions")');
  }
  if (content.includes('api.create("promotions"')) {
    console.log('✓ API: Uses generic api.create("promotions")');
  }
  if (content.includes('api.update("promotions"')) {
    console.log('✓ API: Uses generic api.update("promotions")');
  }
  if (content.includes('api.remove("promotions"')) {
    console.log('✓ API: Uses generic api.remove("promotions")');
  }
}

// PHASE 3.4 — REPOSITORY AUDIT
console.log('\n📚 REPOSITORY AUDIT:\n');

const repositoryPath = `${BASE}\\src\\lib\\repository.ts`;
if (fs.existsSync(repositoryPath)) {
  const content = fs.readFileSync(repositoryPath, 'utf8');
  
  if (content.includes('promotions')) {
    console.log('✓ "promotions" mentioned in repository.ts');
    
    // Check for allowlist
    if (content.includes('RESPONSE_ALLOWLISTS')) {
      const allowlistMatch = content.match(/promotions:\s*\{[\s\S]*?\}/);
      if (allowlistMatch) {
        console.log('✓ Response allowlist found for promotions');
        console.log('  ' + allowlistMatch[0].substring(0, 100) + '...');
      }
    }
  } else {
    console.log('✗ "promotions" NOT mentioned in repository.ts');
  }
}

// PHASE 3.5 — GENERIC API AUDIT
console.log('\n🔌 GENERIC API ROUTE AUDIT:\n');

const apiRoute = `${BASE}\\src\\app\\api\\admin\\[resource]\\route.ts`;
if (fs.existsSync(apiRoute)) {
  const content = fs.readFileSync(apiRoute, 'utf8');
  console.log('✓ Generic admin API route exists');
  console.log('  This handles: GET, POST, PATCH, DELETE for all resources');
  
  // Check for validation
  if (content.includes('validate') || content.includes('WRITABLE_FIELDS')) {
    console.log('✓ Generic API includes validation');
  }
}

// Check for resource config
const resourceConfigPath = `${BASE}\\src\\lib\\resource-config.ts`;
if (fs.existsSync(resourceConfigPath)) {
  const content = fs.readFileSync(resourceConfigPath, 'utf8');
  if (content.includes('promotions')) {
    console.log('✓ "promotions" in resource-config.ts');
  }
}

// PHASE 3.3 — TYPE SAFETY
console.log('\n🔍 TYPE SAFETY AUDIT:\n');

const typesPath = `${BASE}\\src\\types`;
if (fs.existsSync(typesPath)) {
  const files = fs.readdirSync(typesPath);
  if (files.includes('promotions.ts')) {
    console.log('✓ src/types/promotions.ts exists');
    const content = fs.readFileSync(path.join(typesPath, 'promotions.ts'), 'utf8');
    console.log('  Fields:', content.match(/^\s*\w+[\?]?:/gm)?.slice(0, 10).map(f => f.trim()) || []);
  } else {
    console.log('✗ src/types/promotions.ts NOT found');
  }
}

// PHASE 3.8 — PUBLIC PROMOTIONS PAGE
console.log('\n🌐 PUBLIC PROMOTIONS PAGE AUDIT:\n');

const publicPromosPage = `${BASE}\\src\\app\\promotions\\page.tsx`;
if (fs.existsSync(publicPromosPage)) {
  console.log('✓ Public promotions page exists: src/app/promotions/page.tsx');
  const content = fs.readFileSync(publicPromosPage, 'utf8');
  
  if (content.includes('const promotions = [') || content.includes('const promotions: Array')) {
    console.log('⚠️  WARNING: May contain hardcoded promotions data');
  }
  
  if (content.includes('api.') || content.includes('fetch')) {
    console.log('✓ Appears to fetch data dynamically');
  }
} else {
  console.log('✗ Public promotions page NOT found');
}

// PHASE 3.9 — HOMEPAGE PROMOTIONS
console.log('\n🏠 HOMEPAGE AUDIT:\n');

const homepagePath = `${BASE}\\src\\app\\page.tsx`;
if (fs.existsSync(homepagePath)) {
  const content = fs.readFileSync(homepagePath, 'utf8');
  if (content.includes('promotion')) {
    console.log('✓ Homepage references "promotion"');
  } else {
    console.log('⚠️  Homepage does not mention promotions');
  }
}

// SUMMARY
console.log('\n' + '='.repeat(80));
console.log('SUMMARY');
console.log('='.repeat(80));

const totalFiles = Object.values(findings).flat().length;
console.log(`\n📊 Total relevant files found: ${totalFiles}`);
console.log(`\n✓ Admin UI: ${findings.admin.length} file(s)`);
console.log(`✓ API: ${findings.api.length} file(s)`);
console.log(`✓ Types: ${findings.types.length} file(s)`);
console.log(`✓ Migrations: ${findings.migrations.length} file(s)`);

if (totalFiles < 5) {
  console.log('\n⚠️  CRITICAL: Promotions implementation appears incomplete');
  console.log('   - UI component exists but infrastructure may be missing');
} else {
  console.log('\n✓ Baseline infrastructure exists');
}

console.log('\n' + '='.repeat(80));
console.log('NEXT: Verify live database schema via Supabase SQL');
console.log('='.repeat(80));

// Write summary to JSON
const summary = {
  timestamp: new Date().toISOString(),
  phase: '3.1',
  totalFiles,
  findings,
  status: totalFiles < 5 ? 'INCOMPLETE' : 'BASELINE_EXISTS'
};

fs.writeFileSync(
  `${BASE}\\PHASE3_PROMOTIONS_DISCOVERY.json`,
  JSON.stringify(summary, null, 2)
);

console.log('\n✓ Audit results saved to PHASE3_PROMOTIONS_DISCOVERY.json');
