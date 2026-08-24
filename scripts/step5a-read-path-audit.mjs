#!/usr/bin/env node
/**
 * STEP 5A — MEDIA READ PATH AUDIT
 * 
 * READ-ONLY AUDIT — DO NOT MODIFY CODE OR DATABASE
 * 
 * Objective:
 * Audit every read/render path where media is consumed to determine:
 * - Current behavior (uses image_url directly vs media_id)
 * - Whether media_id is available but ignored
 * - Whether existing resolver can handle the architecture
 * - Required changes for media_id → media_assets resolution
 * - Implementation order and risk level
 * 
 * Architecture requirement:
 * media_id → media_assets → resolved public URL
 * 
 * Preferred behavior:
 * - If media_id exists, resolve from media_assets
 * - If media_id is NULL, fallback to image_url
 * - Do NOT remove image_url yet
 * - Do NOT modify testimonials
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║   STEP 5A: MEDIA READ PATH AUDIT (READ-ONLY)              ║');
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
        if (!file.startsWith('.') && file !== 'node_modules' && file !== 'dist' && file !== 'build' && file !== '.next') {
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
// AUDIT STATE
// ============================================================================

const audit = {
  timestamp: new Date().toISOString(),
  summary: {
    totalFilesScanned: 0,
    affectedFiles: 0,
    existingResolvers: [],
    apiRoutes: [],
    components: [],
    publicWebsitePaths: [],
    duplicateResolutionLogic: [],
    testimonialsChecked: false,
    testimonialsUntouched: true
  },
  readPaths: []
};

// ============================================================================
// ANALYZE EXISTING MEDIA RESOLVER
// ============================================================================

console.log('📋 Step 5A.1: Analyzing existing media resolver...\n');

try {
  const resolverPath = join(projectRoot, 'src', 'lib', 'media', 'resolver.ts');
  const resolverContent = readFileSync(resolverPath, 'utf8');
  
  const resolverAnalysis = {
    file: 'src/lib/media/resolver.ts',
    exists: true,
    functions: [],
    supportsMediaId: false,
    supportsFallback: false,
    capabilities: []
  };
  
  // Extract function names
  const functionMatches = resolverContent.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/g);
  for (const match of functionMatches) {
    resolverAnalysis.functions.push(match[1]);
  }
  
  // Check capabilities
  if (/media_id|mediaId/.test(resolverContent)) {
    resolverAnalysis.supportsMediaId = true;
    resolverAnalysis.capabilities.push('media_id resolution');
  }
  
  if (/image_url|imageUrl/.test(resolverContent)) {
    resolverAnalysis.supportsFallback = true;
    resolverAnalysis.capabilities.push('image_url fallback');
  }
  
  if (/media_assets/.test(resolverContent)) {
    resolverAnalysis.capabilities.push('media_assets lookup');
  }
  
  if (/getImageUrl|resolveImage|resolveMedia/.test(resolverContent)) {
    resolverAnalysis.capabilities.push('URL resolution');
  }
  
  audit.summary.existingResolvers.push(resolverAnalysis);
  console.log(`   ✅ Found resolver: ${resolverAnalysis.functions.join(', ')}`);
  console.log(`   Capabilities: ${resolverAnalysis.capabilities.join(', ') || 'NONE'}`);
  
} catch (error) {
  console.log('   ⚠️  No existing media resolver found');
}

// ============================================================================
// ANALYZE API ROUTES
// ============================================================================

console.log('\n📋 Step 5A.2: Analyzing API read routes...\n');

const apiFiles = [
  ...findFiles(join(projectRoot, 'src', 'app', 'api'), /route\.(ts|js)$/),
  join(projectRoot, 'src', 'lib', 'repository.ts'),
  join(projectRoot, 'src', 'lib', 'api.ts')
];

for (const filePath of apiFiles) {
  try {
    const content = readFileSync(filePath, 'utf8');
    const relativePath = filePath.replace(projectRoot, '').replace(/\\/g, '/');
    
    // Skip if no media-related content
    if (!/image_url|media_id|gallery|hero|menu_items|services|business_settings|logo|favicon/i.test(content)) {
      continue;
    }
    
    audit.summary.totalFilesScanned++;
    
    const analysis = {
      file: relativePath,
      type: 'api',
      currentBehavior: 'unknown',
      usesImageUrl: /image_url|imageUrl|logo_url|favicon_url/.test(content),
      usesMediaId: /media_id|mediaId|logo_media_id|favicon_media_id/.test(content),
      hasMediaJoin: /media_assets/.test(content) && /join/.test(content),
      selectsMediaId: /select.*media_id|media_id.*select/i.test(content),
      selectsImageUrl: /select.*image_url|image_url.*select/i.test(content),
      hasTransform: /\.map\(|\.forEach\(|transform|serialize/.test(content),
      affectsTestimonials: /testimonial/i.test(content),
      riskLevel: 'unknown',
      requiredChange: 'unknown',
      implementationOrder: 999
    };
    
    // Determine current behavior
    if (analysis.selectsMediaId && analysis.hasMediaJoin) {
      analysis.currentBehavior = 'Already resolving via media_id';
      analysis.requiredChange = 'None - verify correct';
      analysis.riskLevel = 'LOW';
      analysis.implementationOrder = 0;
    } else if (analysis.selectsMediaId && !analysis.hasMediaJoin) {
      analysis.currentBehavior = 'Selects media_id but no join to media_assets';
      analysis.requiredChange = 'Add media_assets join or resolver';
      analysis.riskLevel = 'MEDIUM';
      analysis.implementationOrder = 2;
    } else if (analysis.selectsImageUrl && !analysis.selectsMediaId) {
      analysis.currentBehavior = 'Uses image_url directly, media_id not selected';
      analysis.requiredChange = 'Add media_id to SELECT, add resolution logic';
      analysis.riskLevel = 'HIGH';
      analysis.implementationOrder = 1;
    } else if (analysis.usesImageUrl) {
      analysis.currentBehavior = 'References image_url but selection unclear';
      analysis.requiredChange = 'Review and add media_id resolution';
      analysis.riskLevel = 'MEDIUM';
      analysis.implementationOrder = 3;
    }
    
    // Check for testimonials
    if (analysis.affectsTestimonials) {
      audit.summary.testimonialsChecked = true;
      analysis.requiredChange = 'NONE - testimonials must not be modified';
      analysis.riskLevel = 'EXCLUDED';
      analysis.implementationOrder = 999;
    }
    
    if (analysis.usesImageUrl || analysis.usesMediaId) {
      audit.summary.affectedFiles++;
      audit.readPaths.push(analysis);
      audit.summary.apiRoutes.push(analysis);
      
      const icon = analysis.currentBehavior.includes('Already resolving') ? '✅' :
                   analysis.affectsTestimonials ? '⛔' :
                   analysis.riskLevel === 'HIGH' ? '❌' : '⚠️';
      console.log(`   ${icon} ${relativePath}`);
      if (analysis.affectsTestimonials) {
        console.log(`       → EXCLUDED: Testimonials must not be modified`);
      }
    }
    
  } catch (error) {
    console.error(`   ❌ Failed to analyze: ${filePath}`);
  }
}

// ============================================================================
// ANALYZE COMPONENTS
// ============================================================================

console.log('\n📋 Step 5A.3: Analyzing React components...\n');

const componentFiles = findFiles(join(projectRoot, 'src'), /\.(tsx|jsx)$/);

for (const filePath of componentFiles) {
  try {
    const content = readFileSync(filePath, 'utf8');
    const relativePath = filePath.replace(projectRoot, '').replace(/\\/g, '/');
    
    // Skip if no image-related content
    if (!/image_url|media_id|<img|Image|gallery|hero|menu|service|logo|favicon/i.test(content)) {
      continue;
    }
    
    audit.summary.totalFilesScanned++;
    
    const analysis = {
      file: relativePath,
      type: 'component',
      currentBehavior: 'unknown',
      readsImageUrl: /\.image_url|item\.url|data\.image|imageUrl/.test(content),
      readsMediaId: /\.media_id|mediaId/.test(content),
      rendersImage: /<img|<Image|backgroundImage/.test(content),
      usesResolver: /resolveImage|resolveMedia|getImageUrl/.test(content),
      constructsStorageUrl: /supabase.*storage|storage\.from|\/storage\//.test(content),
      affectsTestimonials: /testimonial/i.test(content) && !/import.*testimonial/i.test(content),
      isPublicWebsite: relativePath.includes('/app/') && !relativePath.includes('/dashboard/') && !relativePath.includes('/api/'),
      riskLevel: 'unknown',
      requiredChange: 'unknown',
      implementationOrder: 999
    };
    
    // Determine current behavior
    if (analysis.usesResolver) {
      analysis.currentBehavior = 'Uses resolver function';
      analysis.requiredChange = 'Verify resolver supports media_id';
      analysis.riskLevel = 'LOW';
      analysis.implementationOrder = 4;
    } else if (analysis.constructsStorageUrl) {
      analysis.currentBehavior = 'Constructs Storage URL directly';
      analysis.requiredChange = 'Replace with resolver function';
      analysis.riskLevel = 'HIGH';
      analysis.implementationOrder = 2;
    } else if (analysis.readsImageUrl && analysis.rendersImage) {
      analysis.currentBehavior = 'Reads image_url and renders directly';
      analysis.requiredChange = 'Add resolver to support media_id → URL';
      analysis.riskLevel = 'MEDIUM';
      analysis.implementationOrder = 3;
    } else if (analysis.readsMediaId) {
      analysis.currentBehavior = 'Reads media_id but resolution unclear';
      analysis.requiredChange = 'Add resolver to convert media_id → URL';
      analysis.riskLevel = 'MEDIUM';
      analysis.implementationOrder = 2;
    }
    
    // Check for testimonials
    if (analysis.affectsTestimonials) {
      audit.summary.testimonialsChecked = true;
      analysis.requiredChange = 'NONE - testimonials must not be modified';
      analysis.riskLevel = 'EXCLUDED';
      analysis.implementationOrder = 999;
    }
    
    // Track public website paths separately
    if (analysis.isPublicWebsite && (analysis.readsImageUrl || analysis.readsMediaId)) {
      audit.summary.publicWebsitePaths.push(analysis);
    }
    
    if ((analysis.readsImageUrl || analysis.readsMediaId || analysis.rendersImage) && 
        (analysis.file.includes('menu') || analysis.file.includes('service') || 
         analysis.file.includes('gallery') || analysis.file.includes('hero') ||
         analysis.file.includes('cms') || analysis.file.includes('business') ||
         analysis.file.includes('logo') || analysis.file.includes('favicon'))) {
      
      audit.summary.affectedFiles++;
      audit.readPaths.push(analysis);
      audit.summary.components.push(analysis);
      
      const icon = analysis.usesResolver ? '✅' :
                   analysis.affectsTestimonials ? '⛔' :
                   analysis.riskLevel === 'HIGH' ? '❌' : '⚠️';
      console.log(`   ${icon} ${relativePath}`);
      if (analysis.affectsTestimonials) {
        console.log(`       → EXCLUDED: Testimonials must not be modified`);
      }
    }
    
  } catch (error) {
    console.error(`   ❌ Failed to analyze: ${filePath}`);
  }
}

// ============================================================================
// CHECK FOR DUPLICATE RESOLUTION LOGIC
// ============================================================================

console.log('\n📋 Step 5A.4: Checking for duplicate resolution logic...\n');

const allFiles = [...apiFiles, ...componentFiles];
const resolutionPatterns = [
  /supabase\.storage\.from\(['"`].*?['"`]\)\.getPublicUrl/,
  /storage\.from\(['"`].*?['"`]\)\.getPublicUrl/,
  /getImageUrl|resolveImage|resolveMedia/,
  /media_assets.*public_url/
];

for (const filePath of allFiles) {
  try {
    const content = readFileSync(filePath, 'utf8');
    const relativePath = filePath.replace(projectRoot, '').replace(/\\/g, '/');
    
    let foundPatterns = [];
    for (const pattern of resolutionPatterns) {
      if (pattern.test(content)) {
        foundPatterns.push(pattern.source);
      }
    }
    
    if (foundPatterns.length > 0 && !relativePath.includes('resolver.ts')) {
      audit.summary.duplicateResolutionLogic.push({
        file: relativePath,
        patterns: foundPatterns
      });
    }
  } catch (error) {
    // Skip
  }
}

if (audit.summary.duplicateResolutionLogic.length > 0) {
  console.log(`   ⚠️  Found ${audit.summary.duplicateResolutionLogic.length} file(s) with resolution logic`);
  audit.summary.duplicateResolutionLogic.forEach(item => {
    console.log(`       - ${item.file}`);
  });
} else {
  console.log('   ✅ No duplicate resolution logic found');
}

// ============================================================================
// GENERATE REPORT
// ============================================================================

console.log('\n📋 Step 5A.5: Generating audit report...\n');

// Sort read paths by implementation order
audit.readPaths.sort((a, b) => a.implementationOrder - b.implementationOrder);

const report = `# STEP 5A: Media Read Path Audit Report

**Generated:** ${audit.timestamp}  
**Project:** ZT Lounge Admin  
**Mode:** READ-ONLY AUDIT — NO MODIFICATIONS MADE

---

## Executive Summary

This READ-ONLY audit identifies all locations where media (images) are currently consumed
in read/render paths across the ZT Lounge codebase.

**Goal**: Prepare for migration from \`image_url\` direct usage to \`media_id → media_assets\` resolution.

### Audit Results

- **Total files scanned:** ${audit.summary.totalFilesScanned}
- **Affected files requiring changes:** ${audit.summary.affectedFiles}
- **API routes analyzed:** ${audit.summary.apiRoutes.length}
- **Components analyzed:** ${audit.summary.components.length}
- **Public website paths:** ${audit.summary.publicWebsitePaths.length}
- **Existing resolvers found:** ${audit.summary.existingResolvers.length}
- **Files with duplicate resolution logic:** ${audit.summary.duplicateResolutionLogic.length}
- **Testimonials checked:** ${audit.summary.testimonialsChecked ? 'YES' : 'NO'}
- **Testimonials untouched:** ${audit.summary.testimonialsUntouched ? '✅ YES' : '❌ NO'}

---

## Existing Media Resolver Analysis

${audit.summary.existingResolvers.length > 0 ? 
  audit.summary.existingResolvers.map(resolver => `
### ${resolver.file}

- **Functions:** ${resolver.functions.join(', ') || 'None'}
- **Supports media_id:** ${resolver.supportsMediaId ? '✅ YES' : '❌ NO'}
- **Supports fallback:** ${resolver.supportsFallback ? '✅ YES' : '❌ NO'}
- **Capabilities:**
${resolver.capabilities.map(c => `  - ${c}`).join('\n') || '  - None detected'}

**Assessment:** ${resolver.supportsMediaId && resolver.supportsFallback ? 
  '✅ Resolver appears ready for media_id → media_assets architecture' :
  '⚠️  Resolver needs enhancement to support media_id → media_assets with image_url fallback'}
`).join('\n') :
  '❌ **No existing media resolver found** — New resolver must be created'}

---

## Read Paths Requiring Changes

### By Implementation Order

${[...new Set(audit.readPaths.map(p => p.implementationOrder))]
  .filter(order => order < 999)
  .sort((a, b) => a - b)
  .map(order => {
    const paths = audit.readPaths.filter(p => p.implementationOrder === order);
    return `
#### Order ${order} (${paths[0].riskLevel} Risk)

${paths.map(path => `
**${path.file}**

- **Type:** ${path.type}
- **Current behavior:** ${path.currentBehavior}
- **Uses image_url:** ${path.usesImageUrl || path.readsImageUrl ? 'YES' : 'NO'}
- **Uses media_id:** ${path.usesMediaId || path.readsMediaId ? 'YES' : 'NO'}
- **Has media_assets join:** ${path.hasMediaJoin ? 'YES' : 'NO'}
- **Uses resolver:** ${path.usesResolver ? 'YES' : 'NO'}
- **Constructs Storage URL directly:** ${path.constructsStorageUrl ? 'YES' : 'NO'}
- **Risk level:** ${path.riskLevel}
- **Required change:** ${path.requiredChange}
`).join('\n')}`;
  }).join('\n')}

### Excluded Paths (Testimonials)

${audit.readPaths.filter(p => p.affectsTestimonials).length > 0 ?
  audit.readPaths.filter(p => p.affectsTestimonials).map(path => `
**${path.file}**

- **Status:** ⛔ EXCLUDED
- **Reason:** Testimonials must not be modified per project boundary
`).join('\n') :
  '✅ No testimonial-related paths found in affected files'
}

---

## API Routes Analysis

**Total API routes with media:** ${audit.summary.apiRoutes.length}

${audit.summary.apiRoutes.map(route => `
### ${route.file}

- **Current behavior:** ${route.currentBehavior}
- **Selects media_id:** ${route.selectsMediaId ? 'YES' : 'NO'}
- **Selects image_url:** ${route.selectsImageUrl ? 'YES' : 'NO'}
- **Has media_assets join:** ${route.hasMediaJoin ? 'YES' : 'NO'}
- **Has transform/serialization:** ${route.hasTransform ? 'YES' : 'NO'}
- **Risk:** ${route.riskLevel}
- **Required change:** ${route.requiredChange}
`).join('\n')}

---

## Component Analysis

**Total components with media:** ${audit.summary.components.length}

${audit.summary.components.map(comp => `
### ${comp.file}

- **Current behavior:** ${comp.currentBehavior}
- **Reads image_url:** ${comp.readsImageUrl ? 'YES' : 'NO'}
- **Reads media_id:** ${comp.readsMediaId ? 'YES' : 'NO'}
- **Renders images:** ${comp.rendersImage ? 'YES' : 'NO'}
- **Uses resolver:** ${comp.usesResolver ? 'YES' : 'NO'}
- **Constructs Storage URLs:** ${comp.constructsStorageUrl ? 'YES' : 'NO'}
- **Public website:** ${comp.isPublicWebsite ? 'YES' : 'NO'}
- **Risk:** ${comp.riskLevel}
- **Required change:** ${comp.requiredChange}
`).join('\n')}

---

## Public Website Rendering Paths

**Total public website paths:** ${audit.summary.publicWebsitePaths.length}

${audit.summary.publicWebsitePaths.length > 0 ?
  audit.summary.publicWebsitePaths.map(path => `
### ${path.file}

- **Reads image_url:** ${path.readsImageUrl ? 'YES' : 'NO'}
- **Reads media_id:** ${path.readsMediaId ? 'YES' : 'NO'}
- **Uses resolver:** ${path.usesResolver ? 'YES' : 'NO'}
- **Required change:** ${path.requiredChange}
`).join('\n') :
  '✅ No public website paths found (all media rendering in admin dashboard)'
}

---

## Duplicate Resolution Logic

${audit.summary.duplicateResolutionLogic.length > 0 ?
  `⚠️  **Found ${audit.summary.duplicateResolutionLogic.length} file(s) with inline resolution logic**

These files contain inline URL resolution that should be consolidated into the central resolver:

${audit.summary.duplicateResolutionLogic.map(item => `
- **${item.file}**
  - Patterns found: ${item.patterns.length}
`).join('\n')}

**Recommendation:** Refactor inline resolution to use central resolver function.
` :
  '✅ No duplicate resolution logic found — good separation of concerns'
}

---

## Required Architecture

### Target Resolution Flow

\`\`\`
Input: CMS Record (menu_item, service, gallery, hero_slide, business_settings)
  ↓
Check: Does record.media_id exist?
  ├─ YES → Query media_assets WHERE id = record.media_id
  │         ↓
  │       Return: media_assets.public_url
  │
  └─ NO → Fallback: record.image_url (legacy)
\`\`\`

### Implementation Requirements

1. **Resolver Function** (src/lib/media/resolver.ts)
   - Accept: \`{ media_id?: string | null, image_url?: string | null }\`
   - Return: \`string | null\` (resolved URL)
   - Priority: media_id > image_url > null

2. **API Layer** (src/app/api/*, src/lib/repository.ts)
   - SELECT both \`media_id\` and \`image_url\`
   - Optional: JOIN media_assets for server-side resolution
   - Pass both fields to client OR resolve server-side

3. **Component Layer** (src/features/*, src/components/*)
   - Use resolver function for all image rendering
   - Never construct Storage URLs directly
   - Always handle null/undefined gracefully

---

## Step 5B Implementation Plan

### Phase 1: Resolver Enhancement (If Needed)
${audit.summary.existingResolvers.length > 0 && audit.summary.existingResolvers[0].supportsMediaId ?
  '✅ Existing resolver supports media_id — verify and test' :
  '⚠️  Create or enhance resolver to support media_id → media_assets resolution with image_url fallback'
}

### Phase 2: API Layer (Order 1-2)
**High Risk** — Directly affects data contracts

${audit.readPaths.filter(p => p.type === 'api' && p.implementationOrder <= 2).length} file(s):
${audit.readPaths.filter(p => p.type === 'api' && p.implementationOrder <= 2)
  .map(p => `- ${p.file}: ${p.requiredChange}`).join('\n') || 'None'}

### Phase 3: Component Layer (Order 3-4)
**Medium Risk** — UI rendering changes

${audit.readPaths.filter(p => p.type === 'component' && p.implementationOrder >= 3 && p.implementationOrder < 999).length} file(s):
${audit.readPaths.filter(p => p.type === 'component' && p.implementationOrder >= 3 && p.implementationOrder < 999)
  .map(p => `- ${p.file}: ${p.requiredChange}`).join('\n') || 'None'}

### Phase 4: Consolidation
**Low Risk** — Code quality improvements

- Refactor ${audit.summary.duplicateResolutionLogic.length} file(s) with duplicate resolution logic
- Add TypeScript types for resolver inputs/outputs
- Add unit tests for resolver function
- Add integration tests for read paths

---

## Testimonials Boundary Verification

${audit.summary.testimonialsChecked ?
  `✅ **Testimonials were checked and remain excluded**

${audit.readPaths.filter(p => p.affectsTestimonials).length} file(s) reference testimonials and are marked EXCLUDED:
${audit.readPaths.filter(p => p.affectsTestimonials).map(p => `- ${p.file}`).join('\n') || 'None'}

**These files will NOT be modified in Step 5B.**` :
  '⚠️  No testimonials references found in affected paths — boundary respected'
}

---

## Next Steps

1. ✅ **Step 5A Complete** — READ-ONLY audit finished
2. ⏭️  **Review this report** — Validate findings and implementation plan
3. ⏭️  **Step 5B** — Implement resolver and update read paths per plan
4. ⏭️  **Step 5C** — Runtime verification of media_id resolution
5. ⏭️  **Step 5D** — UI integration (MediaPicker, forms, etc.)

---

## Summary

- **Total files requiring changes:** ${audit.summary.affectedFiles}
- **Existing resolver capability:** ${audit.summary.existingResolvers.length > 0 ? 'Present, needs verification' : 'Must be created'}
- **Duplicate resolution logic:** ${audit.summary.duplicateResolutionLogic.length} file(s)
- **Testimonials untouched:** ✅ Confirmed
- **Highest risk files:** ${audit.readPaths.filter(p => p.riskLevel === 'HIGH').length}
- **Ready for Step 5B:** ${audit.summary.affectedFiles > 0 ? '✅ YES' : '❌ NO'}

---

*Report generated by step5a-read-path-audit.mjs*
*READ-ONLY AUDIT — No code or database modifications made*
`;

writeFileSync(join(projectRoot, 'STEP5A_MEDIA_READ_PATH_AUDIT.md'), report);
writeFileSync(join(projectRoot, 'STEP5A_MEDIA_READ_PATH_AUDIT.json'), JSON.stringify(audit, null, 2));

console.log('✅ Reports generated:');
console.log('   - STEP5A_MEDIA_READ_PATH_AUDIT.md');
console.log('   - STEP5A_MEDIA_READ_PATH_AUDIT.json\n');

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║   STEP 5A COMPLETE (READ-ONLY)                             ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

console.log(`📊 Summary:`);
console.log(`   - Files scanned: ${audit.summary.totalFilesScanned}`);
console.log(`   - Affected files: ${audit.summary.affectedFiles}`);
console.log(`   - Existing resolvers: ${audit.summary.existingResolvers.length}`);
console.log(`   - Duplicate logic found: ${audit.summary.duplicateResolutionLogic.length}`);
console.log(`   - Testimonials untouched: ${audit.summary.testimonialsUntouched ? '✅ YES' : '❌ NO'}\n`);

process.exit(0);
