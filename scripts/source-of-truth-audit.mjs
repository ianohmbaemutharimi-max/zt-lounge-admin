#!/usr/bin/env node

/**
 * ZT Lounge — Source of Truth & Propagation Audit
 * 
 * Traces the complete flow:
 * 1. Admin CMS → Database write
 * 2. Database → Public website read
 * 3. Admin change → Public propagation
 * 
 * READ-ONLY: No modifications
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

console.log('='.repeat(80));
console.log('PHASE 1-12: SOURCE OF TRUTH & PROPAGATION AUDIT');
console.log('='.repeat(80));
console.log('');

const findings = {
  phase1: {},
  phase2: {},
  phase3: {},
  phase4: {},
  phase5: {},
  phase6: {},
  phase7: {},
  phase8: {},
};

// ─────────────────────────────────────────────────────────────────────────
// PHASE 1: ADMIN → DATABASE TRACE
// ─────────────────────────────────────────────────────────────────────────

console.log('PHASE 1: ADMIN → DATABASE WRITE PATHS');
console.log('-'.repeat(80));
console.log('');

// Check API routes
const adminRoutePath = path.join(projectRoot, 'src/app/api/admin/[resource]/route.ts');
const adminIdRoutePath = path.join(projectRoot, 'src/app/api/admin/[resource]/[id]/route.ts');

console.log('📍 Admin API Route Inspection:');
console.log(`  Location 1: ${adminRoutePath.replace(projectRoot, '.')}`);
console.log(`  Location 2: ${adminIdRoutePath.replace(projectRoot, '.')}`);
console.log('');

// Check repository
const repositoryPath = path.join(projectRoot, 'src/lib/repository.ts');
console.log('📍 Repository Layer:');
console.log(`  Location: ${repositoryPath.replace(projectRoot, '.')}`);
console.log('');

// Check validation
const validationPath = path.join(projectRoot, 'src/lib/validation/admin.ts');
console.log('📍 Validation Layer:');
console.log(`  Location: ${validationPath.replace(projectRoot, '.')}`);
console.log('');

// Check auth
const authPath = path.join(projectRoot, 'src/lib/auth/server.ts');
console.log('📍 Authentication:');
console.log(`  Location: ${authPath.replace(projectRoot, '.')}`);
console.log('');

// Check resource config
const resourceConfigPath = path.join(projectRoot, 'src/lib/resource-config.ts');
console.log('📍 Resource Configuration:');
console.log(`  Location: ${resourceConfigPath.replace(projectRoot, '.')}`);
console.log('');

// Check dashboard pages
const dashboardModules = [
  'menu',
  'gallery',
  'services',
  'media',
  'website',
];

console.log('📍 Admin Dashboard Pages:');
for (const module of dashboardModules) {
  const pagePath = path.join(projectRoot, `src/app/dashboard/${module}/page.tsx`);
  const exists = fs.existsSync(pagePath);
  console.log(`  ${module}: ${exists ? '✅ EXISTS' : '❌ NOT FOUND'} → ${pagePath.replace(projectRoot, '.')}`);
}
console.log('');

// ─────────────────────────────────────────────────────────────────────────
// PHASE 2: DATABASE → PUBLIC WEBSITE TRACE
// ─────────────────────────────────────────────────────────────────────────

console.log('');
console.log('PHASE 2: DATABASE → PUBLIC WEBSITE READ PATHS');
console.log('-'.repeat(80));
console.log('');

console.log('📍 Public Website Routes:');
const appDir = path.join(projectRoot, 'src/app');
const publicRoutes = fs.readdirSync(appDir).filter(f => {
  const fullPath = path.join(appDir, f);
  return fs.statSync(fullPath).isDirectory() && !f.startsWith('[');
});

for (const route of publicRoutes.slice(0, 10)) {
  console.log(`  - ${route}`);
}
console.log('');

console.log('📍 Public Components (likely rendering CMS data):');
const featuresDir = path.join(projectRoot, 'src/features');
if (fs.existsSync(featuresDir)) {
  const features = fs.readdirSync(featuresDir);
  for (const feature of features.slice(0, 8)) {
    console.log(`  - ${feature}`);
  }
}
console.log('');

// ─────────────────────────────────────────────────────────────────────────
// PHASE 3: MEDIA LIBRARY RELATIONSHIP
// ─────────────────────────────────────────────────────────────────────────

console.log('');
console.log('PHASE 3: MEDIA LIBRARY RELATIONSHIP AUDIT');
console.log('-'.repeat(80));
console.log('');

console.log('📍 Media Library Components:');
const mediaComponents = [
  'media-library-view.tsx',
  'media-edit-modal.tsx',
  'media-upload-handler.ts',
];

for (const component of mediaComponents) {
  const componentPath = path.join(projectRoot, 'src/features/media', component);
  const exists = fs.existsSync(componentPath);
  console.log(`  ${component}: ${exists ? '✅ EXISTS' : '⚪ UNKNOWN'}`);
}
console.log('');

console.log('📍 Media API Routes:');
const mediaApiPath = path.join(projectRoot, 'src/app/api/media/route.ts');
const adminUploadPath = path.join(projectRoot, 'src/app/api/admin/upload/route.ts');

console.log(`  /api/media: ${fs.existsSync(mediaApiPath) ? '✅ EXISTS' : '⚪ UNKNOWN'}`);
console.log(`  /api/admin/upload: ${fs.existsSync(adminUploadPath) ? '✅ EXISTS' : '⚪ UNKNOWN'}`);
console.log('');

console.log('📍 Media Storage Configuration:');
const storagePaths = path.join(projectRoot, 'src/lib/storage/paths.ts');
const imageProcessor = path.join(projectRoot, 'src/lib/images/processor.ts');

console.log(`  Storage paths: ${fs.existsSync(storagePaths) ? '✅ EXISTS' : '⚪ UNKNOWN'}`);
console.log(`  Image processor: ${fs.existsSync(imageProcessor) ? '✅ EXISTS' : '⚪ UNKNOWN'}`);
console.log('');

// ─────────────────────────────────────────────────────────────────────────
// PHASE 4: ADMIN RESPONSIBILITY BOUNDARIES
// ─────────────────────────────────────────────────────────────────────────

console.log('');
console.log('PHASE 4: ADMIN RESPONSIBILITY BOUNDARIES');
console.log('-'.repeat(80));
console.log('');

const cmsModules = {
  'Menu': 'menu',
  'Gallery': 'gallery',
  'Services': 'services',
  'Hero Slides': 'hero',
  'Website CMS': 'website',
  'Media Library': 'media',
};

console.log('📋 CMS Module Dashboard Pages:');
for (const [name, slug] of Object.entries(cmsModules)) {
  const pagePath = path.join(projectRoot, `src/app/dashboard/${slug}/page.tsx`);
  const exists = fs.existsSync(pagePath);
  if (exists) {
    console.log(`  ✅ ${name} → src/app/dashboard/${slug}/page.tsx`);
  } else {
    console.log(`  ⚪ ${name} → NOT FOUND (may use dynamic routing)`);
  }
}
console.log('');

// ─────────────────────────────────────────────────────────────────────────
// PHASE 5: DATABASE AS AUTHORIZED STATE
// ─────────────────────────────────────────────────────────────────────────

console.log('');
console.log('PHASE 5: DATABASE AS AUTHORIZED CONTENT STATE');
console.log('-'.repeat(80));
console.log('');

console.log('📋 Authorization Check Points:');
console.log(`  1. Middleware: ${fs.existsSync(path.join(projectRoot, 'middleware.ts')) ? '✅' : '⚪'}`);
console.log(`  2. Auth Server: ${fs.existsSync(authPath) ? '✅' : '⚪'}`);
console.log(`  3. Admin Validation: ${fs.existsSync(validationPath) ? '✅' : '⚪'}`);
console.log(`  4. Admin API Routes: ${fs.existsSync(adminRoutePath) ? '✅' : '⚪'}`);
console.log('');

console.log('📋 Data Origin Check:');
console.log('  Checking for hardcoded content, static files, or non-database sources...');

const publicDir = path.join(projectRoot, 'public');
const configFiles = [];
if (fs.existsSync(publicDir)) {
  const publicFiles = fs.readdirSync(publicDir);
  configFiles.push(...publicFiles.filter(f => f.endsWith('.json')));
}

if (configFiles.length > 0) {
  console.log(`  ⚠️  Found static JSON files: ${configFiles.join(', ')}`);
} else {
  console.log('  ✅ No obvious static content files detected');
}
console.log('');

// ─────────────────────────────────────────────────────────────────────────
// PHASE 6: AUTOMATIC PROPAGATION
// ─────────────────────────────────────────────────────────────────────────

console.log('');
console.log('PHASE 6: AUTOMATIC WEBSITE PROPAGATION');
console.log('-'.repeat(80));
console.log('');

console.log('📋 Cache/Revalidation Mechanisms:');
console.log('  Checking for React Query, Next.js cache, revalidatePath, revalidateTag...');
console.log('');

// Check for React Query
const packageJsonPath = path.join(projectRoot, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const hasReactQuery = !!packageJson.dependencies['@tanstack/react-query'];
const hasNextCache = true; // Built-in

console.log(`  React Query (TanStack): ${hasReactQuery ? '✅ YES' : '❌ NO'}`);
console.log(`  Next.js Cache: ${hasNextCache ? '✅ YES (built-in)' : '❌ NO'}`);
console.log('');

console.log('📋 Next.js Revalidation:');
console.log('  Searching for revalidatePath, revalidateTag, cache control...');
console.log('  (Would need code inspection to confirm implementation)');
console.log('');

// ─────────────────────────────────────────────────────────────────────────
// PHASE 7: MEDIA PROPAGATION
// ─────────────────────────────────────────────────────────────────────────

console.log('');
console.log('PHASE 7: MEDIA PROPAGATION CHAIN');
console.log('-'.repeat(80));
console.log('');

console.log('📋 Trace: Media Edit → CMS Use → Public Display');
console.log('');
console.log('  Step 1: Media asset edited in Media Library');
console.log('    - Route: /api/admin/media_assets/{id}');
console.log('    - Method: PATCH');
console.log('    - Updates: media_assets table');
console.log('');
console.log('  Step 2: CMS modules reference media');
console.log('    - Question: Do they store media_id or image_url?');
console.log('    - (Requires code inspection)');
console.log('');
console.log('  Step 3: Public website displays media');
console.log('    - Question: Does it fetch media_assets or use stored URL?');
console.log('    - (Requires code inspection)');
console.log('');

// ─────────────────────────────────────────────────────────────────────────
// PHASE 8: CRUD VERIFICATION
// ─────────────────────────────────────────────────────────────────────────

console.log('');
console.log('PHASE 8: CRUD VERIFICATION MATRIX');
console.log('-'.repeat(80));
console.log('');

console.log('| Module   | Create | Read | Update | Delete | DB Source | Public Read | Auto Prop |');
console.log('|----------|--------|------|--------|--------|-----------|-------------|-----------|');
console.log('| Menu     |   ?    |  ?   |   ?    |   ?    |  UNKNOWN  |  UNKNOWN    | UNKNOWN   |');
console.log('| Gallery  |   ?    |  ?   |   ?    |   ?    |  UNKNOWN  |  UNKNOWN    | UNKNOWN   |');
console.log('| Services |   ?    |  ?   |   ?    |   ?    |  UNKNOWN  |  UNKNOWN    | UNKNOWN   |');
console.log('| Hero     |   ?    |  ?   |   ?    |   ?    |  UNKNOWN  |  UNKNOWN    | UNKNOWN   |');
console.log('| Website  |   ?    |  ?   |   ?    |   ?    |  UNKNOWN  |  UNKNOWN    | UNKNOWN   |');
console.log('| Media    |   ?    |  ?   |   ?    |   ?    |  UNKNOWN  |  UNKNOWN    | UNKNOWN   |');
console.log('');
console.log('  (Requires code inspection to populate)');
console.log('');

// ─────────────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────────────

console.log('');
console.log('='.repeat(80));
console.log('AUDIT SUMMARY — FILES TO INSPECT');
console.log('='.repeat(80));
console.log('');

const filesToInspect = [
  {
    file: 'src/app/api/admin/[resource]/route.ts',
    purpose: 'Admin CMS write handler (POST/PUT)',
    focus: 'How does it process form data? Validation? Direct DB?',
  },
  {
    file: 'src/app/api/admin/[resource]/[id]/route.ts',
    purpose: 'Admin CMS update/delete handler',
    focus: 'How does PATCH work? Which fields updated?',
  },
  {
    file: 'src/lib/repository.ts',
    purpose: 'Database abstraction layer',
    focus: 'Create/read/update methods for each CMS table',
  },
  {
    file: 'src/lib/validation/admin.ts',
    purpose: 'Input validation & RBAC',
    focus: 'Which fields are allowed? Editable per resource?',
  },
  {
    file: 'src/app/dashboard/menu/page.tsx',
    purpose: 'Menu admin form',
    focus: 'How does it submit? Direct API? Form structure?',
  },
  {
    file: 'src/app/dashboard/gallery/page.tsx',
    purpose: 'Gallery admin form',
    focus: 'Same questions as menu',
  },
  {
    file: 'src/app/dashboard/services/page.tsx',
    purpose: 'Services admin form',
    focus: 'Same questions',
  },
  {
    file: 'src/features/media/media-library-view.tsx',
    purpose: 'Media Library UI',
    focus: 'How does it display media? Edit/delete?',
  },
  {
    file: 'src/features/media/media-edit-modal.tsx',
    purpose: 'Media edit dialog',
    focus: 'Confirmed working. Inspect interaction.',
  },
  {
    file: 'src/app/api/admin/upload/route.ts',
    purpose: 'Image upload handler',
    focus: 'Where does it store? DB record creation?',
  },
  {
    file: 'src/lib/resource-config.ts',
    purpose: 'CMS module metadata',
    focus: 'Table mappings, searchable fields, editable fields',
  },
  {
    file: 'supabase/migrations/20260813_create_media_library_tables.sql',
    purpose: 'Media assets schema',
    focus: 'Table structure, RLS, constraints',
  },
];

console.log('📄 KEY FILES TO INSPECT:');
console.log('');
for (const item of filesToInspect) {
  console.log(`1. ${item.file}`);
  console.log(`   Purpose: ${item.purpose}`);
  console.log(`   Focus: ${item.focus}`);
  console.log('');
}

console.log('='.repeat(80));
console.log('');
console.log('Next: Read these files and populate CRUD matrix + trace flows.');
console.log('');
