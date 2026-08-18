#!/usr/bin/env node

/**
 * Media Relationships Discovery Script
 * 
 * Reads the schema.ts file and extracts:
 * - media_assets table definition
 * - gallery table definition
 * - menu_items table definition
 * - services table definition
 * - website_pages table definition
 * - hero_slides table definition
 * 
 * Reports:
 * - Which tables have media_id fields
 * - Which tables have image_url fields
 * - Foreign key relationships
 * - Table structure
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, '..', 'src', 'db', 'schema.ts');

console.log('='.repeat(80));
console.log('MEDIA RELATIONSHIPS DISCOVERY');
console.log('='.repeat(80));
console.log('');

// Read schema
const schema = fs.readFileSync(schemaPath, 'utf8');

// Extract table definitions
const tables = [
  'mediaAssets',
  'gallery',
  'menuItems',
  'services',
  'websitePages',
  'heroSlides',
  'menuCategories',
  'serviceCategories',
];

const findings = {};

for (const tableName of tables) {
  // Match: export const tableName = pgTable("table_name", {
  const regex = new RegExp(
    `export const ${tableName} = pgTable\\("([^"]+)",\\s*\\{([\\s\\S]*?)^\\}\\);`,
    'm'
  );
  const match = schema.match(regex);
  
  if (match) {
    const dbTableName = match[1];
    const tableContent = match[2];
    
    findings[tableName] = {
      dbName: dbTableName,
      hasMediaId: tableContent.includes('media_id'),
      hasImageUrl: tableContent.includes('image_url'),
      hasStoragePath: tableContent.includes('storage_path'),
      hasPublicUrl: tableContent.includes('public_url'),
      hasBucketPath: tableContent.includes('bucket') && tableContent.includes('path'),
      fields: [],
      foreignKeys: [],
    };
    
    // Extract field names and types
    const fieldRegex = /(\w+):\s+\w+\("([^"]+)"\)/g;
    let fieldMatch;
    while ((fieldMatch = fieldRegex.exec(tableContent)) !== null) {
      const fieldJs = fieldMatch[1];
      const fieldDb = fieldMatch[2];
      findings[tableName].fields.push({ js: fieldJs, db: fieldDb });
    }
    
    // Extract foreign keys
    const fkRegex = /references\(\(\)\s*=>\s*(\w+)\.(\w+)/g;
    let fkMatch;
    while ((fkMatch = fkRegex.exec(tableContent)) !== null) {
      const targetTable = fkMatch[1];
      const targetField = fkMatch[2];
      findings[tableName].foreignKeys.push({ table: targetTable, field: targetField });
    }
  }
}

// Report findings
console.log('TABLE STRUCTURE FINDINGS');
console.log('-'.repeat(80));
console.log('');

for (const [key, data] of Object.entries(findings)) {
  console.log(`\n📋 ${key} (${data.dbName})`);
  console.log('─'.repeat(60));
  
  console.log(`  Media ID field: ${data.hasMediaId ? '✅ YES' : '❌ NO'}`);
  console.log(`  Image URL field: ${data.hasImageUrl ? '✅ YES' : '❌ NO'}`);
  console.log(`  Storage path: ${data.hasStoragePath ? '✅ YES' : '❌ NO'}`);
  console.log(`  Public URL: ${data.hasPublicUrl ? '✅ YES' : '❌ NO'}`);
  
  if (data.foreignKeys.length > 0) {
    console.log(`  Foreign Keys: ${data.foreignKeys.length}`);
    data.foreignKeys.forEach(fk => {
      console.log(`    - → ${fk.table}.${fk.field}`);
    });
  } else {
    console.log(`  Foreign Keys: None`);
  }
  
  console.log(`  Total Fields: ${data.fields.length}`);
  if (data.fields.length > 0 && data.fields.length <= 15) {
    console.log(`  Fields:`);
    data.fields.forEach(f => console.log(`    - ${f.js} (${f.db})`));
  }
}

console.log('\n');
console.log('='.repeat(80));
console.log('RELATIONSHIP MATRIX');
console.log('='.repeat(80));
console.log('');

console.log('Media References in CMS Tables:');
console.log('');
console.log('| Table | media_id | image_url | storage_path | public_url | FK to media_assets |');
console.log('|-------|----------|-----------|--------------|------------|--------------------|');

for (const tableName of ['menuItems', 'gallery', 'services', 'websitePages', 'heroSlides']) {
  const data = findings[tableName];
  if (data) {
    const hasMediaId = data.hasMediaId ? '✅' : '❌';
    const hasImageUrl = data.hasImageUrl ? '✅' : '❌';
    const hasStoragePath = data.hasStoragePath ? '✅' : '❌';
    const hasPublicUrl = data.hasPublicUrl ? '✅' : '❌';
    const mediaFk = data.foreignKeys.some(fk => fk.table === 'mediaAssets') ? '✅' : '❌';
    
    console.log(`| ${tableName} | ${hasMediaId} | ${hasImageUrl} | ${hasStoragePath} | ${hasPublicUrl} | ${mediaFk} |`);
  }
}

console.log('');
console.log('Media Assets Table:');
console.log('');
const mediaAssets = findings.mediaAssets;
if (mediaAssets) {
  console.log(`| Aspect | Status |`);
  console.log(`|--------|--------|`);
  console.log(`| Table exists | ✅ |`);
  console.log(`| Fields: ${mediaAssets.fields.length} | ${mediaAssets.fields.length > 0 ? '✅' : '❌'} |`);
  console.log(`| Has image_url | ${mediaAssets.hasImageUrl ? '✅' : '❌'} |`);
  console.log(`| Has storage_path | ${mediaAssets.hasStoragePath ? '✅' : '❌'} |`);
  console.log(`| Has public_url | ${mediaAssets.hasPublicUrl ? '✅' : '❌'} |`);
}

console.log('');
console.log('='.repeat(80));
console.log('DISCOVERY COMPLETE');
console.log('='.repeat(80));
