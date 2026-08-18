#!/usr/bin/env node

/**
 * ZT LOUNGE DYNAMIC CMS IMPLEMENTATION AUDIT
 * 
 * Deep inspection of codebase to identify:
 * - Hardcoded arrays
 * - Fixed-count assumptions
 * - Migration drift
 * - Database schema issues
 * - API design problems
 * - UI collection rendering
 * - Public website integration
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

const results = {
  timestamp: new Date().toISOString(),
  projectRoot,
  findings: {
    migrations: [],
    databaseSchema: [],
    repositoryLayer: [],
    apiRoutes: [],
    uiComponents: [],
    hardcodedPatterns: [],
    publicWebsite: [],
    mediaLibrary: [],
    promotions: [],
    types: [],
    validation: [],
    rls: [],
    cache: [],
    issues: []
  }
};

function searchFiles(dir, pattern, fileFilter = /\.(tsx?|mjs)$/) {
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
                file: full.replace(projectRoot, ''),
                match: content.match(pattern)?.[0] || 'pattern found'
              });
            }
          } catch (e) {
            // ignore read errors
          }
        }
      });
    } catch (e) {
      // ignore directory errors
    }
  };
  
  walk(dir);
  return matches;
}

// 1. Inspect migrations
console.log('📋 Analyzing migrations...');
const migrationsDir = path.join(projectRoot, 'supabase', 'migrations');
if (fs.existsSync(migrationsDir)) {
  const migrations = fs.readdirSync(migrationsDir).sort();
  
  migrations.forEach(file => {
    const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    
    if (file === '20260817_add_media_id_to_cms_tables.sql') {
      const hasMediaIdCols = content.includes('media_id');
      const hasFK = content.includes('FOREIGN KEY');
      const hasIndexes = content.includes('CREATE INDEX');
      
      results.findings.migrations.push({
        file,
        applied: '⚠️ NEEDS VERIFICATION',
        mediaIdColumns: hasMediaIdCols,
        foreignKeys: hasFK,
        indexes: hasIndexes,
        note: 'Migration exists but must verify it is applied to live database'
      });
    }
    
    // Track promotions migration
    if (file.includes('promotion') || content.includes('promotions')) {
      results.findings.migrations.push({
        file,
        type: 'promotions'
      });
    }
  });
}

// 2. Inspect repository layer
console.log('🔧 Analyzing repository layer...');
const repoFile = path.join(projectRoot, 'src', 'lib', 'repository.ts');
if (fs.existsSync(repoFile)) {
  const content = fs.readFileSync(repoFile, 'utf8');
  
  results.findings.repositoryLayer.push({
    file: '/src/lib/repository.ts',
    hasWritableFields: content.includes('WRITABLE_FIELDS'),
    hasResponseAllowlists: content.includes('RESPONSE_ALLOWLISTS'),
    mediaIdSupport: (content.match(/media_id/g) || []).length,
    tables: (content.match(/WRITABLE_FIELDS\.(\w+)/g) || []).map(m => m.replace('WRITABLE_FIELDS.', ''))
  });
}

// 3. Search for hardcoded arrays
console.log('🔍 Searching for hardcoded arrays...');
const hardcodedPatterns = [
  { pattern: /const\s+services\s*=\s*\[/, name: 'hardcoded services array' },
  { pattern: /const\s+heroes\s*=\s*\[/, name: 'hardcoded heroes array' },
  { pattern: /const\s+menu\s*=\s*\[/, name: 'hardcoded menu array' },
  { pattern: /const\s+promotions\s*=\s*\[/, name: 'hardcoded promotions array' },
  { pattern: /const\s+gallery\s*=\s*\[/, name: 'hardcoded gallery array' },
  { pattern: /hero_1|hero_2|hero_3/, name: 'numbered hero variables' },
  { pattern: /service_1|service_2|service_3/, name: 'numbered service variables' },
  { pattern: /menu_item_1|menu_item_2/, name: 'numbered menu variables' }
];

hardcodedPatterns.forEach(({ pattern, name }) => {
  const matches = searchFiles(path.join(projectRoot, 'src'), pattern);
  if (matches.length > 0) {
    results.findings.hardcodedPatterns.push({
      pattern: name,
      count: matches.length,
      files: matches.slice(0, 3).map(m => m.file)
    });
  }
});

// 4. Search for slice() limits
console.log('📊 Searching for collection limits...');
const sliceMatches = searchFiles(path.join(projectRoot, 'src'), /\.slice\(0,\s*\d+\)/);
if (sliceMatches.length > 0) {
  results.findings.issues.push({
    type: 'CRITICAL',
    issue: 'slice(0, N) limits found',
    count: sliceMatches.length,
    files: sliceMatches.slice(0, 3).map(m => m.file),
    note: 'These may impose artificial collection limits'
  });
}

// 5. Search for .limit() that may be restrictive
console.log('🔎 Searching for suspicious .limit() calls...');
const limitMatches = searchFiles(path.join(projectRoot, 'src'), /\.limit\(\s*\d+\s*\)/);
results.findings.issues.push({
  type: 'REVIEW NEEDED',
  issue: '.limit() calls found',
  count: limitMatches.length,
  note: 'Verify these are for pagination, not business content limits'
});

// 6. Inspect API routes
console.log('🌐 Analyzing API routes...');
const adminRoutesDir = path.join(projectRoot, 'src', 'app', 'api', 'admin');
if (fs.existsSync(adminRoutesDir)) {
  const routes = [];
  fs.readdirSync(adminRoutesDir).forEach(item => {
    const full = path.join(adminRoutesDir, item);
    if (fs.statSync(full).isDirectory()) {
      routes.push(`/api/admin/${item}`);
    }
  });
  
  results.findings.apiRoutes.push({
    admin_routes: routes,
    hasCrudHandler: fs.existsSync(path.join(adminRoutesDir, '[resource]', 'route.ts')),
    hasIdCrudHandler: fs.existsSync(path.join(adminRoutesDir, '[resource]', '[id]', 'route.ts'))
  });
}

// 7. Inspect UI components for dynamic rendering
console.log('🎨 Analyzing UI components...');
const uiDirs = ['menu', 'services', 'gallery', 'cms'];
uiDirs.forEach(dir => {
  const featuresDir = path.join(projectRoot, 'src', 'features', dir);
  if (fs.existsSync(featuresDir)) {
    const files = fs.readdirSync(featuresDir);
    const hasMap = files.some(f => {
      const content = fs.readFileSync(path.join(featuresDir, f), 'utf8');
      return /\.map\(|\.forEach\(/.test(content);
    });
    
    results.findings.uiComponents.push({
      component: dir,
      exists: true,
      hasDynamicRendering: hasMap,
      files: files.filter(f => f.endsWith('.tsx') || f.endsWith('.ts'))
    });
  }
});

// 8. Check for TypeScript types
console.log('📝 Analyzing TypeScript types...');
const typesDir = path.join(projectRoot, 'src', 'types');
if (fs.existsSync(typesDir)) {
  const typeFiles = fs.readdirSync(typesDir);
  results.findings.types.push({
    typeDir: '/src/types',
    files: typeFiles,
    hasMediaTypes: typeFiles.includes('media.ts'),
    hasPromotionTypes: typeFiles.some(f => f.includes('promotion'))
  });
}

// 9. Search for real hardcoded business content
console.log('🎯 Searching for hardcoded business content...');
const contentMatches = [
  { pattern: /"VIP Cabin"/, name: 'VIP Cabin hardcoded' },
  { pattern: /"Chicken Burger"/, name: 'Menu items hardcoded' },
  { pattern: /heroes\.length === 2/, name: 'Heroes count assumption' },
  { pattern: /service\.id === /, name: 'Service ID hardcoded' }
];

contentMatches.forEach(({ pattern, name }) => {
  const matches = searchFiles(path.join(projectRoot, 'src'), pattern);
  if (matches.length > 0) {
    results.findings.issues.push({
      type: 'HARDCODED_CONTENT',
      issue: name,
      files: matches.map(m => m.file)
    });
  }
});

// 10. Check public website integration
console.log('🌍 Analyzing public website integration...');
const publicPages = searchFiles(path.join(projectRoot, 'src', 'app'), /\/api\/|supabase|fetch/);
results.findings.publicWebsite.push({
  dataFetchingPatterns: publicPages.length,
  note: 'Public pages should fetch CMS content dynamically'
});

// 11. Check for cache/revalidation
console.log('💾 Analyzing cache/revalidation...');
const revalidateMatches = searchFiles(path.join(projectRoot, 'src'), /revalidate|revalidatePath|revalidateTag|revalidateCommand/);
results.findings.cache.push({
  hasRevalidation: revalidateMatches.length > 0,
  count: revalidateMatches.length,
  files: revalidateMatches.slice(0, 3).map(m => m.file)
});

// 12. Check media library
console.log('📸 Analyzing media library...');
const mediaLibFile = path.join(projectRoot, 'src', 'features', 'media', 'media-library-view.tsx');
if (fs.existsSync(mediaLibFile)) {
  const content = fs.readFileSync(mediaLibFile, 'utf8');
  results.findings.mediaLibrary.push({
    file: '/src/features/media/media-library-view.tsx',
    exists: true,
    size: content.length
  });
}

// 13. Check for promotions
console.log('🎉 Analyzing promotions...');
const promotionsDir = path.join(projectRoot, 'src', 'features', 'promotions');
const hasPromotions = fs.existsSync(promotionsDir);
results.findings.promotions.push({
  promotionsFeatureExists: hasPromotions,
  note: hasPromotions ? 'Promotions feature found' : 'Promotions feature NOT FOUND - needs creation'
});

// 14. Summary statistics
console.log('📈 Calculating summary...');
results.summary = {
  totalIssuesFound: results.findings.issues.length,
  criticalIssues: results.findings.issues.filter(i => i.type === 'CRITICAL').length,
  hardcodedPatterns: results.findings.hardcodedPatterns.length,
  migrationsVerified: results.findings.migrations.length,
  promotionsReady: hasPromotions
};

// Write results
const reportPath = path.join(projectRoot, 'ZT_CMS_IMPLEMENTATION_INSPECTION.json');
fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));

console.log('\n✅ Inspection complete!');
console.log(`📄 Report saved to: ${reportPath}`);
console.log(`\n📊 Summary:`);
console.log(`   - Total issues found: ${results.summary.totalIssuesFound}`);
console.log(`   - Critical issues: ${results.summary.criticalIssues}`);
console.log(`   - Hardcoded patterns: ${results.summary.hardcodedPatterns.length}`);
console.log(`   - Migrations to verify: ${results.summary.migrationsVerified}`);
console.log(`   - Promotions ready: ${results.summary.promotionsReady}`);
