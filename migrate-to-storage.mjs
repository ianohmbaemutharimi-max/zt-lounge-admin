import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, basename } from 'path';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const sb = createClient(url, serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Load inventory
const inventory = JSON.parse(readFileSync('migration-inventory.json', 'utf-8'));

// Map local paths to Storage buckets and paths
function mapToStoragePath(localPath) {
  // assets/images/restaurant/hero-restaurant.webp → hero-images/hero-restaurant.webp
  // assets/images/gallery/gallery-04.webp → gallery-images/gallery-04.webp
  // assets/images/menu/nyama-choma.webp → menu-images/nyama-choma.webp
  // assets/images/lounge/lounge-interior-main.webp → service-images/lounge-interior-main.webp
  // assets/images/branding/logo.webp → logos/logo.webp
  
  const filename = basename(localPath);
  
  if (localPath.includes('/hero/') || localPath.includes('/restaurant/hero') || localPath.includes('/lounge/hero')) {
    return { bucket: 'hero-images', path: filename };
  }
  if (localPath.includes('/gallery/')) {
    return { bucket: 'gallery-images', path: filename };
  }
  if (localPath.includes('/menu/')) {
    return { bucket: 'menu-images', path: filename };
  }
  if (localPath.includes('/branding/')) {
    return { bucket: 'logos', path: filename };
  }
  // Services: lounge, vip, autospa, restaurant, events, conference
  if (localPath.includes('/lounge/') || localPath.includes('/vip/') || 
      localPath.includes('/autospa/') || localPath.includes('/restaurant/') ||
      localPath.includes('/events/') || localPath.includes('/conference/')) {
    return { bucket: 'service-images', path: filename };
  }
  
  // Fallback
  return { bucket: 'public-assets', path: filename };
}

// PHASE 3: MIGRATE ASSETS
async function phase3MigrateAssets() {
  console.log('=== PHASE 3: MIGRATE ASSETS ===\n');
  
  const baseAssetsPath = 'D:\\zt lounge\\zt-lounge-demo\\zt-lounge\\assets\\images';
  const migrationLog = [];
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  
  for (const item of inventory) {
    console.log(`\n[${uploaded + skipped + failed + 1}/${inventory.length}] ${item.label}`);
    console.log(`  Local: ${item.currentPath}`);
    
    // Build local file path
    const localFile = join(baseAssetsPath, item.currentPath.replace('assets/images/', ''));
    
    if (!existsSync(localFile)) {
      console.log(`  ❌ Local file not found: ${localFile}`);
      failed++;
      migrationLog.push({
        ...item,
        status: 'failed',
        reason: 'Local file not found',
        localFile
      });
      continue;
    }
    
    // Map to Storage
    const storage = mapToStoragePath(item.currentPath);
    console.log(`  Storage: ${storage.bucket}/${storage.path}`);
    
    // Check if already exists
    const { data: existing } = await sb.storage.from(storage.bucket).list('', {
      search: storage.path
    });
    
    if (existing && existing.length > 0) {
      console.log(`  ⚠️  Already exists in Storage, skipping`);
      
      const publicUrl = sb.storage.from(storage.bucket).getPublicUrl(storage.path).data.publicUrl;
      
      skipped++;
      migrationLog.push({
        ...item,
        status: 'skipped',
        reason: 'Already exists',
        storageBucket: storage.bucket,
        storagePath: storage.path,
        newUrl: publicUrl,
        localFile
      });
      continue;
    }
    
    // Read file
    const fileBuffer = readFileSync(localFile);
    const contentType = localFile.endsWith('.webp') ? 'image/webp' : 
                        localFile.endsWith('.ico') ? 'image/x-icon' :
                        localFile.endsWith('.jpg') || localFile.endsWith('.jpeg') ? 'image/jpeg' :
                        localFile.endsWith('.png') ? 'image/png' : 'application/octet-stream';
    
    // Upload
    const { data, error } = await sb.storage
      .from(storage.bucket)
      .upload(storage.path, fileBuffer, {
        contentType,
        upsert: false
      });
    
    if (error) {
      console.log(`  ❌ Upload failed: ${error.message}`);
      failed++;
      migrationLog.push({
        ...item,
        status: 'failed',
        reason: error.message,
        storageBucket: storage.bucket,
        storagePath: storage.path,
        localFile
      });
      continue;
    }
    
    // Get public URL
    const { data: urlData } = sb.storage.from(storage.bucket).getPublicUrl(storage.path);
    const publicUrl = urlData.publicUrl;
    
    console.log(`  ✅ Uploaded successfully`);
    console.log(`  New URL: ${publicUrl}`);
    
    uploaded++;
    migrationLog.push({
      ...item,
      status: 'uploaded',
      storageBucket: storage.bucket,
      storagePath: storage.path,
      newUrl: publicUrl,
      localFile
    });
  }
  
  console.log(`\n=== MIGRATION SUMMARY ===`);
  console.log(`✅ Uploaded: ${uploaded}`);
  console.log(`⚠️  Skipped: ${skipped}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total: ${inventory.length}`);
  
  // Save migration log
  writeFileSync(
    'migration-log.json',
    JSON.stringify(migrationLog, null, 2)
  );
  
  console.log(`\n✅ Migration log saved to migration-log.json`);
  
  return migrationLog;
}

// Run Phase 3
phase3MigrateAssets().catch(console.error);
