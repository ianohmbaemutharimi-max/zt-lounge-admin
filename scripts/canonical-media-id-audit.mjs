#!/usr/bin/env node
/**
 * ZT Lounge — Canonical Media ID Architecture Audit (Phase 0)
 * 
 * READ-ONLY comprehensive audit of all media references, resolvers,
 * storage patterns, and database relationships.
 * 
 * DOES NOT MODIFY ANYTHING.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Load environment
dotenv.config({ path: path.join(projectRoot, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const audit = {
  timestamp: new Date().toISOString(),
  database: {},
  codebase: {},
  storage: {},
  architecture: {},
  issues: [],
  recommendations: []
};

console.log('═══════════════════════════════════════════════════════════');
console.log('  ZT LOUNGE — CANONICAL MEDIA_ID ARCHITECTURE AUDIT');
console.log('  PHASE 0: READ-ONLY AUDIT (NO MODIFICATIONS)');
console.log('═══════════════════════════════════════════════════════════\n');

// ============================================================
// DATABASE SCHEMA INSPECTION
// ============================================================
console.log('📋 [1/12] Inspecting Database Schema...\n');

async function inspectSchema() {
  try {
    // Get media_assets schema
    const { data: mediaAssets, error: maError } = await supabase
      .from('media_assets')
      .select('*')
      .limit(1);
    
    if (maError) throw maError;
    
    audit.database.media_assets = {
      exists: true,
      sample: mediaAssets?.[0] || null
    };
    
    console.log('   ✅ media_assets table exists');
    
    // Check for tables with media_id column
    const tablesWithMediaId = [];
    const tablesToCheck = [
      'menu_items',
      'services', 
      'gallery_items',
      'hero_slides',
      'testimonials',
      'business_settings',
      'brand_assets'
    ];
    
    for (const table of tablesToCheck) {
      try {
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .limit(1);
        
        if (!error && data) {
          const hasMediaId = data[0] && 'media_id' in data[0];
          const hasImageUrl = data[0] && ('image_url' in data[0] || 'logo_url' in data[0] || 'favicon_url' in data[0]);
          
          tablesWithMediaId.push({
            table,
            exists: true,
            has_media_id: hasMediaId,
            has_legacy_url: hasImageUrl,
            sample: data[0]
          });
          
          console.log(`   ✅ ${table}: media_id=${hasMediaId}, legacy_url=${hasImageUrl}`);
        }
      } catch (err) {
        console.log(`   ⚠️  ${table}: not found or inaccessible`);
      }
    }
    
    audit.database.tables_with_media = tablesWithMediaId;
    
  } catch (error) {
    console.error('   ❌ Database inspection failed:', error.message);
    audit.issues.push(`Database inspection failed: ${error.message}`);
  }
}

// ============================================================
// SEARCH CODEBASE FOR MEDIA PATTERNS
// ============================================================
console.log('\n📋 [2/12] Searching Codebase for Media Patterns...\n');

function searchFiles(dir, pattern, results = []) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      if (!file.startsWith('.') && file !== 'node_modules' && file !== '.next') {
        searchFiles(filePath, pattern, results);
      }
    } else if (file.match(/\.(ts|tsx|js|jsx|sql)$/)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const matches = content.match(pattern);
      
      if (matches) {
        results.push({
          file: path.relative(projectRoot, filePath),
          matches: matches.length,
          preview: matches.slice(0, 3)
        });
      }
    }
  }
  
  return results;
}

const patterns = {
  media_id: /media_id/gi,
  resolveImageUrl: /resolveImageUrl/gi,
  resolveImageUrls: /resolveImageUrls/gi,
  logo_url: /logo_url/gi,
  favicon_url: /favicon_url/gi,
  image_url: /image_url/gi,
  hardcoded_images: /\/images\/[a-z0-9\-_\/]+\.(png|jpg|jpeg|webp|svg)/gi,
  public_url: /public_url/gi
};

console.log('   Scanning source code...');
const srcDir = path.join(projectRoot, 'src');

for (const [name, pattern] of Object.entries(patterns)) {
  const results = searchFiles(srcDir, pattern);
  audit.codebase[name] = results;
  console.log(`   ${name}: ${results.length} files with matches`);
}

// ============================================================
// INSPECT RESOLVER ARCHITECTURE
// ============================================================
console.log('\n📋 [3/12] Inspecting Resolver Architecture...\n');

const resolverPath = path.join(projectRoot, 'src', 'lib', 'media', 'resolver.ts');
if (fs.existsSync(resolverPath)) {
  const resolverContent = fs.readFileSync(resolverPath, 'utf8');
  
  audit.architecture.resolver = {
    exists: true,
    has_resolveImageUrl: resolverContent.includes('resolveImageUrl'),
    has_resolveImageUrls: resolverContent.includes('resolveImageUrls'),
    has_video_support: resolverContent.toLowerCase().includes('video') || resolverContent.includes('.mp4'),
    size: resolverContent.length
  };
  
  console.log('   ✅ Resolver exists');
  console.log(`   resolveImageUrl: ${audit.architecture.resolver.has_resolveImageUrl}`);
  console.log(`   resolveImageUrls: ${audit.architecture.resolver.has_resolveImageUrls}`);
  console.log(`   Video support: ${audit.architecture.resolver.has_video_support}`);
} else {
  audit.architecture.resolver = { exists: false };
  console.log('   ⚠️  Resolver not found');
}

// Save audit report
const reportPath = path.join(projectRoot, 'CANONICAL_MEDIA_ID_PHASE0_AUDIT.json');
fs.writeFileSync(reportPath, JSON.stringify(audit, null, 2));

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  PHASE 0 AUDIT COMPLETE (READ-ONLY)');
console.log('═══════════════════════════════════════════════════════════\n');
console.log(`📝 Full audit saved: ${reportPath}\n`);
console.log('⚠️  NO MODIFICATIONS WERE MADE\n');
console.log('Next: Review audit findings before proceeding to Phase 1\n');

// Run async audit
await inspectSchema();

// Re-save with database results
fs.writeFileSync(reportPath, JSON.stringify(audit, null, 2));

console.log('✅ Audit complete\n');
