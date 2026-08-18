import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const sb = createClient(url, serviceKey);

// PHASE 1: AUDIT EXISTING DATA
async function phase1Audit() {
  console.log('=== PHASE 1: AUDIT ===\n');
  
  console.log('1. Checking existing Storage buckets...');
  const { data: buckets, error: bucketsError } = await sb.storage.listBuckets();
  if (bucketsError) {
    console.error('Error listing buckets:', bucketsError);
  } else {
    console.log(`Found ${buckets?.length || 0} buckets:`);
    buckets?.forEach(b => console.log(`  - ${b.name} (${b.public ? 'public' : 'private'})`));
  }
  
  console.log('\n2. Collecting all image URLs from database...');
  
  const tables = [
    { name: 'hero_slides', columns: ['id', 'title', 'image_url'] },
    { name: 'gallery', columns: ['id', 'title', 'image_url'] },
    { name: 'services', columns: ['id', 'name', 'image_url'] },
    { name: 'menu_items', columns: ['id', 'name', 'image_url'] },
    { name: 'business_settings', columns: ['id', 'logo_url', 'favicon_url'] },
  ];
  
  const imageInventory = [];
  
  for (const table of tables) {
    const { data, error } = await sb.from(table.name).select(table.columns.join(','));
    if (error) {
      console.error(`Error fetching ${table.name}:`, error);
      continue;
    }
    
    console.log(`\n${table.name}: ${data?.length || 0} records`);
    
    data?.forEach(record => {
      if (table.name === 'business_settings') {
        if (record.logo_url) {
          imageInventory.push({
            table: table.name,
            id: record.id,
            column: 'logo_url',
            currentPath: record.logo_url,
            label: 'Business Logo'
          });
          console.log(`  Logo: ${record.logo_url}`);
        }
        if (record.favicon_url) {
          imageInventory.push({
            table: table.name,
            id: record.id,
            column: 'favicon_url',
            currentPath: record.favicon_url,
            label: 'Favicon'
          });
          console.log(`  Favicon: ${record.favicon_url}`);
        }
      } else {
        const column = table.columns.find(c => c.includes('image_url'));
        if (record[column]) {
          imageInventory.push({
            table: table.name,
            id: record.id,
            column,
            currentPath: record[column],
            label: record.title || record.name
          });
          console.log(`  ${record.title || record.name}: ${record[column]}`);
        }
      }
    });
  }
  
  console.log(`\n✅ Total images to migrate: ${imageInventory.length}`);
  
  // Save inventory
  writeFileSync(
    join(process.cwd(), 'migration-inventory.json'),
    JSON.stringify(imageInventory, null, 2)
  );
  
  console.log('✅ Inventory saved to migration-inventory.json\n');
  
  return imageInventory;
}

// Run Phase 1
phase1Audit().catch(console.error);
