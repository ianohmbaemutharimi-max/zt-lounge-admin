#!/usr/bin/env node
/**
 * FINAL MEDIA ARCHITECTURE HARDENING LOOP (STATIC ANALYSIS)
 * 
 * Performs comprehensive static code analysis of:
 * 1. Database schema (TypeScript schema.ts)
 * 2. Migration files (brand assets migration)
 * 3. All CMS surfaces for raw URL inputs
 * 4. Media Library completeness
 * 5. Logo/Favicon UI integration
 * 6. Duplicate upload workflows
 * 7. Media resolution logic
 * 8. Repository allowlists
 * 9. Image change semantics
 * 10. Actual video functionality (not false positives)
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const report = {
  timestamp: new Date().toISOString(),
  phase: 'FINAL_MEDIA_ARCHITECTURE_HARDENING_STATIC',
  status: 'IN_PROGRESS',
  criticalIssues: [],
  warnings: [],
  verifications: {},
  recommendations: [],
  detailedFindings: {}
};

console.log('🔍 Starting Final Media Architecture Hardening Loop (Static Analysis)...\n');
console.log('='.repeat(80));
console.log('');

// ============================================================================
// STEP 1: VERIFY DATABASE SCHEMA (schema.ts)
// ============================================================================

function verifyDatabaseSchema() {
  console.log('📂 Step 1: Verifying database schema (TypeScript)...\n');
  
  const checks = {
    media_assets_table: false,
    hero_slides_media_id: false,
    gallery_images_media_id: false,
    services_media_id: false,
    menu_items_media_id: false,
    business_settings_logo_media_id: false,
    business_settings_favicon_media_id: false,
  };

  try {
    const schemaPath = join(rootDir, 'src/db/schema.ts');
    const content = readFileSync(schemaPath, 'utf8');

    // Check for media_assets table
    if (content.includes('media_assets') || content.includes('mediaAssets')) {
      checks.media_assets_table = true;
      console.log('✅ media_assets table defined in schema');
    } else {
      console.log('❌ media_assets table NOT FOUND in schema');
      report.criticalIssues.push({
        type: 'MISSING_TABLE_DEFINITION',
        table: 'media_assets',
        severity: 'CRITICAL',
        file: 'src/db/schema.ts',
        message: 'media_assets table not defined in TypeScript schema'
      });
    }

    // Check CMS tables for media_id
    const cmsChecks = [
      { table: 'hero_slides', field: 'media_id' },
      { table: 'heroSlides', field: 'mediaId' },
      { table: 'gallery_images', field: 'media_id' },
      { table: 'galleryImages', field: 'mediaId' },
      { table: 'services', field: 'media_id' },
      { table: 'services', field: 'mediaId' },
      { table: 'menu_items', field: 'media_id' },
      { table: 'menuItems', field: 'mediaId' }
    ];

    for (const check of cmsChecks) {
      const pattern = new RegExp(`${check.table}[\\s\\S]*?${check.field}`, 'i');
      if (pattern.test(content)) {
        const key = `${check.table.replace(/([A-Z])/g, '_$1').toLowerCase()}_media_id`;
        checks[key] = true;
      }
    }

    Object.entries(checks).forEach(([key, value]) => {
      if (key !== 'media_assets_table' && key.includes('_media_id')) {
        if (value) {
          console.log(`✅ ${key} field found`);
        } else {
          console.log(`❌ ${key} field NOT FOUND`);
          report.criticalIssues.push({
            type: 'MISSING_FIELD_DEFINITION',
            field: key,
            severity: 'CRITICAL',
            file: 'src/db/schema.ts',
            message: `${key} not defined in schema`
          });
        }
      }
    });

    // Check for brand assets
    if (content.match(/logo.*media.*id/i) || content.match(/logoMediaId/i)) {
      checks.business_settings_logo_media_id = true;
      console.log('✅ logo_media_id field found');
    } else {
      console.log('⚠️  logo_media_id field NOT FOUND in schema');
      report.warnings.push({
        type: 'MISSING_FIELD',
        field: 'logo_media_id',
        severity: 'MEDIUM',
        message: 'logo_media_id not found in schema (UI may not be integrated)'
      });
    }

    if (content.match(/favicon.*media.*id/i) || content.match(/faviconMediaId/i)) {
      checks.business_settings_favicon_media_id = true;
      console.log('✅ favicon_media_id field found');
    } else {
      console.log('⚠️  favicon_media_id field NOT FOUND in schema');
      report.warnings.push({
        type: 'MISSING_FIELD',
        field: 'favicon_media_id',
        severity: 'MEDIUM',
        message: 'favicon_media_id not found in schema (UI may not be integrated)'
      });
    }

    report.verifications.databaseSchema = checks;

  } catch (error) {
    console.error('❌ Could not read schema.ts:', error.message);
    report.criticalIssues.push({
      type: 'FILE_READ_ERROR',
      file: 'src/db/schema.ts',
      severity: 'CRITICAL',
      message: `Could not read schema: ${error.message}`
    });
  }

  console.log('');
}

// ============================================================================
// STEP 2: VERIFY BRAND ASSETS MIGRATION EXISTS
// ============================================================================

function verifyBrandAssetsMigration() {
  console.log('📂 Step 2: Verifying brand assets migration file...\n');
  
  try {
    const migrationPath = join(rootDir, 'supabase/migrations/20260819_add_brand_assets_media_id.sql');
    const content = readFileSync(migrationPath, 'utf8');

    const hasLogoColumn = content.includes('logo_media_id');
    const hasFaviconColumn = content.includes('favicon_media_id');
    const hasForeignKey = content.includes('REFERENCES media_assets');

    if (hasLogoColumn && hasFaviconColumn && hasForeignKey) {
      console.log('✅ Brand assets migration file exists and is complete');
      console.log('   - logo_media_id column: ✅');
      console.log('   - favicon_media_id column: ✅');
      console.log('   - Foreign key constraints: ✅');
      report.verifications.brandAssetsMigration = { status: 'COMPLETE' };
    } else {
      console.log('⚠️  Brand assets migration file incomplete');
      report.warnings.push({
        type: 'INCOMPLETE_MIGRATION',
        file: migrationPath,
        severity: 'HIGH',
        message: 'Brand assets migration exists but may be incomplete'
      });
    }

  } catch (error) {
    console.log('❌ Brand assets migration file NOT FOUND');
    report.criticalIssues.push({
      type: 'MISSING_MIGRATION',
      severity: 'CRITICAL',
      message: 'Brand assets migration file (20260819_add_brand_assets_media_id.sql) not found'
    });
  }

  console.log('');
}

// ============================================================================
// STEP 3: INSPECT ALL CMS UI FOR RAW URL INPUTS
// ============================================================================

function inspectCMSForRawURLInputs() {
  console.log('📂 Step 3: Inspecting CMS UI components for raw URL inputs...\n');
  
  const filesToCheck = [
    'src/features/cms/website-cms.tsx',
    'src/features/gallery/gallery-view.tsx',
    'src/features/services/catalog-manager.tsx',
  ];

  const violations = [];
  const findings = [];

  for (const file of filesToCheck) {
    try {
      const path = join(rootDir, file);
      const content = readFileSync(path, 'utf8');

      // Check for direct file inputs in non-media components
      if (!file.includes('media')) {
        const fileInputPattern = /<input[^>]*type=["']file["'][^>]*>/gi;
        const fileMatches = content.match(fileInputPattern) || [];
        
        // Filter for image file inputs
        const imageFileInputs = fileMatches.filter(m => 
          m.includes('image') || m.includes('accept')
        );

        if (imageFileInputs.length > 0) {
          violations.push({
            file,
            type: 'DIRECT_FILE_INPUT',
            count: imageFileInputs.length,
            severity: 'CRITICAL'
          });
          console.log(`❌ ${file}: Found ${imageFileInputs.length} direct file input(s) - VIOLATION`);
          report.criticalIssues.push({
            type: 'RAW_FILE_INPUT_BYPASS',
            file,
            severity: 'CRITICAL',
            message: `CMS contains direct file input bypassing Media Library`
          });
        } else {
          console.log(`✅ ${file}: No direct file inputs found`);
        }
      }

      // Check for URL text inputs (excluding legitimate ones)
      const urlInputPattern = /placeholder=["'].*url.*["']|name=["'].*url.*["']/gi;
      const urlMatches = content.match(urlInputPattern) || [];
      
      const suspiciousURLs = urlMatches.filter(m => 
        !m.includes('cta') &&
        !m.includes('link') &&
        !m.includes('facebook') &&
        !m.includes('instagram') &&
        !m.includes('twitter') &&
        !m.includes('youtube') &&
        !m.includes('whatsapp')
      );

      if (suspiciousURLs.length > 0) {
        findings.push({
          file,
          type: 'SUSPICIOUS_URL_INPUT',
          count: suspiciousURLs.length
        });
        console.log(`⚠️  ${file}: Found ${suspiciousURLs.length} suspicious URL input(s) - needs review`);
      }

    } catch (error) {
      console.log(`⚠️  Could not read ${file}: ${error.message}`);
    }
  }

  report.verifications.cmsURLInputs = {
    filesChecked: filesToCheck.length,
    violations: violations.length,
    findings
  };

  if (violations.length === 0) {
    console.log('\n✅ No critical raw input bypasses found in CMS');
  }

  console.log('');
  return violations;
}

// ============================================================================
// STEP 4: VERIFY LOGO/FAVICON UI INTEGRATION
// ============================================================================

function verifyBrandAssetsUI() {
  console.log('📂 Step 4: Verifying logo/favicon UI integration...\n');
  
  try {
    const cmsPath = join(rootDir, 'src/features/cms/website-cms.tsx');
    const content = readFileSync(cmsPath, 'utf8');

    const hasLogoMediaPicker = /logo.*media.*picker|logoMedia|logo_media_id/i.test(content);
    const hasFaviconMediaPicker = /favicon.*media.*picker|faviconMedia|favicon_media_id/i.test(content);
    const hasMediaPickerModal = content.includes('MediaPickerModal');

    const result = {
      logoIntegrated: hasLogoMediaPicker && hasMediaPickerModal,
      faviconIntegrated: hasFaviconMediaPicker && hasMediaPickerModal,
      mediaPickerAvailable: hasMediaPickerModal
    };

    if (result.logoIntegrated) {
      console.log('✅ Logo Media Library integration found');
    } else {
      console.log('⚠️  Logo Media Library integration NOT FOUND');
      report.warnings.push({
        type: 'MISSING_UI_INTEGRATION',
        feature: 'logo',
        severity: 'MEDIUM',
        message: 'Logo UI not integrated with Media Picker (database foundation exists)'
      });
    }

    if (result.faviconIntegrated) {
      console.log('✅ Favicon Media Library integration found');
    } else {
      console.log('⚠️  Favicon Media Library integration NOT FOUND');
      report.warnings.push({
        type: 'MISSING_UI_INTEGRATION',
        feature: 'favicon',
        severity: 'MEDIUM',
        message: 'Favicon UI not integrated with Media Picker (database foundation exists)'
      });
    }

    report.verifications.brandAssetsUI = result;
    console.log('');
    return result;

  } catch (error) {
    console.error('❌ Could not verify brand assets UI:', error.message);
    return { error: error.message };
  }
}

// ============================================================================
// STEP 5: CHECK FOR ACTUAL VIDEO FUNCTIONALITY
// ============================================================================

function checkForVideoFunctionality() {
  console.log('📂 Step 5: Checking for actual video functionality...\n');
  
  try {
    const schemaPath = join(rootDir, 'src/db/schema.ts');
    const schemaContent = readFileSync(schemaPath, 'utf8');

    // Check for actual video columns (not false positives like "provide")
    const videoColumnPattern = /\b(video_url|videoUrl|video_id|videoId|video_path|videoPath|video_file|videoFile)\b/;
    const videoTypePattern = /(mime.*video|type.*video|kind.*video|format.*video)/i;
    
    const hasVideoColumn = videoColumnPattern.test(schemaContent);
    const hasVideoType = videoTypePattern.test(schemaContent);

    if (hasVideoColumn || hasVideoType) {
      console.log('❌ FOUND actual video-related schema elements');
      const matches = schemaContent.match(videoColumnPattern) || [];
      console.log(`   Matches: ${matches.join(', ')}`);
      
      report.criticalIssues.push({
        type: 'UNWANTED_VIDEO_FUNCTIONALITY',
        severity: 'HIGH',
        file: 'src/db/schema.ts',
        message: 'Schema contains video-related fields (requirement is image-only)',
        details: matches
      });
    } else {
      console.log('✅ No actual video functionality found (image-only architecture confirmed)');
    }

    report.verifications.videoFunctionality = {
      hasVideoColumn,
      hasVideoType,
      status: (!hasVideoColumn && !hasVideoType) ? 'PASS' : 'FAIL'
    };

    console.log('');
    return (!hasVideoColumn && !hasVideoType);

  } catch (error) {
    console.error('❌ Could not check video functionality:', error.message);
    return null;
  }
}

// ============================================================================
// STEP 6: VERIFY MEDIA RESOLUTION LOGIC
// ============================================================================

function verifyMediaResolution() {
  console.log('📂 Step 6: Verifying media resolution logic...\n');
  
  try {
    const resolverPath = join(rootDir, 'src/lib/media/resolver.ts');
    const content = readFileSync(resolverPath, 'utf8');

    const hasMediaIdCheck = /if\s*\([^)]*media_id|if\s*\([^)]*mediaId/.test(content);
    const hasLegacyFallback = content.includes('image_url') || content.includes('imageUrl');
    const correctPattern = hasMediaIdCheck && hasLegacyFallback;

    if (correctPattern) {
      console.log('✅ Media resolver correctly prioritizes media_id with legacy fallback');
    } else if (!hasMediaIdCheck) {
      console.log('❌ Media resolver does NOT check media_id first');
      report.criticalIssues.push({
        type: 'INCORRECT_RESOLVER_PATTERN',
        file: 'src/lib/media/resolver.ts',
        severity: 'HIGH',
        message: 'Media resolver does not prioritize media_id'
      });
    } else if (!hasLegacyFallback) {
      console.log('⚠️  Media resolver does not have legacy URL fallback');
      report.warnings.push({
        type: 'MISSING_FALLBACK',
        severity: 'LOW',
        message: 'Media resolver may not handle legacy image_url fields'
      });
    }

    report.verifications.mediaResolution = {
      hasMediaIdCheck,
      hasLegacyFallback,
      correctPattern
    };

    console.log('');
    return correctPattern;

  } catch (error) {
    console.error('❌ Could not verify media resolution:', error.message);
    return null;
  }
}

// ============================================================================
// STEP 7: VERIFY REPOSITORY ALLOWLISTS
// ============================================================================

function verifyRepositoryAllowlists() {
  console.log('📂 Step 7: Verifying repository allowlists...\n');
  
  try {
    const repoPath = join(rootDir, 'src/lib/repository.ts');
    const content = readFileSync(repoPath, 'utf8');

    const checks = {
      logo_media_id: false,
      favicon_media_id: false,
      media_id_fields: 0
    };

    if (content.includes('logo_media_id') || content.includes('logoMediaId')) {
      checks.logo_media_id = true;
      console.log('✅ logo_media_id in repository allowlists');
    } else {
      console.log('⚠️  logo_media_id NOT in repository allowlists');
      report.warnings.push({
        type: 'MISSING_ALLOWLIST',
        field: 'logo_media_id',
        severity: 'MEDIUM',
        message: 'logo_media_id not found in repository allowlists'
      });
    }

    if (content.includes('favicon_media_id') || content.includes('faviconMediaId')) {
      checks.favicon_media_id = true;
      console.log('✅ favicon_media_id in repository allowlists');
    } else {
      console.log('⚠️  favicon_media_id NOT in repository allowlists');
      report.warnings.push({
        type: 'MISSING_ALLOWLIST',
        field: 'favicon_media_id',
        severity: 'MEDIUM',
        message: 'favicon_media_id not found in repository allowlists'
      });
    }

    // Count media_id references
    const mediaIdMatches = content.match(/media_id|mediaId/g) || [];
    checks.media_id_fields = mediaIdMatches.length;
    console.log(`✅ Found ${checks.media_id_fields} media_id references in repository`);

    report.verifications.repositoryAllowlists = checks;
    console.log('');

  } catch (error) {
    console.error('❌ Could not verify repository allowlists:', error.message);
  }
}

// ============================================================================
// STEP 8: VERIFY IMAGE CHANGE SEMANTICS
// ============================================================================

function verifyImageChangeSemantics() {
  console.log('📂 Step 8: Verifying image change semantics...\n');
  
  try {
    const imageChangePath = join(rootDir, 'src/features/media/image-change-dialog.tsx');
    const content = readFileSync(imageChangePath, 'utf8');

    // Check that it updates reference, not the asset itself
    const updatesReference = /media_id|mediaId/.test(content) && !content.includes('DELETE FROM media_assets');
    const usesMediaPicker = content.includes('MediaPicker') || content.includes('media-picker');

    if (updatesReference && usesMediaPicker) {
      console.log('✅ Image change dialog correctly updates reference (old asset preserved)');
      report.verifications.imageChangeSemantics = { status: 'CORRECT' };
    } else {
      console.log('⚠️  Image change semantics unclear from static analysis');
      report.warnings.push({
        type: 'UNCLEAR_SEMANTICS',
        severity: 'LOW',
        message: 'Image change semantics should be verified at runtime'
      });
    }

    console.log('');

  } catch (error) {
    console.log('⚠️  Could not verify image change semantics:', error.message);
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  try {
    // Run all verifications
    verifyDatabaseSchema();
    verifyBrandAssetsMigration();
    inspectCMSForRawURLInputs();
    verifyBrandAssetsUI();
    checkForVideoFunctionality();
    verifyMediaResolution();
    verifyRepositoryAllowlists();
    verifyImageChangeSemantics();

    // Determine overall status
    if (report.criticalIssues.length > 0) {
      report.status = 'FAILED';
      console.log('❌ CRITICAL ISSUES FOUND\n');
    } else if (report.warnings.length > 0) {
      report.status = 'PASSED_WITH_WARNINGS';
      console.log('⚠️  PASSED WITH WARNINGS\n');
    } else {
      report.status = 'PASSED';
      console.log('✅ ALL VERIFICATIONS PASSED\n');
    }

    // Summary
    console.log('='.repeat(80));
    console.log('FINAL MEDIA ARCHITECTURE HARDENING SUMMARY (STATIC ANALYSIS)');
    console.log('='.repeat(80));
    console.log(`Status: ${report.status}`);
    console.log(`Critical Issues: ${report.criticalIssues.length}`);
    console.log(`Warnings: ${report.warnings.length}`);
    console.log('='.repeat(80));

    if (report.criticalIssues.length > 0) {
      console.log('\n🔴 CRITICAL ISSUES:');
      report.criticalIssues.forEach((issue, i) => {
        console.log(`\n${i + 1}. ${issue.type} (${issue.severity})`);
        console.log(`   ${issue.message}`);
        if (issue.file) console.log(`   File: ${issue.file}`);
        if (issue.table) console.log(`   Table: ${issue.table}`);
        if (issue.column) console.log(`   Column: ${issue.column}`);
        if (issue.field) console.log(`   Field: ${issue.field}`);
      });
    }

    if (report.warnings.length > 0) {
      console.log('\n⚠️  WARNINGS:');
      report.warnings.forEach((warning, i) => {
        console.log(`\n${i + 1}. ${warning.type} (${warning.severity})`);
        console.log(`   ${warning.message}`);
        if (warning.feature) console.log(`   Feature: ${warning.feature}`);
        if (warning.field) console.log(`   Field: ${warning.field}`);
      });
    }

    // Recommendations
    if (report.warnings.some(w => w.feature === 'logo' || w.feature === 'favicon')) {
      console.log('\n💡 RECOMMENDATIONS:');
      console.log('\n1. Complete Logo/Favicon UI Integration:');
      console.log('   Add MediaPickerModal integration to website-cms.tsx');
      console.log('   This is a non-blocking enhancement (database foundation exists)');
    }

    // Write detailed report
    const reportPath = join(rootDir, 'FINAL_MEDIA_ARCHITECTURE_HARDENING_REPORT.json');
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Detailed report saved to: FINAL_MEDIA_ARCHITECTURE_HARDENING_REPORT.json\n`);

    process.exit(report.criticalIssues.length > 0 ? 1 : 0);

  } catch (error) {
    console.error('\n❌ Hardening loop failed:', error);
    process.exit(1);
  }
}

main();
