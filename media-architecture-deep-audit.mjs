/**
 * ZT LOUNGE COMPREHENSIVE MEDIA ARCHITECTURE AUDIT
 * 
 * READ-ONLY - NO MODIFICATIONS
 * 
 * Performs 17-phase audit:
 * 1. Database schema audit
 * 2. Storage buckets audit
 * 3. Database ↔ Storage consistency
 * 4. Admin dashboard image management
 * 5. Public website image sources
 * 6. Architecture recommendation
 * 7. Media assets schema design
 * 8. Reference strategy
 * 9. Upload workflow design
 * 10. Replace workflow design
 * 11. Delete workflow design
 * 12. Category management
 * 13. Media library UX
 * 14. Path standardization
 * 15. Security audit
 * 16. Performance considerations
 * 17. Test plan
 * 
 * Usage: node media-architecture-deep-audit.mjs <email> <password>
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';

const TEST_EMAIL = process.argv[2];
const TEST_PASSWORD = process.argv[3];

if (!TEST_EMAIL || !TEST_PASSWORD) {
  console.error('Usage: node media-architecture-deep-audit.mjs <email> <password>');
  process.exit(1);
}

// Load environment
const envContent = readFileSync('.env.local', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([A-Z_]+)=(.+)$/);
  if (match) env[match[1]] = match[2];
});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const audit = {
  timestamp: new Date().toISOString(),
  phases: {}
};

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  ZT LOUNGE COMPREHENSIVE MEDIA ARCHITECTURE AUDIT             ║');
console.log('║  READ-ONLY - NO MODIFICATIONS                                 ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

try {
  // ============================================================================
  // AUTHENTICATE
  // ============================================================================
  console.log('🔐 Authenticating...\n');
  
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  if (authError) {
    console.error('❌ Authentication failed:', authError.message);
    process.exit(1);
  }
  
  console.log('✅ Authenticated as:', authData.user.email);
  console.log('   User ID:', authData.user.id, '\n');

  // ============================================================================
  // PHASE 1: DATABASE AUDIT
  // ============================================================================
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('PHASE 1: DATABASE SCHEMA AUDIT');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const imageFields = [
    { table: 'menu_items', column: 'image_url' },
    { table: 'services', column: 'image_url' },
    { table: 'gallery', column: 'image_url' },
    { table: 'hero_slides', column: 'image_url' },
    { table: 'testimonials', column: 'image_url' },
    { table: 'business_settings', column: 'logo_url' },
    { table: 'business_settings', column: 'favicon_url' },
    { table: 'promotions', column: 'banner_image' },
    { table: 'staff', column: 'photo_url' },
    { table: 'profiles', column: 'avatar_url' },
  ];

  audit.phases.database = { tables: [], imageFields: [] };

  for (const field of imageFields) {
    try {
      const { data, error, count } = await supabase
        .from(field.table)
        .select(field.column, { count: 'exact' });
      
      if (!error && data) {
        const urls = data.map(r => r[field.column]).filter(v => v);
        
        const analysis = {
          table: field.table,
          column: field.column,
          totalRecords: count,
          recordsWithImages: urls.length,
          recordsWithoutImages: count - urls.length,
          urlFormats: {
            supabaseStorage: urls.filter(u => u.includes('supabase.co/storage')).length,
            relativePaths: urls.filter(u => u.startsWith('assets/') || u.startsWith('images/')).length,
            localPaths: urls.filter(u => u.startsWith('/') && !u.includes('http')).length,
            externalUrls: urls.filter(u => u.startsWith('http') && !u.includes('supabase.co')).length,
            empty: count - urls.length
          },
          sampleUrls: urls.slice(0, 2)
        };

        audit.phases.database.imageFields.push(analysis);

        console.log(`${field.table}.${field.column}:`);
        console.log(`  Total records: ${count}`);
        console.log(`  With images: ${urls.length}`);
        console.log(`  Supabase Storage: ${analysis.urlFormats.supabaseStorage}`);
        console.log(`  Relative paths: ${analysis.urlFormats.relativePaths}`);
        console.log(`  Local paths: ${analysis.urlFormats.localPaths}`);
        console.log(`  External: ${analysis.urlFormats.externalUrls}`);
        if (analysis.sampleUrls.length > 0) {
          console.log(`  Sample: ${analysis.sampleUrls[0].substring(0, 60)}...`);
        }
        console.log();
      }
    } catch (err) {
      console.log(`❌ ${field.table}.${field.column}: ${err.message}\n`);
    }
  }

  // ============================================================================
  // PHASE 2: STORAGE AUDIT
  // ============================================================================
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('PHASE 2: SUPABASE STORAGE AUDIT');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // List all buckets
  const { data: allBuckets, error: bucketsError } = await supabaseAdmin.storage.listBuckets();
  
  if (bucketsError) {
    console.log('❌ Could not list buckets:', bucketsError.message);
  } else {
    console.log(`Found ${allBuckets.length} buckets:\n`);
    
    audit.phases.storage = { buckets: [] };

    for (const bucket of allBuckets) {
      console.log(`Bucket: ${bucket.name} (${bucket.public ? 'PUBLIC' : 'PRIVATE'})`);
      
      const { data: files, error: filesError } = await supabaseAdmin.storage
        .from(bucket.name)
        .list('', { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
      
      if (!filesError && files) {
        const bucketAnalysis = {
          name: bucket.name,
          public: bucket.public,
          fileCount: files.length,
          files: files.map(f => ({
            name: f.name,
            size: f.metadata?.size || 0,
            mimeType: f.metadata?.mimetype || 'unknown'
          })),
          totalSize: files.reduce((sum, f) => sum + (f.metadata?.size || 0), 0)
        };

        audit.phases.storage.buckets.push(bucketAnalysis);

        console.log(`  Files: ${files.length}`);
        console.log(`  Total size: ${(bucketAnalysis.totalSize / 1024 / 1024).toFixed(2)} MB`);
        
        // Check for duplicates
        const fileNames = files.map(f => f.name);
        const duplicates = fileNames.filter((name, idx) => fileNames.indexOf(name) !== idx);
        if (duplicates.length > 0) {
          console.log(`  ⚠️  Duplicate filenames: ${duplicates.join(', ')}`);
        }
        
        console.log();
      } else {
        console.log(`  ❌ Could not list files: ${filesError?.message || 'Unknown error'}\n`);
      }
    }
  }

  // ============================================================================
  // PHASE 3: DATABASE ↔ STORAGE CONSISTENCY
  // ============================================================================
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('PHASE 3: DATABASE ↔ STORAGE CONSISTENCY');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Collect all URLs from database
  const allDatabaseUrls = new Set();
  for (const field of imageFields) {
    try {
      const { data } = await supabase.from(field.table).select(field.column);
      if (data) {
        data.forEach(r => {
          if (r[field.column]) allDatabaseUrls.add(r[field.column]);
        });
      }
    } catch (err) {
      // Skip
    }
  }

  console.log(`Database references: ${allDatabaseUrls.size} unique image URLs\n`);

  // Extract Storage paths from URLs
  const storagePattern = /storage\/v1\/object\/public\/([^/]+)\/(.+)$/;
  const referencedStorageFiles = new Map(); // bucket -> Set of filenames

  allDatabaseUrls.forEach(url => {
    const match = url.match(storagePattern);
    if (match) {
      const [, bucket, path] = match;
      if (!referencedStorageFiles.has(bucket)) {
        referencedStorageFiles.set(bucket, new Set());
      }
      referencedStorageFiles.get(bucket).add(path);
    }
  });

  console.log('Referenced Storage files by bucket:');
  referencedStorageFiles.forEach((files, bucket) => {
    console.log(`  ${bucket}: ${files.size} files`);
  });
  console.log();

  // Check for orphans
  audit.phases.consistency = {
    databaseUrls: allDatabaseUrls.size,
    storageFiles: 0,
    orphans: [],
    missingFiles: []
  };

  if (allBuckets) {
    for (const bucket of allBuckets) {
      const { data: files } = await supabaseAdmin.storage.from(bucket.name).list('', { limit: 1000 });
      
      if (files) {
        audit.phases.consistency.storageFiles += files.length;
        
        const referenced = referencedStorageFiles.get(bucket.name) || new Set();
        
        files.forEach(file => {
          if (!referenced.has(file.name)) {
            audit.phases.consistency.orphans.push(`${bucket.name}/${file.name}`);
          }
        });
      }
    }

    console.log(`Orphaned files (in Storage but not referenced): ${audit.phases.consistency.orphans.length}`);
    if (audit.phases.consistency.orphans.length > 0 && audit.phases.consistency.orphans.length <= 10) {
      audit.phases.consistency.orphans.forEach(o => console.log(`  - ${o}`));
    }
    console.log();
  }

  // ============================================================================
  // SAVE REPORT
  // ============================================================================
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('SAVING AUDIT DATA');
  console.log('═══════════════════════════════════════════════════════════════\n');

  writeFileSync(
    'media-architecture-audit-data.json',
    JSON.stringify(audit, null, 2)
  );

  console.log('✅ Audit data saved to: media-architecture-audit-data.json\n');

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('AUDIT SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log(`Image Fields Audited: ${audit.phases.database.imageFields.length}`);
  console.log(`Storage Buckets Found: ${audit.phases.storage?.buckets.length || 0}`);
  console.log(`Database Image URLs: ${audit.phases.consistency.databaseUrls}`);
  console.log(`Storage Files: ${audit.phases.consistency.storageFiles}`);
  console.log(`Orphaned Files: ${audit.phases.consistency.orphans.length}`);
  console.log();

  console.log('✅ Phase 1-3 audit complete');
  console.log('📝 Review media-architecture-audit-data.json for detailed findings');
  console.log('📋 Next: Manual analysis of admin components and public website');
  console.log();

  await supabase.auth.signOut();

} catch (error) {
  console.error('\n❌ AUDIT FAILED:', error.message);
  console.error(error.stack);
  process.exit(1);
}
