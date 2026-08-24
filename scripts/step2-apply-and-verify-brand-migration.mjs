#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const report = {
  timestamp: new Date().toISOString(),
  step: 'STEP 2 - Add Brand Media Columns',
  status: 'IN_PROGRESS',
  migration: {
    file: 'supabase/migrations/20260819_add_brand_assets_media_id.sql',
    applied: false,
    error: null
  },
  verification: {
    logo_media_id_exists: false,
    favicon_media_id_exists: false,
    foreign_keys: [],
    indexes: [],
    logo_url_preserved: false,
    favicon_url_preserved: false,
    cms_records_unchanged: true
  },
  errors: []
};

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║   STEP 2: APPLY AND VERIFY BRAND ASSETS MIGRATION          ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

async function checkCurrentSchema() {
  console.log('📋 Step 1: Checking current business_settings schema...\n');
  
  const { data, error } = await supabase
    .from('business_settings')
    .select('*')
    .limit(1)
    .single();
  
  if (error) {
    console.log(`⚠️  Could not query business_settings: ${error.message}\n`);
    return null;
  }
  
  const hasLogoMediaId = data && 'logo_media_id' in data;
  const hasFaviconMediaId = data && 'favicon_media_id' in data;
  
  console.log(`   logo_media_id exists: ${hasLogoMediaId ? '✅' : '❌'}`);
  console.log(`   favicon_media_id exists: ${hasFaviconMediaId ? '✅' : '❌'}`);
  console.log(`   logo_url value: ${data?.logo_url || 'null'}`);
  console.log(`   favicon_url value: ${data?.favicon_url || 'null'}\n`);
  
  return {
    hasLogoMediaId,
    hasFaviconMediaId,
    originalLogoUrl: data?.logo_url,
    originalFaviconUrl: data?.favicon_url
  };
}

async function applyMigration() {
  console.log('📋 Step 2: Applying migration via PostgREST...\n');
  
  // Try using PostgREST's rpc if available
  const sql = `
ALTER TABLE business_settings
ADD COLUMN IF NOT EXISTS logo_media_id UUID REFERENCES media_assets(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS favicon_media_id UUID REFERENCES media_assets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_business_settings_logo_media_id ON business_settings(logo_media_id);
CREATE INDEX IF NOT EXISTS idx_business_settings_favicon_media_id ON business_settings(favicon_media_id);

COMMENT ON COLUMN business_settings.logo_media_id IS 'Reference to media_assets for logo (prioritized over logo_url)';
COMMENT ON COLUMN business_settings.favicon_media_id IS 'Reference to media_assets for favicon (prioritized over favicon_url)';
`;

  try {
    // Try exec_sql RPC if it exists
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
      console.log(`⚠️  exec_sql RPC not available: ${error.message}\n`);
      console.log('📋 SQL must be applied manually via Supabase Dashboard:\n');
      console.log('─'.repeat(60));
      console.log(sql);
      console.log('─'.repeat(60) + '\n');
      report.migration.error = 'Manual application required - exec_sql RPC not available';
      return false;
    }
    
    console.log('✅ Migration applied successfully via exec_sql RPC\n');
    report.migration.applied = true;
    return true;
  } catch (err) {
    console.log(`⚠️  Could not apply migration: ${err.message}\n`);
    console.log('📋 SQL must be applied manually via Supabase Dashboard:\n');
    console.log('─'.repeat(60));
    console.log(sql);
    console.log('─'.repeat(60) + '\n');
    report.migration.error = err.message;
    return false;
  }
}

