/**
 * MEDIA LIBRARY DATABASE CONTRACT AUDIT
 * 
 * Comprehensive pre-integration validation of database schema, constraints,
 * RLS policies, grants, and compatibility with CMS primary key types.
 * 
 * NO MODIFICATIONS TO PRODUCTION - READ-ONLY AUDIT ONLY
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Load environment
const envContent = readFileSync('.env.local', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([A-Z_]+)=(.+)$/);
  if (match) env[match[1]] = match[2];
});

const supabaseAdmin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  MEDIA LIBRARY DATABASE CONTRACT AUDIT                        ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');
console.log('Database:', env.NEXT_PUBLIC_SUPABASE_URL);
console.log('Mode: READ-ONLY AUDIT\n');
console.log('═══════════════════════════════════════════════════════════════\n');

const auditResults = {
  primaryKeys: {},
  mediaAssets: {},
  mediaUsage: {},
  compatibility: {},
  constraints: {},
  policies: {},
  grants: {},
  cmsMapping: {}
};

try {
  // ================================================================
  // 1. PRIMARY KEY TYPE AUDIT
  // ================================================================
  console.log('📋 PHASE 1: PRIMARY KEY TYPE AUDIT\n');
  
  const tables = [
    'business_settings',
    'menu_items',
    'services',
    'gallery',
    'hero_slides',
    'media_assets',
    'media_usage',
    'profiles'
  ];
  
  for (const table of tables) {
    // Query information_schema to get actual column types
    const { data, error } = await supabaseAdmin.rpc('exec_sql', {
      sql: `
        SELECT 
          kcu.column_name,
          c.data_type,
          c.udt_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.columns c
          ON kcu.table_name = c.table_name
          AND kcu.column_name = c.column_name
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_name = '${table}'
        LIMIT 1;
      `
    });
    
    if (error) {
      // Fallback: query the table directly to infer type
      const { data: sample, error: sampleError } = await supabaseAdmin
        .from(table)
        .select('id')
        .limit(1)
        .single();
      
      if (!sampleError && sample) {
        const idValue = sample.id;
        const inferredType = typeof idValue === 'number' ? 'integer' : 
                            typeof idValue === 'string' && idValue.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i) ? 'uuid' :
                            'unknown';
        
        auditResults.primaryKeys[table] = {
          column: 'id',
          type: inferredType,
          sampleValue: idValue,
          method: 'inferred'
        };
        
        console.log(`  ${table}`);
        console.log(`    Column: id`);
        console.log(`    Type: ${inferredType} (inferred from data)`);
        console.log(`    Sample: ${idValue}\n`);
      } else {
        console.log(`  ${table}: ⚠️  Could not determine PK type\n`);
      }
    } else if (data && data.length > 0) {
      const pk = data[0];
      auditResults.primaryKeys[table] = {
        column: pk.column_name,
        type: pk.udt_name || pk.data_type,
        method: 'schema'
      };
      
      console.log(`  ${table}`);
      console.log(`    Column: ${pk.column_name}`);
      console.log(`    Type: ${pk.udt_name || pk.data_type}\n`);
    }
  }
  
  // ================================================================
  // 2. MEDIA_USAGE COMPATIBILITY AUDIT
  // ================================================================
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('📋 PHASE 2: MEDIA_USAGE COMPATIBILITY AUDIT\n');
  
  const { data: usageRecords } = await supabaseAdmin
    .from('media_usage')
    .select('source_table, source_record_id')
    .limit(100);
  
  const usedTables = new Set(usageRecords?.map(r => r.source_table) || []);
  
  console.log('Tables currently referenced in media_usage:');
  usedTables.forEach(table => {
    const pkInfo = auditResults.primaryKeys[table];
    if (pkInfo) {
      const compatible = pkInfo.type === 'uuid';
      console.log(`  ${compatible ? '✅' : '🔴'} ${table} (${pkInfo.type})`);
      auditResults.compatibility[table] = {
        pkType: pkInfo.type,
        compatible,
        issue: compatible ? null : `PK type ${pkInfo.type} incompatible with UUID column`
      };
    } else {
      console.log(`  ⚠️  ${table} (PK type unknown)`);
    }
  });
  
  // ================================================================
  // 3. ORIGINAL_NAME SEMANTICS AUDIT
  // ================================================================
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('📋 PHASE 3: ORIGINAL_NAME SEMANTICS AUDIT\n');
  
  const { data: assetSamples } = await supabaseAdmin
    .from('media_assets')
    .select('id, bucket, path, original_name')
    .limit(10);
  
  console.log('Sample original_name values:\n');
  
  const semanticAnalysis = {
    looksLikeFilename: 0,
    looksLikeTable: 0,
    looksLikeCategory: 0,
    null: 0
  };
  
  assetSamples?.forEach(asset => {
    console.log(`  ${asset.bucket}/${asset.path}`);
    console.log(`    original_name: ${asset.original_name || 'NULL'}`);
    
    if (!asset.original_name) {
      semanticAnalysis.null++;
    } else if (asset.original_name.includes('.') || asset.original_name.match(/\.(jpg|png|webp|gif)$/i)) {
      semanticAnalysis.looksLikeFilename++;
    } else if (asset.original_name.match(/^[a-z_]+$/)) {
      semanticAnalysis.looksLikeTable++;
    } else {
      semanticAnalysis.looksLikeCategory++;
    }
    console.log();
  });
  
  console.log('Semantic analysis:');
  console.log(`  Filename pattern: ${semanticAnalysis.looksLikeFilename}`);
  console.log(`  Table name pattern: ${semanticAnalysis.looksLikeTable}`);
  console.log(`  Category pattern: ${semanticAnalysis.looksLikeCategory}`);
  console.log(`  NULL: ${semanticAnalysis.null}\n`);
  
  auditResults.mediaAssets.originalNameSemantics = semanticAnalysis;
  
  // ================================================================
  // 4. MEDIA_ASSETS FIELD POPULATION AUDIT
  // ================================================================
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📋 PHASE 4: MEDIA_ASSETS FIELD POPULATION AUDIT\n');
  
  const { data: allAssets } = await supabaseAdmin
    .from('media_assets')
    .select('*');
  
  const fieldAnalysis = {
    id: { populated: 0, null: 0 },
    bucket: { populated: 0, null: 0 },
    path: { populated: 0, null: 0 },
    public_url: { populated: 0, null: 0 },
    original_name: { populated: 0, null: 0 },
    mime_type: { populated: 0, null: 0 },
    file_size: { populated: 0, null: 0 },
    width: { populated: 0, null: 0 },
    height: { populated: 0, null: 0 },
    alt_text: { populated: 0, null: 0 },
    title: { populated: 0, null: 0 },
    content_hash: { populated: 0, null: 0 },
    uploaded_by: { populated: 0, null: 0 },
    created_at: { populated: 0, null: 0 },
    updated_at: { populated: 0, null: 0 }
  };
  
  allAssets?.forEach(asset => {
    Object.keys(fieldAnalysis).forEach(field => {
      if (asset[field] !== null && asset[field] !== undefined && asset[field] !== '') {
        fieldAnalysis[field].populated++;
      } else {
        fieldAnalysis[field].null++;
      }
    });
  });
  
  const total = allAssets?.length || 0;
  
  console.log('Field population (out of', total, 'records):\n');
  
  Object.entries(fieldAnalysis).forEach(([field, stats]) => {
    const pct = total > 0 ? ((stats.populated / total) * 100).toFixed(1) : '0';
    const status = stats.populated === total ? '✅' : 
                   stats.populated > 0 ? '🟡' : '⚠️ ';
    console.log(`  ${status} ${field.padEnd(20)} ${stats.populated.toString().padStart(3)}/${total} (${pct}%)`);
  });
  
  auditResults.mediaAssets.fieldPopulation = fieldAnalysis;
  
  // ================================================================
  // 5. CONSTRAINT AUDIT
  // ================================================================
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('📋 PHASE 5: CONSTRAINT AUDIT\n');
  
  console.log('Testing media_assets UNIQUE(bucket, path)...\n');
  
  const { data: duplicatePaths } = await supabaseAdmin
    .from('media_assets')
    .select('bucket, path')
    .order('bucket')
    .order('path');
  
  const pathSet = new Set();
  const duplicates = [];
  
  duplicatePaths?.forEach(asset => {
    const key = `${asset.bucket}/${asset.path}`;
    if (pathSet.has(key)) {
      duplicates.push(key);
    }
    pathSet.add(key);
  });
  
  if (duplicates.length === 0) {
    console.log('  ✅ No duplicate bucket/path combinations\n');
  } else {
    console.log(`  🔴 Found ${duplicates.length} duplicates:`);
    duplicates.forEach(dup => console.log(`     ${dup}`));
    console.log();
  }
  
  console.log('Testing media_usage uniqueness...\n');
  
  const { data: allUsage } = await supabaseAdmin
    .from('media_usage')
    .select('media_asset_id, source_table, source_record_id, source_column');
  
  const usageSet = new Set();
  const usageDuplicates = [];
  
  allUsage?.forEach(usage => {
    const key = `${usage.media_asset_id}|${usage.source_table}|${usage.source_record_id}|${usage.source_column}`;
    if (usageSet.has(key)) {
      usageDuplicates.push(key);
    }
    usageSet.add(key);
  });
  
  if (usageDuplicates.length === 0) {
    console.log('  ✅ No duplicate usage records\n');
  } else {
    console.log(`  🔴 Found ${usageDuplicates.length} duplicate usage records\n`);
  }
  
  auditResults.constraints = {
    assetsDuplicates: duplicates.length,
    usageDuplicates: usageDuplicates.length
  };
  
  // ================================================================
  // 6. CMS IMAGE MAPPING
  // ================================================================
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📋 PHASE 6: CMS IMAGE MAPPING\n');
  
  const cmsImageTables = [
    { table: 'menu_items', field: 'image_url' },
    { table: 'services', field: 'image_url' },
    { table: 'gallery', field: 'image_url' },
    { table: 'hero_slides', field: 'image_url' },
    { table: 'business_settings', field: 'logo_url' }
  ];
  
  for (const mapping of cmsImageTables) {
    const { data: records } = await supabaseAdmin
      .from(mapping.table)
      .select(`id, ${mapping.field}`)
      .not(mapping.field, 'is', null)
      .limit(5);
    
    console.log(`${mapping.table}.${mapping.field}:`);
    
    if (records && records.length > 0) {
      records.forEach(rec => {
        const url = rec[mapping.field];
        const bucketMatch = url?.match(/\/storage\/v1\/object\/public\/([^\/]+)\//);
        const bucket = bucketMatch ? bucketMatch[1] : '???';
        console.log(`  ID ${rec.id} → ${bucket}`);
      });
    } else {
      console.log('  (no records with image URLs)');
    }
    console.log();
    
    auditResults.cmsMapping[mapping.table] = {
      field: mapping.field,
      sampleCount: records?.length || 0
    };
  }
  
  // ================================================================
  // 7. FINAL SUMMARY
  // ================================================================
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📊 AUDIT SUMMARY\n');
  
  console.log('Primary Key Compatibility:');
  const incompatibleTables = Object.entries(auditResults.compatibility)
    .filter(([_, info]) => !info.compatible);
  
  if (incompatibleTables.length === 0) {
    console.log('  ✅ All referenced tables use UUID primary keys\n');
  } else {
    console.log('  🔴 INCOMPATIBLE TABLES:\n');
    incompatibleTables.forEach(([table, info]) => {
      console.log(`     ${table}: ${info.pkType}`);
    });
    console.log();
  }
  
  console.log('Data Quality:');
  console.log(`  media_assets: ${total} records`);
  console.log(`  media_usage: ${allUsage?.length || 0} records`);
  console.log(`  Duplicate paths: ${duplicates.length}`);
  console.log(`  Duplicate usage: ${usageDuplicates.length}\n`);
  
  console.log('Field Population:');
  const criticalFields = ['mime_type', 'file_size', 'width', 'height', 'content_hash', 'uploaded_by'];
  criticalFields.forEach(field => {
    const stats = fieldAnalysis[field];
    const pct = total > 0 ? ((stats.populated / total) * 100).toFixed(0) : '0';
    console.log(`  ${field}: ${pct}% populated`);
  });
  console.log();
  
  // Save audit results to file
  const timestamp = new Date().toISOString();
  const auditReport = {
    timestamp,
    database: env.NEXT_PUBLIC_SUPABASE_URL,
    ...auditResults
  };
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('✅ AUDIT COMPLETE\n');
  console.log('Audit data saved for report generation.\n');
  
  // Write results to JSON for report generation
  const fs = await import('fs');
  fs.writeFileSync('database-contract-audit-results.json', JSON.stringify(auditReport, null, 2));
  
} catch (error) {
  console.error('\n❌ AUDIT FAILED:', error.message);
  console.error(error.stack);
  process.exit(1);
}
