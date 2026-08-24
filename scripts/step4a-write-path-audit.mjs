#!/usr/bin/env node
/**
 * STEP 4A — WRITE PATH AUDIT
 *
 * Comprehensively audit all write paths for media_id and image_url
 * across the ZT Lounge codebase to identify where media_id needs to be
 * enforced as the canonical writable reference.
 *
 * This audit discovers:
 * - Where image_url is written
 * - Where media_id is written
 * - Where media_id is discarded
 * - Where media_id is missing from writable fields
 * - Entity-specific storage uploads
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║   STEP 4A: WRITE PATH AUDIT                                ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

// ============================================================================
// FILE DISCOVERY
// ============================================================================

function findFiles(dir, pattern, results = []) {
  try {
    const files = readdirSync(dir);
    for (const file of files) {
      const filePath = join(dir, file);
      const stat = statSync(filePath);
      
      if (stat.isDirectory()) {
        // Skip node_modules, .next, etc.
        if (!file.startsWith('.') && file !== 'node_modules' && file !== 'dist' && file !== 'build') {
          findFiles(filePath, pattern, results);
        }
      } else if (stat.isFile() && pattern.test(file)) {
        results.push(filePath);
      }
    }
  } catch (error) {
    // Skip inaccessible directories
  }
  return results;
}

// ============================================================================
// CODE ANALYSIS
// ============================================================================

const audit = {
  timestamp: new Date().toISOString(),
  summary: {
    filesAnalyzed: 0,
    mediaIdWritePaths: [],
    imageUrlWritePaths: [],
    repositoryConfig: {},
    apiRoutes: [],
    validationSchemas: [],
    typeDefinitions: [],
    componentUsage: [],
    issues: []
  }
};

console.log('📋 Step 4A.1: Analyzing repository configuration...\n');

// Analyze repository.ts
try {
  const repoPath = join(projectRoot, 'src', 'lib', 'repository.ts');
  const repoContent = readFileSync(repoPath, 'utf8');
  
  // Extract WRITABLE_FIELDS
  const writableFieldsMatch = repoContent.match(/const WRITABLE_FIELDS[^=]*=\s*{([^}]+)}/s);
  if (writableFieldsMatch) {
    const writableContent = writableFieldsMatch[1];
    
    // Check each CMS table
    const tables = ['menu_items', 'services', 'gallery', 'hero_slides', 'business_settings'];
    for (const table of tables) {
      const tablePattern = new RegExp(`${table}:\\s*\\[([^\\]]+)\\]`, 's');
      const tableMatch = writableContent.match(tablePattern);
      
      if (tableMatch) {
        const fields = tableMatch[1]
          .split(',')
          .map(f => f.trim().replace(/['"]/g, ''))
          .filter(f => f);
        
        const hasMediaId = fields.some(f => 
          f === 'media_id' || f === 'logo_media_id' || f === 'favicon_media_id'
        );
        const hasImageUrl = fields.some(f => 
          f === 'image_url' || f === 'logo_url' || f === 'favicon_url'
        );
        
        audit.summary.repositoryConfig[table] = {
          writableFields: fields,
          hasMediaId,
          hasImageUrl,
          mediaIdFields: fields.filter(f => f.includes('media_id')),
          imageUrlFields: fields.filter(f => f.includes('_url'))
        };
      }
    }
  }
  
  audit.summary.filesAnalyzed++;
  console.log('   ✅ Analyzed repository.ts');
} catch (error) {
  audit.summary.issues.push({
    file: 'src/lib/repository.ts',
    issue: `Failed to analyze: ${error.message}`
  });
  console.error('   ❌ Failed to analyze repository.ts');
}

console.log('\n📋 Step 4A.2: Analyzing API routes...\n');

// Find all API route files
const apiRouteFiles = findFiles(
  join(projectRoot, 'src', 'app', 'api'),
  /route\.(ts|js)$/
);

for (const filePath of apiRouteFiles) {
  try {
    const content = readFileSync(filePath, 'utf8');
    const relativePath = filePath.replace(projectRoot, '').replace(/\\/g, '/');
    
    const routeAnalysis = {
      file: relativePath,
      hasPOST: content.includes('export async function POST'),
      hasPUT: content.includes('export async function PUT'),
      hasPATCH: content.includes('export async function PATCH'),
      usesRepository: content.includes('Repository'),
      writesImageUrl: /image_url|logo_url|favicon_url/.test(content),
      writesMediaId: /media_id|logo_media_id|favicon_media_id/.test(content),
      usesSupabase: content.includes('supabase'),
      hasValidation: content.includes('validate') || content.includes('schema')
    };
    
    // Check for specific CMS resources
    if (relativePath.includes('/admin/[resource]')) {
      routeAnalysis.isDynamicResource = true;
      routeAnalysis.usesResourceConfig = content.includes('getResourceConfig');
    }
    
    audit.summary.apiRoutes.push(routeAnalysis);
    audit.summary.filesAnalyzed++;
    
    if (routeAnalysis.hasPOST || routeAnalysis.hasPUT || routeAnalysis.hasPATCH) {
      console.log(`   ✅ ${relativePath}`);
    }
  } catch (error) {
    audit.summary.issues.push({
      file: filePath,
      issue: `Failed to analyze API route: ${error.message}`
    });
  }
}

console.log('\n📋 Step 4A.3: Analyzing type definitions...\n');

// Find type definition files
const typeFiles = findFiles(
  join(projectRoot, 'src'),
  /types?\.(ts|d\.ts)$/
);

for (const filePath of typeFiles) {
  try {
    const content = readFileSync(filePath, 'utf8');
    const relativePath = filePath.replace(projectRoot, '').replace(/\\/g, '/');
    
    const hasMediaTypes = /media_id|MediaId|media_assets/.test(content);
    const hasImageTypes = /image_url|imageUrl|ImageURL/.test(content);
    
    if (hasMediaTypes || hasImageTypes) {
      audit.summary.typeDefinitions.push({
        file: relativePath,
        hasMediaTypes,
        hasImageTypes,
        definesMediaTypes: /interface.*media_id|type.*media_id/i.test(content)
      });
      
      console.log(`   ✅ ${relativePath}`);
    }
    
    audit.summary.filesAnalyzed++;
  } catch (error) {
    audit.summary.issues.push({
      file: filePath,
      issue: `Failed to analyze types: ${error.message}`
    });
  }
}

console.log('\n📋 Step 4A.4: Analyzing React components...\n');

// Find component files that handle media
const componentFiles = findFiles(
  join(projectRoot, 'src'),
  /\.(tsx|jsx)$/
);

for (const filePath of componentFiles) {
  try {
    const content = readFileSync(filePath, 'utf8');
    const relativePath = filePath.replace(projectRoot, '').replace(/\\/g, '/');
    
    // Skip if it doesn't deal with media
    if (!/media|image|gallery|hero|service|menu/i.test(content)) {
      continue;
    }
    
    const componentAnalysis = {
      file: relativePath,
      usesMediaPicker: content.includes('MediaPicker') || content.includes('media-picker'),
      usesImageUpload: /upload|Upload/.test(content) && /image|file/.test(content),
      readsMediaId: /media_id|mediaId/.test(content),
      writesMediaId: /setMedia|updateMedia|media_id\s*:/.test(content),
      readsImageUrl: /image_url|imageUrl/.test(content),
      writesImageUrl: /setImage|updateImage|image_url\s*:/.test(content)
    };
    
    if (Object.values(componentAnalysis).some(v => v === true)) {
      audit.summary.componentUsage.push(componentAnalysis);
      console.log(`   ✅ ${relativePath}`);
    }
    
    audit.summary.filesAnalyzed++;
  } catch (error) {
    audit.summary.issues.push({
      file: filePath,
      issue: `Failed to analyze component: ${error.message}`
    });
  }
}

console.log('\n📋 Step 4A.5: Identifying issues and gaps...\n');

// Check for missing media_id in writable fields
for (const [table, config] of Object.entries(audit.summary.repositoryConfig)) {
  if (table === 'business_settings') {
    if (!config.hasMediaId) {
      audit.summary.issues.push({
        table,
        issue: 'Missing logo_media_id and favicon_media_id in WRITABLE_FIELDS',
        severity: 'HIGH'
      });
    }
  } else if (['menu_items', 'services', 'gallery', 'hero_slides'].includes(table)) {
    if (!config.hasMediaId) {
      audit.summary.issues.push({
        table,
        issue: 'Missing media_id in WRITABLE_FIELDS',
        severity: 'HIGH'
      });
    } else {
      console.log(`   ✅ ${table} has media_id in WRITABLE_FIELDS`);
    }
  }
}

// Check if testimonials has media_id (should NOT)
if (audit.summary.repositoryConfig.testimonials) {
  if (audit.summary.repositoryConfig.testimonials.hasMediaId) {
    audit.summary.issues.push({
      table: 'testimonials',
      issue: 'Testimonials should NOT have media_id (boundary violation)',
      severity: 'CRITICAL'
    });
  } else {
    console.log('   ✅ testimonials correctly excludes media_id');
  }
}

// ============================================================================
// GENERATE REPORT
// ============================================================================

console.log('\n📋 Step 4A.6: Generating report...\n');

const report = `# STEP 4A: Write Path Audit Report

**Generated:** ${audit.timestamp}  
**Project:** ZT Lounge Admin  
**Files Analyzed:** ${audit.summary.filesAnalyzed}

---

## Executive Summary

This audit identifies all write paths for \`media_id\` and \`image_url\` fields
across the ZT Lounge codebase to ensure \`media_id\` can be enforced as the
canonical writable reference for CMS visual assets.

### Critical Findings

${audit.summary.issues.filter(i => i.severity === 'CRITICAL').length > 0 ? 
  audit.summary.issues.filter(i => i.severity === 'CRITICAL')
    .map(i => `- **CRITICAL**: ${i.table || i.file}: ${i.issue}`).join('\n') :
  '✅ No critical issues found'}

### High-Priority Issues

${audit.summary.issues.filter(i => i.severity === 'HIGH').length > 0 ? 
  audit.summary.issues.filter(i => i.severity === 'HIGH')
    .map(i => `- **HIGH**: ${i.table || i.file}: ${i.issue}`).join('\n') :
  '✅ No high-priority issues found'}

---

## Repository Configuration Analysis

### WRITABLE_FIELDS Status

${Object.entries(audit.summary.repositoryConfig).map(([table, config]) => `
#### ${table}

- **Has media_id fields:** ${config.hasMediaId ? '✅ YES' : '❌ NO'}
- **Has image_url fields:** ${config.hasImageUrl ? '✅ YES' : '❌ NO'}
- **Media ID fields:** ${config.mediaIdFields.length > 0 ? config.mediaIdFields.join(', ') : 'NONE'}
- **Image URL fields:** ${config.imageUrlFields.length > 0 ? config.imageUrlFields.join(', ') : 'NONE'}
- **Total writable fields:** ${config.writableFields.length}
`).join('\n')}

---

## API Routes Analysis

**Total API routes analyzed:** ${audit.summary.apiRoutes.length}

### Write-Capable Routes

${audit.summary.apiRoutes
  .filter(r => r.hasPOST || r.hasPUT || r.hasPATCH)
  .map(r => `
#### ${r.file}

- **Methods:** ${[r.hasPOST && 'POST', r.hasPUT && 'PUT', r.hasPATCH && 'PATCH'].filter(Boolean).join(', ')}
- **Uses Repository:** ${r.usesRepository ? '✅' : '❌'}
- **Writes image_url:** ${r.writesImageUrl ? '⚠️  YES' : '✅ NO'}
- **Writes media_id:** ${r.writesMediaId ? '✅ YES' : '⚠️  NO'}
- **Uses Supabase directly:** ${r.usesSupabase ? '⚠️  YES' : '✅ NO'}
- **Has validation:** ${r.hasValidation ? '✅ YES' : '⚠️  NO'}
${r.isDynamicResource ? `- **Dynamic resource route:** ✅ YES\n- **Uses resource config:** ${r.usesResourceConfig ? '✅ YES' : '❌ NO'}` : ''}
`).join('\n')}

---

## Type Definitions Analysis

**Total type files with media references:** ${audit.summary.typeDefinitions.length}

${audit.summary.typeDefinitions.map(t => `
### ${t.file}

- **Has media_id types:** ${t.hasMediaTypes ? '✅' : '❌'}
- **Has image_url types:** ${t.hasImageTypes ? '✅' : '❌'}
- **Defines custom media types:** ${t.definesMediaTypes ? '✅' : '❌'}
`).join('\n')}

---

## Component Usage Analysis

**Total components handling media:** ${audit.summary.componentUsage.length}

${audit.summary.componentUsage.map(c => `
### ${c.file}

- **Uses MediaPicker:** ${c.usesMediaPicker ? '✅' : '❌'}
- **Uses image upload:** ${c.usesImageUpload ? '⚠️  YES' : '✅ NO'}
- **Reads media_id:** ${c.readsMediaId ? '✅' : '❌'}
- **Writes media_id:** ${c.writesMediaId ? '✅' : '⚠️  NO'}
- **Reads image_url:** ${c.readsImageUrl ? '✅' : '❌'}
- **Writes image_url:** ${c.writesImageUrl ? '⚠️  YES' : '✅ NO'}
`).join('\n')}

---

## Issues Summary

**Total issues found:** ${audit.summary.issues.length}

${audit.summary.issues.length > 0 ? 
  audit.summary.issues.map((i, idx) => `
### Issue ${idx + 1}: ${i.severity || 'MEDIUM'}

- **Location:** ${i.table || i.file}
- **Issue:** ${i.issue}
`).join('\n') : '✅ No issues found'}

---

## Recommendations

### 1. Repository Layer

${Object.entries(audit.summary.repositoryConfig)
  .filter(([table, config]) => 
    ['menu_items', 'services', 'gallery', 'hero_slides', 'business_settings'].includes(table) && !config.hasMediaId
  ).length > 0 ? 
  `⚠️  **Action Required:** Add media_id fields to WRITABLE_FIELDS for:\n${Object.entries(audit.summary.repositoryConfig)
    .filter(([table, config]) => 
      ['menu_items', 'services', 'gallery', 'hero_slides', 'business_settings'].includes(table) && !config.hasMediaId
    )
    .map(([table]) => `  - ${table}`)
    .join('\n')}` :
  '✅ All target tables have media_id in WRITABLE_FIELDS'
}

### 2. API Routes

${audit.summary.apiRoutes.filter(r => r.usesSupabase && !r.usesRepository).length > 0 ?
  `⚠️  **Action Required:** ${audit.summary.apiRoutes.filter(r => r.usesSupabase && !r.usesRepository).length} route(s) bypass Repository layer:
${audit.summary.apiRoutes
  .filter(r => r.usesSupabase && !r.usesRepository)
  .map(r => `  - ${r.file}`)
  .join('\n')}

These routes should use the Repository class to ensure consistent field filtering.` :
  '✅ All write routes use the Repository layer'
}

### 3. Validation

- Add server-side validation to reject invalid media_id UUIDs
- Add server-side validation to verify referenced media_assets exist
- Distinguish between NULL (clear relationship) and ABSENT (preserve relationship)

### 4. Components

${audit.summary.componentUsage.filter(c => c.usesImageUpload && !c.usesMediaPicker).length > 0 ?
  `⚠️  **Action Required:** ${audit.summary.componentUsage.filter(c => c.usesImageUpload && !c.usesMediaPicker).length} component(s) use direct image upload:
${audit.summary.componentUsage
  .filter(c => c.usesImageUpload && !c.usesMediaPicker)
  .map(c => `  - ${c.file}`)
  .join('\n')}

Consider migrating to MediaPicker for canonical media_id workflow.` :
  '✅ Components use appropriate media selection patterns'
}

---

## Next Steps (Step 4B)

1. ✅ Verify all CMS tables have media_id in WRITABLE_FIELDS
2. ⏭️  Add server-side validation for media_id references
3. ⏭️  Implement NULL vs ABSENT semantics
4. ⏭️  Add integration tests for media_id write paths
5. ⏭️  Verify image_url preservation during updates

---

*Report generated by step4a-write-path-audit.mjs*
`;

writeFileSync(join(projectRoot, 'STEP4_WRITE_PATH_AUDIT.md'), report);
writeFileSync(join(projectRoot, 'STEP4_WRITE_PATH_AUDIT.json'), JSON.stringify(audit, null, 2));

console.log('✅ Reports generated:');
console.log('   - STEP4_WRITE_PATH_AUDIT.md');
console.log('   - STEP4_WRITE_PATH_AUDIT.json\n');

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║   STEP 4A COMPLETE                                         ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

if (audit.summary.issues.filter(i => i.severity === 'CRITICAL').length > 0) {
  console.error('❌ CRITICAL ISSUES FOUND - Review report before proceeding\n');
  process.exit(1);
} else if (audit.summary.issues.filter(i => i.severity === 'HIGH').length > 0) {
  console.warn('⚠️  HIGH-PRIORITY ISSUES FOUND - Address before Step 4B\n');
  process.exit(0);
} else {
  console.log('✅ NO CRITICAL ISSUES - Ready for Step 4B\n');
  process.exit(0);
}