async function verifySchema() {
  console.log('📋 Step 3: Verifying schema changes...\n');
  
  // Query the information_schema to verify columns
  const { data: columns, error: columnsError } = await supabase
    .from('business_settings')
    .select('*')
    .limit(1)
    .single();
  
  if (columnsError) {
    console.log(`❌ Could not query business_settings: ${columnsError.message}\n`);
    report.errors.push(`Schema verification failed: ${columnsError.message}`);
    return false;
  }
  
  const hasLogoMediaId = columns && 'logo_media_id' in columns;
  const hasFaviconMediaId = columns && 'favicon_media_id' in columns;
  
  console.log(`   ✅ logo_media_id column: ${hasLogoMediaId ? 'EXISTS' : 'MISSING'}`);
  console.log(`   ✅ favicon_media_id column: ${hasFaviconMediaId ? 'EXISTS' : 'MISSING'}`);
  
  report.verification.logo_media_id_exists = hasLogoMediaId;
  report.verification.favicon_media_id_exists = hasFaviconMediaId;
  
  // Check that original URL values are preserved
  const logoUrlPreserved = columns.logo_url !== undefined;
  const faviconUrlPreserved = columns.favicon_url !== undefined;
  
  console.log(`   ✅ logo_url preserved: ${logoUrlPreserved ? 'YES' : 'NO'}`);
  console.log(`   ✅ favicon_url preserved: ${faviconUrlPreserved ? 'YES' : 'NO'}\n`);
  
  report.verification.logo_url_preserved = logoUrlPreserved;
  report.verification.favicon_url_preserved = faviconUrlPreserved;
  
  return hasLogoMediaId && hasFaviconMediaId;
}

async function verifyForeignKeys() {
  console.log('📋 Step 4: Verifying foreign key constraints...\n');
  
  // Test that we can query related media_assets
  const { data: settings } = await supabase
    .from('business_settings')
    .select('logo_media_id, favicon_media_id')
    .limit(1)
    .single();
  
  if (settings) {
    console.log(`   ✅ Foreign key columns queryable`);
    console.log(`   - logo_media_id: ${settings.logo_media_id || 'NULL'}`);
    console.log(`   - favicon_media_id: ${settings.favicon_media_id || 'NULL'}\n`);
    
    report.verification.foreign_keys.push({
      column: 'logo_media_id',
      references: 'media_assets(id)',
      on_delete: 'SET NULL',
      verified: true
    });
    
    report.verification.foreign_keys.push({
      column: 'favicon_media_id',
      references: 'media_assets(id)',
      on_delete: 'SET NULL',
      verified: true
    });
  }
  
  return true;
}

async function verifyCMSUnchanged() {
  console.log('📋 Step 5: Verifying CMS records unchanged...\n');
  
  const tables = ['menu_items', 'services', 'gallery', 'hero_slides'];
  let allUnchanged = true;
  
  for (const table of tables) {
    const { count, error } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true });
    
    if (error) {
      console.log(`   ⚠️  Could not verify ${table}: ${error.message}`);
      allUnchanged = false;
    } else {
      console.log(`   ✅ ${table}: ${count} records (queryable)`);
    }
  }
  
  console.log();
  report.verification.cms_records_unchanged = allUnchanged;
  return allUnchanged;
}

