#!/usr/bin/env node
/**
 * INSPECTION PHASE: Analyze actual implementation before building tests
 * 
 * Goals:
 * 1. Determine actual authorization matrix from code (not assumption)
 * 2. Identify all API routes and handlers
 * 3. Verify RLS policies
 * 4. Check Supabase environment (prod vs staging)
 * 5. Inspect media asset handling
 * 6. Identify existing test infrastructure
 * 7. Determine RBAC implementation details
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

console.log('='.repeat(80));
console.log('ZT LOUNGE - PHASE 2 IMPLEMENTATION INSPECTION');
console.log('='.repeat(80));
console.log();

// 1. Check environment
console.log('📋 ENVIRONMENT CHECK');
console.log('-'.repeat(80));
const envFile = path.join(ROOT, '.env.local');
if (fs.existsSync(envFile)) {
  const env = fs.readFileSync(envFile, 'utf-8');
  const isProduction = env.includes('prod.supabase.com');
  console.log(`✓ Environment file exists`);
  console.log(`✓ Supabase Type: ${isProduction ? 'PRODUCTION ⚠️' : 'STAGING/LOCAL ✓'}`);
} else {
  console.log(`✗ .env.local not found`);
}

// 2. Analyze auth implementation
console.log();
console.log('🔐 AUTHENTICATION IMPLEMENTATION');
console.log('-'.repeat(80));
const authServerFile = path.join(ROOT, 'src/lib/auth/server.ts');
if (fs.existsSync(authServerFile)) {
  const content = fs.readFileSync(authServerFile, 'utf-8');
  
  // Extract role constants
  const adminRolesMatch = content.match(/ADMIN_ROLES\s*=\s*\[(.*?)\]/s);
  const contentManagerMatch = content.match(/CONTENT_MANAGER_ROLES\s*=\s*\[(.*?)\]/s);
  const employeeRolesMatch = content.match(/EMPLOYEE_ROLES\s*=\s*\[(.*?)\]/s);
  
  console.log('Defined Role Groups:');
  if (adminRolesMatch) console.log(`  ADMIN_ROLES: ${adminRolesMatch[1].trim()}`);
  if (contentManagerMatch) console.log(`  CONTENT_MANAGER_ROLES: ${contentManagerMatch[1].trim()}`);
  if (employeeRolesMatch) console.log(`  EMPLOYEE_ROLES: ${employeeRolesMatch[1].trim()}`);
  
  console.log();
  console.log('Auth Functions Found:');
  if (content.includes('getServerSession')) console.log('  ✓ getServerSession');
  if (content.includes('requireAuth')) console.log('  ✓ requireAuth');
  if (content.includes('requireAdmin')) console.log('  ✓ requireAdmin');
  if (content.includes('withAdminAuth')) console.log('  ✓ withAdminAuth');
  if (content.includes('withContentManagerAuth')) console.log('  ✓ withContentManagerAuth');
}

// 3. Analyze API routes
console.log();
console.log('🛣️  API ROUTES & HANDLERS');
console.log('-'.repeat(80));
const apiAdminDir = path.join(ROOT, 'src/app/api/admin');
if (fs.existsSync(apiAdminDir)) {
  const files = fs.readdirSync(apiAdminDir);
  const routes = new Map();
  
  files.forEach(file => {
    const fullPath = path.join(apiAdminDir, file);
    if (fs.statSync(fullPath).isFile() && file.endsWith('.ts')) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      routes.set(file, {
        hasWithAdminAuth: content.includes('withAdminAuth'),
        hasWithContentManagerAuth: content.includes('withContentManagerAuth'),
        hasRequireAdmin: content.includes('requireAdmin'),
        hasMethods: {
          GET: content.includes('export const GET'),
          POST: content.includes('export const POST'),
          PATCH: content.includes('export const PATCH'),
          DELETE: content.includes('export const DELETE'),
        }
      });
    }
  });
  
  console.log('Main Route Files:');
  routes.forEach((config, file) => {
    console.log(`  📄 ${file}`);
    Object.entries(config.hasMethods).forEach(([method, exists]) => {
      if (exists) console.log(`     ✓ ${method}`);
    });
    if (config.hasWithAdminAuth) console.log(`     🔒 withAdminAuth`);
    if (config.hasWithContentManagerAuth) console.log(`     🔒 withContentManagerAuth`);
  });
}

// 4. Analyze resource config
console.log();
console.log('📦 RESOURCES CONFIGURATION');
console.log('-'.repeat(80));
const resourceConfigFile = path.join(ROOT, 'src/lib/resource-config.ts');
if (fs.existsSync(resourceConfigFile)) {
  const content = fs.readFileSync(resourceConfigFile, 'utf-8');
  const resourceMatches = content.match(/\s+"([^"]+)":\s*{/g) || [];
  const resources = resourceMatches.map(m => m.match(/"([^"]+)"/)[1]);
  
  console.log(`Found ${resources.length} configured resources:`);
  resources.forEach(r => {
    const isCMSRelated = ['menu-items', 'services', 'gallery', 'hero-slides', 'promotions'].includes(r);
    console.log(`  ${isCMSRelated ? '✓' : '  '} ${r}`);
  });
}

// 5. Check media assets implementation
console.log();
console.log('🖼️  MEDIA ASSETS IMPLEMENTATION');
console.log('-'.repeat(80));
const mediaResolverFile = path.join(ROOT, 'src/lib/media/resolver.ts');
const mediaSelectionFile = path.join(ROOT, 'src/lib/media/selection.ts');
const uploadRouteFile = path.join(ROOT, 'src/app/api/admin/upload/route.ts');

if (fs.existsSync(mediaResolverFile)) {
  console.log('✓ Media resolver exists');
}
if (fs.existsSync(mediaSelectionFile)) {
  console.log('✓ Media selection helper exists');
}
if (fs.existsSync(uploadRouteFile)) {
  const content = fs.readFileSync(uploadRouteFile, 'utf-8');
  console.log('✓ Upload route exists');
  if (content.includes('FormData')) console.log('  ✓ Handles FormData');
  if (content.includes('media_assets')) console.log('  ✓ Creates media_assets records');
}

// 6. Check RLS policies
console.log();
console.log('🔐 RLS POLICIES');
console.log('-'.repeat(80));
const migrationDir = path.join(ROOT, 'supabase/migrations');
if (fs.existsSync(migrationDir)) {
  const files = fs.readdirSync(migrationDir).sort();
  let rlsCount = 0;
  files.forEach(file => {
    if (file.endsWith('.sql')) {
      const content = fs.readFileSync(path.join(migrationDir, file), 'utf-8');
      if (content.includes('CREATE POLICY') || content.includes('ALTER POLICY')) {
        rlsCount++;
      }
    }
  });
  console.log(`Found ${rlsCount} migration files with RLS policies`);
}

// 7. Check existing tests
console.log();
console.log('🧪 EXISTING TEST INFRASTRUCTURE');
console.log('-'.repeat(80));
const testsDir = path.join(ROOT, 'tests');
if (fs.existsSync(testsDir)) {
  const testFiles = [];
  
  const walkDir = (dir) => {
    fs.readdirSync(dir).forEach(file => {
      const fullPath = path.join(dir, file);
      if (fs.statSync(fullPath).isDirectory()) {
        walkDir(fullPath);
      } else if (file.endsWith('.spec.ts') || file.endsWith('.spec.js')) {
        testFiles.push(path.relative(testsDir, fullPath));
      }
    });
  };
  
  walkDir(testsDir);
  if (testFiles.length === 0) {
    console.log('ℹ️  No existing test specs found');
  } else {
    console.log(`Found ${testFiles.length} test file(s):`);
    testFiles.forEach(f => console.log(`  ${f}`));
  }
}

// 8. Check dynamic CMS routes
console.log();
console.log('🎯 DYNAMIC CMS ROUTES');
console.log('-'.repeat(80));
const dynamicRouteFile = path.join(ROOT, 'src/app/api/admin/[resource]/route.ts');
if (fs.existsSync(dynamicRouteFile)) {
  const content = fs.readFileSync(dynamicRouteFile, 'utf-8');
  console.log('✓ Dynamic [resource] route exists');
  console.log('  This handles generic CRUD for configurable resources');
  
  // Check what it does
  if (content.includes('GET')) console.log('  ✓ GET (list/retrieve)');
  if (content.includes('POST')) console.log('  ✓ POST (create)');
  if (content.includes('PATCH')) console.log('  ✓ PATCH (update)');
  if (content.includes('DELETE')) console.log('  ✓ DELETE (remove)');
  
  if (content.includes('RESOURCE_CONFIG')) {
    console.log('  ✓ Uses RESOURCE_CONFIG for routing');
  }
}

// 9. Summary
console.log();
console.log('='.repeat(80));
console.log('PHASE 2 READINESS CHECKLIST');
console.log('='.repeat(80));
console.log();
console.log('Before implementing Phase 2 tests, verify:');
console.log();
console.log('[ ] Supabase environment is STAGING (not production)');
console.log('[ ] Test user accounts created:');
console.log('    - super_admin@example.com with super_admin role');
console.log('    - admin@example.com with admin role');
console.log('    - manager@example.com with manager role (if applicable)');
console.log('[ ] Test credentials available in .env.local');
console.log('[ ] Application is running (npm run dev)');
console.log('[ ] Database is accessible and populated with test data');
console.log();
console.log('Next: scripts/phase2-runtime-acceptance.mjs');
console.log('='.repeat(80));
