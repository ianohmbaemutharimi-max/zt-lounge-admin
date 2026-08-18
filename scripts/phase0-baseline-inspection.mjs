#!/usr/bin/env node

/**
 * PHASE 0 — BASELINE INSPECTION
 * 
 * Establish the real current state before modifying anything.
 * 
 * Inspect:
 * - Database schema (media_id, foreign keys, indexes, RLS)
 * - Repository layer (allowlists)
 * - API routes (collection endpoints)
 * - Existing promotions implementation
 * - Collection limits (slice, limit, take)
 * - Cache strategy (revalidateTag, revalidatePath)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

const baseline = {
  timestamp: new Date().toISOString(),
  phase: 'PHASE 0 — BASELINE INSPECTION',
  sections: {
    database: {},
    repository: {},
    apis: {},
    promotions: {},
    collectionLimits: [],
    cache: {},
    mediaLibrary: {},
    rls: {}
  }
};

console.log('📋 PHASE 0 — BASELINE INSPECTION\n');

// 1. Check migration status
console.log('🗄️  Inspecting migrations...');
const migrationFile = path.join(projectRoot, 'supabase', 'migrations', '20260817_add_media_id_to_cms_tables.sql');
const migrationExists = fs.existsSync(migrationFile);
let migrationContent = '';

if (migrationExists) {
  migrationContent = fs.readFileSync(migrationFile, 'utf8');
  baseline.sections.database.migrationFile = '20260817_add_media_id_to_cms_tables.sql';
  baseline.sections.database.migrationExists = true;
  baseline.sections.database.migrationActions = {
    addsMenuItemsMediaId: migrationContent.includes('ALTER TABLE menu_items ADD COLUMN media_id UUID'),
    addsServicesMediaId: migrationContent.includes('ALTER TABLE services ADD COLUMN media_id UUID'),
    addsGalleryMediaId: migrationContent.includes('ALTER TABLE gallery ADD COLUMN media_id UUID'),
    addsHeroSlidesMediaId: migrationContent.includes('ALTER TABLE hero_slides ADD COLUMN media_id UUID'),
    hasForeignKeys: migrationContent.includes('FOREIGN KEY'),
    hasIndexes: migrationContent.includes('CREATE INDEX')
  };
  console.log('✅ Migration file exists');
  console.log('   - menu_items.media_id:', baseline.sections.database.migrationActions.addsMenuItemsMediaId);
  console.log('   - services.media_id:', baseline.sections.database.migrationActions.addsServicesMediaId);
  console.log('   - gallery.media_id:', baseline.sections.database.migrationActions.addsGalleryMediaId);
  console.log('   - hero_slides.media_id:', baseline.sections.database.migrationActions.addsHeroSlidesMediaId);
} else {
  baseline.sections.database.migrationExists = false;
  console.log('❌ Migration file NOT found');
}

// 2. Inspect repository layer
console.log('\n📚 Inspecting repository layer...');
const repoFile = path.join(projectRoot, 'src', 'lib', 'repository.ts');
if (fs.existsSync(repoFile)) {
  const repoContent = fs.readFileSync(repoFile, 'utf8');
  
  baseline.sections.repository.fileExists = true;
  baseline.sections.repository.hasWritableFields = repoContent.includes('WRITABLE_FIELDS');
  baseline.sections.repository.hasResponseAllowlists = repoContent.includes('RESPONSE_ALLOWLISTS');
  
  // Extract table names
  const tableMatches = repoContent.match(/WRITABLE_FIELDS\.(\w+)/g) || [];
  baseline.sections.repository.writableTables = [...new Set(tableMatches.map(m => m.replace('WRITABLE_FIELDS.', '')))];
  
  // Check for promotion table
  baseline.sections.repository.hasPromotions = repoContent.includes('promotion');
  
  // Check media_id coverage
  const mediaIdCount = (repoContent.match(/media_id/g) || []).length;
  baseline.sections.repository.mediaIdReferences = mediaIdCount;
  
  console.log('✅ Repository found');
  console.log(`   - Writable tables: ${baseline.sections.repository.writableTables.length}`);
  console.log(`   - media_id references: ${mediaIdCount}`);
  console.log(`   - Promotion support: ${baseline.sections.repository.hasPromotions}`);
} else {
  baseline.sections.repository.fileExists = false;
  console.log('❌ Repository not found');
}

// 3. Inspect API routes
console.log('\n🌐 Inspecting API routes...');
const genericRoute = path.join(projectRoot, 'src', 'app', 'api', 'admin', '[resource]', 'route.ts');
const idRoute = path.join(projectRoot, 'src', 'app', 'api', 'admin', '[resource]', '[id]', 'route.ts');

baseline.sections.apis.genericRoute = fs.existsSync(genericRoute);
baseline.sections.apis.idRoute = fs.existsSync(idRoute);

if (baseline.sections.apis.genericRoute) {
  const routeContent = fs.readFileSync(genericRoute, 'utf8');
  baseline.sections.apis.genericSupportsPost = routeContent.includes('export async function POST');
  baseline.sections.apis.genericSupportsGet = routeContent.includes('export async function GET');
  console.log('✅ Generic route [resource]/route.ts exists');
  console.log(`   - GET: ${baseline.sections.apis.genericSupportsGet}`);
  console.log(`   - POST: ${baseline.sections.apis.genericSupportsPost}`);
}

if (baseline.sections.apis.idRoute) {
  const routeContent = fs.readFileSync(idRoute, 'utf8');
  baseline.sections.apis.idSupportsGet = routeContent.includes('export async function GET');
  baseline.sections.apis.idSupportsDelete = routeContent.includes('export async function DELETE');
  baseline.sections.apis.idSupportsPatch = routeContent.includes('export async function PATCH');
  baseline.sections.apis.hasRevalidation = routeContent.includes('revalidate');
  console.log('✅ ID route [resource]/[id]/route.ts exists');
  console.log(`   - GET: ${baseline.sections.apis.idSupportsGet}`);
  console.log(`   - PATCH: ${baseline.sections.apis.idSupportsPatch}`);
  console.log(`   - DELETE: ${baseline.sections.apis.idSupportsDelete}`);
  console.log(`   - Revalidation: ${baseline.sections.apis.hasRevalidation}`);
}

// 4. Inspect promotions
console.log('\n🎉 Inspecting promotions...');
const promotionsDir = path.join(projectRoot, 'src', 'features', 'promotions');
const promotionsTypesFile = path.join(projectRoot, 'src', 'types', 'promotions.ts');

baseline.sections.promotions.directoryExists = fs.existsSync(promotionsDir);
baseline.sections.promotions.typesFileExists = fs.existsSync(promotionsTypesFile);

if (baseline.sections.promotions.directoryExists) {
  const promotionFiles = fs.readdirSync(promotionsDir);
  baseline.sections.promotions.files = promotionFiles;
  console.log('✅ Promotions directory exists');
  console.log(`   - Files: ${promotionFiles.join(', ')}`);
} else {
  console.log('⚠️  Promotions directory not found');
}

if (baseline.sections.promotions.typesFileExists) {
  console.log('✅ Promotions types file exists');
} else {
  console.log('⚠️  Promotions types file NOT found');
}

// 5. Search for collection limits
console.log('\n📊 Searching for collection limits...');
function searchInDir(dir, pattern, fileFilter = /\.(tsx?|mjs)$/) {
  const matches = [];
  const walk = (current) => {
    try {
      fs.readdirSync(current).forEach(file => {
        const full = path.join(current, file);
        const stat = fs.statSync(full);
        if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
          walk(full);
        } else if (stat.isFile() && fileFilter.test(file)) {
          try {
            const content = fs.readFileSync(full, 'utf8');
            if (pattern.test(content)) {
              matches.push({
                file: full.replace(projectRoot, '').replace(/\\/g, '/'),
                occurrences: (content.match(pattern) || []).length
              });
            }
          } catch (e) {
            // ignore
          }
        }
      });
    } catch (e) {
      // ignore
    }
  };
  walk(dir);
  return matches;
}

const sliceMatches = searchInDir(path.join(projectRoot, 'src'), /\.slice\(/);
const limitMatches = searchInDir(path.join(projectRoot, 'src'), /\.limit\(/);
const takeMatches = searchInDir(path.join(projectRoot, 'src'), /\.take\(/);

baseline.sections.collectionLimits = {
  slice: sliceMatches,
  limit: limitMatches,
  take: takeMatches,
  totalOccurrences: sliceMatches.length + limitMatches.length + takeMatches.length
};

console.log(`✅ Collection limits search complete`);
console.log(`   - .slice(): ${sliceMatches.length} files`);
console.log(`   - .limit(): ${limitMatches.length} files`);
console.log(`   - .take(): ${takeMatches.length} files`);

// 6. Search for cache/revalidation
console.log('\n💾 Searching for cache/revalidation...');
const revalidateMatches = searchInDir(path.join(projectRoot, 'src'), /revalidate(Tag|Path)?/);
baseline.sections.cache.revalidationPatterns = revalidateMatches;
console.log(`✅ Found ${revalidateMatches.length} files with revalidation`);
if (revalidateMatches.length > 0) {
  revalidateMatches.slice(0, 3).forEach(m => {
    console.log(`   - ${m.file} (${m.occurrences} occurrences)`);
  });
}

// 7. Inspect media library
console.log('\n📸 Inspecting media library...');
const mediaLibraryFile = path.join(projectRoot, 'src', 'features', 'media', 'media-library-view.tsx');
const mediaResolverFile = path.join(projectRoot, 'src', 'lib', 'media', 'resolver.ts');

baseline.sections.mediaLibrary.libraryViewExists = fs.existsSync(mediaLibraryFile);
baseline.sections.mediaLibrary.resolverExists = fs.existsSync(mediaResolverFile);

if (baseline.sections.mediaLibrary.resolverExists) {
  const resolverContent = fs.readFileSync(mediaResolverFile, 'utf8');
  baseline.sections.mediaLibrary.resolverHasCaching = resolverContent.includes('cache');
  console.log('✅ Media resolver exists');
  console.log(`   - Has caching: ${baseline.sections.mediaLibrary.resolverHasCaching}`);
}

// 8. Check for RLS in migrations
console.log('\n🔒 Searching for RLS policies...');
const migrationsDir = path.join(projectRoot, 'supabase', 'migrations');
let rlsCount = 0;
if (fs.existsSync(migrationsDir)) {
  fs.readdirSync(migrationsDir).forEach(file => {
    const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    if (/CREATE POLICY|CREATE RLS|ENABLE ROW LEVEL SECURITY/.test(content)) {
      rlsCount++;
    }
  });
}
baseline.sections.rls.migrationsWithRLS = rlsCount;
console.log(`✅ RLS found in ${rlsCount} migrations`);

// 9. Check public website integration
console.log('\n🌍 Inspecting public website integration...');
const publicPagesDir = path.join(projectRoot, 'src', 'app', '(public)');
const publicPages = fs.existsSync(publicPagesDir) ? fs.readdirSync(publicPagesDir) : [];
const publicDataFetches = searchInDir(path.join(projectRoot, 'src', 'app'), /fetch\(|supabase\.|query/);

baseline.sections.publicWebsite = {
  publicPagesDir: publicPagesDir.replace(projectRoot, ''),
  publicPagesCount: publicPages.length,
  dataFetchPatterns: publicDataFetches.length
};

console.log(`✅ Public website integration:`);
console.log(`   - Public pages: ${publicPages.length}`);
console.log(`   - Data fetch patterns: ${publicDataFetches.length}`);

// Write baseline report
const reportPath = path.join(projectRoot, 'PHASE0_BASELINE_INSPECTION.json');
fs.writeFileSync(reportPath, JSON.stringify(baseline, null, 2));

console.log(`\n✅ BASELINE INSPECTION COMPLETE`);
console.log(`📄 Report: ${reportPath}\n`);

// Summary
console.log('📊 BASELINE SUMMARY:');
console.log(`   Migration exists: ${baseline.sections.database.migrationExists}`);
console.log(`   Repository configured: ${baseline.sections.repository.fileExists}`);
console.log(`   Generic API route: ${baseline.sections.apis.genericRoute}`);
console.log(`   ID API route: ${baseline.sections.apis.idRoute}`);
console.log(`   Promotions feature: ${baseline.sections.promotions.directoryExists}`);
console.log(`   Promotions types: ${baseline.sections.promotions.typesFileExists}`);
console.log(`   Collection limits found: ${baseline.sections.collectionLimits.totalOccurrences}`);
console.log(`   Revalidation patterns: ${baseline.sections.cache.revalidationPatterns.length}`);
console.log(`   Media library: ${baseline.sections.mediaLibrary.libraryViewExists}`);
console.log(`   RLS migrations: ${baseline.sections.rls.migrationsWithRLS}`);
