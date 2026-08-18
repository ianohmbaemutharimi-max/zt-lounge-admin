import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const sb = createClient(url, serviceKey);

// Load migration log
const migrationLog = JSON.parse(readFileSync('migration-log.json', 'utf-8'));

// PHASE 4: UPDATE DATABASE
async function phase4UpdateDatabase() {
  console.log('=== PHASE 4: UPDATE DATABASE ===\n');
  
  const updateLog = [];
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  
  // Group by table
  const byTable = migrationLog.reduce((acc, item) => {
    if (!acc[item.table]) acc[item.table] = [];
    acc[item.table].push(item);
    return acc;
  }, {});
  
  for (const [tableName, items] of Object.entries(byTable)) {
    console.log(`\n=== ${tableName} ===`);
    
    for (const item of items) {
      console.log(`\n[${updated + skipped + failed + 1}/${migrationLog.length}] ${item.label}`);
      console.log(`  Old: ${item.currentPath}`);
      
      if (item.status === 'failed') {
        console.log(`  ⚠️  Skipping - upload failed`);
        skipped++;
        updateLog.push({ ...item, dbUpdateStatus: 'skipped', reason: 'Upload failed' });
        continue;
      }
      
      if (!item.newUrl) {
        console.log(`  ⚠️  Skipping - no new URL`);
        skipped++;
        updateLog.push({ ...item, dbUpdateStatus: 'skipped', reason: 'No new URL' });
        continue;
      }
      
      console.log(`  New: ${item.newUrl}`);
      
      // Update database
      const updateData = { [item.column]: item.newUrl };
      
      const { error } = await sb
        .from(item.table)
        .update(updateData)
        .eq('id', item.id);
      
      if (error) {
        console.log(`  ❌ Database update failed: ${error.message}`);
        failed++;
        updateLog.push({ ...item, dbUpdateStatus: 'failed', dbError: error.message });
        continue;
      }
      
      console.log(`  ✅ Database updated`);
      updated++;
      updateLog.push({ ...item, dbUpdateStatus: 'updated' });
    }
  }
  
  console.log(`\n=== DATABASE UPDATE SUMMARY ===`);
  console.log(`✅ Updated: ${updated}`);
  console.log(`⚠️  Skipped: ${skipped}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total: ${migrationLog.length}`);
  
  // Save update log
  writeFileSync(
    'database-update-log.json',
    JSON.stringify(updateLog, null, 2)
  );
  
  console.log(`\n✅ Database update log saved to database-update-log.json`);
  
  // Generate migration mapping
  const mapping = updateLog
    .filter(item => item.dbUpdateStatus === 'updated')
    .map(item => ({
      table: item.table,
      id: item.id,
      label: item.label,
      oldPath: item.currentPath,
      newUrl: item.newUrl
    }));
  
  writeFileSync(
    'migration-mapping.json',
    JSON.stringify(mapping, null, 2)
  );
  
  console.log(`✅ Migration mapping saved to migration-mapping.json`);
  
  return updateLog;
}

// Run Phase 4
phase4UpdateDatabase().catch(console.error);