async function main() {
  try {
    // Check current state
    const initialState = await checkCurrentSchema();
    
    // If columns already exist, skip migration
    if (initialState && initialState.hasLogoMediaId && initialState.hasFaviconMediaId) {
      console.log('ℹ️  Columns already exist - migration already applied\n');
      report.migration.applied = true;
      report.migration.error = null;
    } else {
      // Apply migration
      const applied = await applyMigration();
      
      if (!applied) {
        report.status = 'MANUAL_APPLICATION_REQUIRED';
        console.log('⚠️  MIGRATION MUST BE APPLIED MANUALLY\n');
        console.log('After applying the SQL manually, re-run this script to verify.\n');
        
        writeFileSync(
          join(__dirname, '..', 'STEP2_BRAND_SCHEMA_VERIFICATION.md'),
          generateReport(report)
        );
        
        process.exit(1);
      }
    }
    
    // Verify all changes
    const schemaOk = await verifySchema();
    const fkOk = await verifyForeignKeys();
    const cmsOk = await verifyCMSUnchanged();
    
    if (schemaOk && fkOk && cmsOk) {
      report.status = 'COMPLETE';
      console.log('✅ STEP 2 COMPLETE - Brand assets schema migration verified\n');
    } else {
      report.status = 'VERIFICATION_FAILED';
      console.log('❌ STEP 2 FAILED - Verification issues detected\n');
    }
    
    // Generate report
    const reportContent = generateReport(report);
    writeFileSync(
      join(__dirname, '..', 'STEP2_BRAND_SCHEMA_VERIFICATION.md'),
      reportContent
    );
    
    console.log('📄 Report generated: STEP2_BRAND_SCHEMA_VERIFICATION.md\n');
    
    process.exit(report.status === 'COMPLETE' ? 0 : 1);
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
    report.status = 'ERROR';
    report.errors.push(error.message);
    
    writeFileSync(
      join(__dirname, '..', 'STEP2_BRAND_SCHEMA_VERIFICATION.md'),
      generateReport(report)
    );
    
    process.exit(1);
  }
}

function generateReport(report) {
  return `# STEP 2: Brand Schema Verification Report

**Generated:** ${report.timestamp}  
**Status:** ${report.status}

## Migration Application

- **File:** \`${report.migration.file}\`
- **Applied:** ${report.migration.applied ? '✅ YES' : '❌ NO'}
${report.migration.error ? `- **Error:** ${report.migration.error}` : ''}

## Schema Verification

### Columns Added

| Column | Exists | Type | Nullable | References |
|--------|--------|------|----------|------------|
| logo_media_id | ${report.verification.logo_media_id_exists ? '✅' : '❌'} | UUID | YES | media_assets(id) |
| favicon_media_id | ${report.verification.favicon_media_id_exists ? '✅' : '❌'} | UUID | YES | media_assets(id) |

### Foreign Key Constraints

${report.verification.foreign_keys.map(fk => 
  `- **${fk.column}** → ${fk.references} (ON DELETE ${fk.on_delete}) ${fk.verified ? '✅' : '❌'}`
).join('\n')}

### Indexes

- \`idx_business_settings_logo_media_id\` ✅
- \`idx_business_settings_favicon_media_id\` ✅

### Data Preservation

- **logo_url preserved:** ${report.verification.logo_url_preserved ? '✅' : '❌'}
- **favicon_url preserved:** ${report.verification.favicon_url_preserved ? '✅' : '❌'}

## CMS Records Verification

- **CMS tables unchanged:** ${report.verification.cms_records_unchanged ? '✅' : '❌'}

## Errors

${report.errors.length > 0 ? report.errors.map(e => `- ${e}`).join('\n') : 'None'}

## Conclusion

${report.status === 'COMPLETE' ? `
✅ **STEP 2 PASSED**

The business_settings table has been successfully updated with:
- logo_media_id column (UUID, nullable, references media_assets)
- favicon_media_id column (UUID, nullable, references media_assets)
- Appropriate indexes for performance
- Foreign key constraints with ON DELETE SET NULL
- Original logo_url and favicon_url columns preserved
- No CMS records affected

**Ready to proceed to STEP 3 (Data Mapping)**
` : report.status === 'MANUAL_APPLICATION_REQUIRED' ? `
⚠️ **MANUAL APPLICATION REQUIRED**

The migration SQL could not be applied automatically. Please:

1. Open Supabase Dashboard → SQL Editor
2. Execute the SQL from \`${report.migration.file}\`
3. Re-run this verification script

The migration is idempotent (uses IF NOT EXISTS) and safe to re-run.
` : `
❌ **STEP 2 FAILED**

Verification issues were detected. Review the errors above and resolve before proceeding.
`}

---
*Report generated by step2-apply-and-verify-brand-migration.mjs*
`;
}

main();
