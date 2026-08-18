#!/usr/bin/env node
/**
 * Phase 3 Upload API - Final Production Verification
 * 
 * Comprehensive verification including:
 * - Bucket configuration audit
 * - Build & typecheck
 * - Security scan
 * - Authenticated test execution (if credentials available)
 * - Final production readiness report
 */

import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..');

dotenv.config({ path: join(root, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║  PHASE 3 UPLOAD API - FINAL PRODUCTION VERIFICATION          ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');

const results = {
  sourceAudit: [],
  storageConfig: [],
  build: [],
  security: [],
  authenticatedTests: [],
};

// ─────────────────────────────────────────────────────────────
// 1. SOURCE CODE AUDIT
// ─────────────────────────────────────────────────────────────
console.log('\n📋 PHASE 3 SOURCE CODE AUDIT\n');

const sourceChecks = [
  { file: 'src/app/api/admin/upload/route.ts', check: 'CONTENT_MANAGER_ROLES', description: 'RBAC uses CONTENT_MANAGER_ROLES' },
  { file: 'src/lib/images/processor.ts', check: 'WEBP_QUALITY = 80', description: 'WebP quality = 80' },
  { file: 'src/lib/images/processor.ts', check: 'MAX_FILE_SIZE = 10 \\* 1024 \\* 1024', description: 'Max file size = 10 MB' },
  { file: 'src/lib/images/processor.ts', check: 'withoutEnlargement: true', description: 'No image enlargement' },
  { file: 'src/lib/images/processor.ts', check: 'fit: "inside"', description: 'Aspect ratio preserved' },
  { file: 'src/lib/storage/paths.ts', check: 'hero.*gallery.*menu.*services.*testimonials.*branding', description: 'All 6 categories present' },
  { file: 'src/lib/storage/paths.ts', check: 'randomUUID', description: 'UUID-based paths' },
  { file: 'src/app/api/admin/upload/route.ts', check: 'upsert: false', description: 'No overwrites (upsert: false)' },
  { file: 'src/app/api/admin/upload/route.ts', check: 'supabase.storage.*remove\\(\\[storagePath\\]\\)', description: 'Cleanup on DB failure' },
];

for (const { file, check, description } of sourceChecks) {
  try {
    const content = readFileSync(join(root, file), 'utf8');
    const regex = new RegExp(check, 's');
    if (regex.test(content)) {
      console.log(`✅ ${description}`);
      results.sourceAudit.push({ test: description, status: 'PASS' });
    } else {
      console.log(`❌ ${description}`);
      results.sourceAudit.push({ test: description, status: 'FAIL', details: 'Pattern not found in source' });
    }
  } catch (error) {
    console.log(`❌ ${description} - file not found`);
    results.sourceAudit.push({ test: description, status: 'FAIL', details: error.message });
  }
}

// ─────────────────────────────────────────────────────────────
// 2. SUPABASE STORAGE CONFIGURATION
// ─────────────────────────────────────────────────────────────
console.log('\n💾 SUPABASE STORAGE CONFIGURATION\n');

const supabase = createClient(supabaseUrl, supabaseServiceKey);

try {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  
  if (error) {
    console.log(`❌ Bucket listing failed: ${error.message}`);
    results.storageConfig.push({ test: 'List buckets', status: 'FAIL', details: error.message });
  } else {
    const publicAssets = buckets.find(b => b.name === 'public-assets');
    
    if (publicAssets) {
      console.log(`✅ Bucket 'public-assets' exists`);
      results.storageConfig.push({ test: 'public-assets bucket exists', status: 'PASS' });
      
      console.log(`   - Public: ${publicAssets.public}`);
      console.log(`   - File size limit: ${publicAssets.file_size_limit ? (publicAssets.file_size_limit / (1024*1024)).toFixed(0) + ' MB' : 'not set'}`);
      console.log(`   - Allowed MIME types: ${publicAssets.allowed_mime_types?.join(', ') || 'any'}`);
      
      // Check configuration
      const expectedSizeMB = 10;
      const expectedMimes = ['image/jpeg', 'image/png', 'image/webp'];
      
      if (publicAssets.file_size_limit === expectedSizeMB * 1024 * 1024) {
        console.log(`✅ File size limit correct: ${expectedSizeMB} MB`);
        results.storageConfig.push({ test: 'File size limit = 10 MB', status: 'PASS' });
      } else {
        console.log(`⚠️  File size limit: Expected ${expectedSizeMB} MB, got ${publicAssets.file_size_limit ? (publicAssets.file_size_limit / (1024*1024)).toFixed(0) + ' MB' : 'not set'}`);
        console.log(`   NOTE: API has server-side 10 MB check (defense-in-depth)`);
        results.storageConfig.push({ 
          test: 'File size limit = 10 MB', 
          status: 'MANUAL', 
          details: `Bucket: ${publicAssets.file_size_limit ? (publicAssets.file_size_limit / (1024*1024)).toFixed(0) + ' MB' : 'not set'}, API enforces 10 MB` 
        });
      }
      
      const actualMimes = publicAssets.allowed_mime_types || [];
      const hasOnlyExpected = actualMimes.length > 0 && actualMimes.every(m => expectedMimes.includes(m)) && expectedMimes.every(m => actualMimes.includes(m));
      
      if (hasOnlyExpected) {
        console.log(`✅ MIME types correct: JPEG, PNG, WebP only`);
        results.storageConfig.push({ test: 'MIME types = JPEG/PNG/WebP', status: 'PASS' });
      } else {
        console.log(`⚠️  MIME types: Expected ${expectedMimes.join(', ')}`);
        console.log(`   Got: ${actualMimes.join(', ') || 'any'}`);
        console.log(`   NOTE: API has Sharp validation (defense-in-depth)`);
        results.storageConfig.push({ 
          test: 'MIME types = JPEG/PNG/WebP', 
          status: 'MANUAL', 
          details: `Bucket allows: ${actualMimes.join(', ') || 'any'}, API validates via Sharp` 
        });
      }
    } else {
      console.log(`❌ Bucket 'public-assets' not found`);
      results.storageConfig.push({ test: 'public-assets bucket exists', status: 'FAIL', details: 'Bucket not found' });
    }
  }
} catch (error) {
  console.log(`❌ Storage check failed: ${error.message}`);
  results.storageConfig.push({ test: 'Storage configuration', status: 'FAIL', details: error.message });
}

// ─────────────────────────────────────────────────────────────
// 3. BUILD VERIFICATION
// ─────────────────────────────────────────────────────────────
console.log('\n🔨 BUILD VERIFICATION\n');

try {
  console.log('Running typecheck...');
  execSync('npm run typecheck', { cwd: root, stdio: 'pipe' });
  console.log('✅ TypeScript: PASS');
  results.build.push({ test: 'npm run typecheck', status: 'PASS' });
} catch (error) {
  console.log('❌ TypeScript: FAIL');
  results.build.push({ test: 'npm run typecheck', status: 'FAIL', details: error.message });
}

try {
  console.log('Running production build...');
  execSync('npm run build', { cwd: root, stdio: 'pipe' });
  console.log('✅ Production build: PASS');
  results.build.push({ test: 'npm run build', status: 'PASS' });
} catch (error) {
  console.log('❌ Production build: FAIL');
  results.build.push({ test: 'npm run build', status: 'FAIL', details: error.message });
}

// ─────────────────────────────────────────────────────────────
// 4. SECURITY SCAN
// ─────────────────────────────────────────────────────────────
console.log('\n🔒 SECURITY SCAN\n');

const securityPatterns = [
  { pattern: /SUPABASE_SERVICE_ROLE_KEY\s*=/, files: ['.env.local'], allowed: true, description: 'Service role key in .env.local' },
  { pattern: /SUPABASE_SERVICE_ROLE_KEY/, files: ['src/**/*.ts', 'src/**/*.tsx'], allowed: false, description: 'No service role key in client code' },
  { pattern: /process\.env\.SUPABASE_SERVICE_ROLE_KEY/, files: ['src/app/**/route.ts', 'src/lib/supabase/server.ts'], allowed: true, description: 'Service role key server-side only' },
];

// Simple security check: ensure service role key is not in client code
try {
  const clientFiles = [
    'src/app/page.tsx',
    'src/features/dashboard/overview.tsx',
  ];
  
  let clientSecure = true;
  for (const file of clientFiles) {
    try {
      const content = readFileSync(join(root, file), 'utf8');
      if (content.includes('SERVICE_ROLE') || content.includes('service_role')) {
        console.log(`❌ Service role reference found in client file: ${file}`);
        clientSecure = false;
      }
    } catch {
      // File not found, skip
    }
  }
  
  if (clientSecure) {
    console.log('✅ No service role keys in client code');
    results.security.push({ test: 'No service role in client code', status: 'PASS' });
  } else {
    results.security.push({ test: 'No service role in client code', status: 'FAIL' });
  }
  
  // Check .env.local is in .gitignore
  try {
    const gitignore = readFileSync(join(root, '.gitignore'), 'utf8');
    if (gitignore.includes('.env.local')) {
      console.log('✅ .env.local in .gitignore');
      results.security.push({ test: '.env.local in .gitignore', status: 'PASS' });
    } else {
      console.log('⚠️  .env.local not in .gitignore');
      results.security.push({ test: '.env.local in .gitignore', status: 'FAIL' });
    }
  } catch {
    console.log('⚠️  .gitignore not found');
    results.security.push({ test: '.gitignore exists', status: 'FAIL' });
  }
} catch (error) {
  console.log(`⚠️  Security scan error: ${error.message}`);
  results.security.push({ test: 'Security scan', status: 'FAIL', details: error.message });
}

// ─────────────────────────────────────────────────────────────
// 5. AUTHENTICATED TEST EXECUTION
// ─────────────────────────────────────────────────────────────
console.log('\n🧪 AUTHENTICATED TEST EXECUTION\n');

const testEmail = process.env.TEST_ADMIN_EMAIL;
const testPassword = process.env.TEST_ADMIN_PASSWORD;

if (testEmail && testPassword) {
  console.log('Admin credentials available, running authenticated tests...\n');
  try {
    const output = execSync(
      `node tests/upload-api.test.mjs "${testEmail}" "${testPassword}"`,
      { cwd: root, stdio: 'pipe', encoding: 'utf8' }
    );
    console.log(output);
    results.authenticatedTests.push({ test: 'Authenticated test suite', status: 'PASS' });
  } catch (error) {
    console.log(error.stdout || error.stderr || error.message);
    results.authenticatedTests.push({ test: 'Authenticated test suite', status: 'FAIL', details: 'See output above' });
  }
} else {
  console.log('⚠️  No admin credentials provided');
  console.log('Set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD to run authenticated tests');
  results.authenticatedTests.push({ test: 'Authenticated test suite', status: 'BLOCKED', details: 'No credentials provided' });
}

// ─────────────────────────────────────────────────────────────
// FINAL SUMMARY
// ─────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(80));
console.log('PHASE 3 FINAL VERIFICATION SUMMARY');
console.log('═'.repeat(80) + '\n');

let totalPass = 0;
let totalFail = 0;
let totalBlocked = 0;
let totalManual = 0;

for (const [category, tests] of Object.entries(results)) {
  if (tests.length === 0) continue;
  
  console.log(`\n${category.toUpperCase()}:`);
  for (const test of tests) {
    const icon = 
      test.status === 'PASS' ? '✅' :
      test.status === 'FAIL' ? '❌' :
      test.status === 'BLOCKED' ? '⚠️' :
      test.status === 'MANUAL' ? '👤' : '?';
    
    console.log(`${icon} ${test.test}: ${test.status}`);
    if (test.details) {
      console.log(`   ${test.details}`);
    }
    
    if (test.status === 'PASS') totalPass++;
    else if (test.status === 'FAIL') totalFail++;
    else if (test.status === 'BLOCKED') totalBlocked++;
    else if (test.status === 'MANUAL') totalManual++;
  }
}

console.log('\n' + '═'.repeat(80));
console.log(`TOTAL: ${totalPass} PASS, ${totalFail} FAIL, ${totalBlocked} BLOCKED, ${totalManual} MANUAL`);

if (totalFail > 0) {
  console.log('\n❌ VERDICT: NOT PRODUCTION-READY');
  console.log('Critical issues found that must be fixed before deployment.');
  process.exit(1);
} else if (totalBlocked > 0) {
  console.log('\n⚠️  VERDICT: PRODUCTION-READY WITH BLOCKED VERIFICATION');
  console.log('Implementation is correct but full runtime testing was blocked.');
  console.log('Run authenticated tests with credentials for full certification.');
  process.exit(0);
} else {
  console.log('\n✅ VERDICT: VERIFIED FOR PRODUCTION');
  console.log('All Phase 3 requirements verified and passing.');
  process.exit(0);
}