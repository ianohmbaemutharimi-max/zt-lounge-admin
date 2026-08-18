import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const sb = createClient(url, serviceKey);

async function comprehensiveAudit() {
  console.log('=== PHASE 1: COMPLETE IMAGE INVENTORY ===\n');
  
  const tables = [
    { name: 'hero_slides', imageFields: ['image_url'] },
    { name: 'gallery', imageFields: ['image_url'] },
    { name: 'services', imageFields: ['image_url'] },
    { name: 'menu_items', imageFields: ['image_url'] },
    { name: 'business_settings', imageFields: ['logo_url', 'favicon_url'] },
    { name: 'website_pages', imageFields: ['hero_image_url'] },
  ];
  
  const inventory = {
    storageUrls: [],
    localRelative: [],
    localAbsolute: [],
    externalHttp: [],
    missing: [],
    broken: []
  };
  
  let totalChecked = 0;
  
  for (const table of tables) {
    console.log(`\n📋 ${table.name}`);
    
    const { data, error } = await sb.from(table.name).select('*');
    
    if (error) {
      console.error(`  ❌ Error: ${error.message}`);
      continue;
    }
    
    if (!data || data.length === 0) {
      console.log(`  ⚪ No records`);
      continue;
    }
    
    for (const record of data) {
      for (const field of table.imageFields) {
        const value = record[field];
        totalChecked++;
        
        if (!value || value === '' || value === null) {
          console.log(`  ⚪ ${record.id} ${field}: [empty]`);
          inventory.missing.push({ table: table.name, id: record.id, field, value: null });
          continue;
        }
        
        // Classify
        if (value.startsWith('https://') && value.includes('supabase.co/storage')) {
          console.log(`  ✅ ${record.id} ${field}: Storage URL`);
          inventory.storageUrls.push({ table: table.name, id: record.id, field, value });
        } else if (value.startsWith('assets/')) {
          console.log(`  ❌ ${record.id} ${field}: LOCAL RELATIVE - ${value}`);
          inventory.localRelative.push({ table: table.name, id: record.id, field, value });
        } else if (value.startsWith('/')) {
          console.log(`  ⚠️  ${record.id} ${field}: Local absolute - ${value}`);
          inventory.localAbsolute.push({ table: table.name, id: record.id, field, value });
        } else if (value.startsWith('http://') || value.startsWith('https://')) {
          console.log(`  🌐 ${record.id} ${field}: External HTTP - ${value}`);
          inventory.externalHttp.push({ table: table.name, id: record.id, field, value });
        } else if (value.startsWith('D:\\') || value.startsWith('C:\\')) {
          console.log(`  ❌ ${record.id} ${field}: LOCAL ABSOLUTE PATH - ${value}`);
          inventory.localAbsolute.push({ table: table.name, id: record.id, field, value });
        } else {
          console.log(`  ❓ ${record.id} ${field}: Unknown format - ${value}`);
          inventory.broken.push({ table: table.name, id: record.id, field, value });
        }
      }
    }
  }
  
  console.log('\n=== INVENTORY SUMMARY ===');
  console.log(`Total fields checked: ${totalChecked}`);
  console.log(`✅ Supabase Storage URLs: ${inventory.storageUrls.length}`);
  console.log(`❌ Local relative paths: ${inventory.localRelative.length}`);
  console.log(`⚠️  Local absolute paths: ${inventory.localAbsolute.length}`);
  console.log(`🌐 External HTTP URLs: ${inventory.externalHttp.length}`);
  console.log(`⚪ Missing/null: ${inventory.missing.length}`);
  console.log(`❓ Broken/unknown: ${inventory.broken.length}`);
  
  // HTTP verification for Storage URLs
  console.log('\n=== HTTP VERIFICATION (Sample) ===');
  const sample = inventory.storageUrls.slice(0, 5);
  for (const item of sample) {
    try {
      const response = await fetch(item.value, { method: 'HEAD' });
      const status = response.status;
      console.log(`${status === 200 ? '✅' : '❌'} ${status} ${item.table}.${item.field}`);
    } catch (e) {
      console.log(`❌ ERROR ${item.table}.${item.field}: ${e.message}`);
    }
  }
  
  // Storage bucket audit
  console.log('\n=== STORAGE BUCKET AUDIT ===');
  const { data: buckets, error: bucketsError } = await sb.storage.listBuckets();
  if (bucketsError) {
    console.error('Error listing buckets:', bucketsError);
  } else {
    for (const bucket of buckets || []) {
      console.log(`\n🪣 ${bucket.name} (${bucket.public ? 'public' : 'private'})`);
      
      // List objects
      const { data: objects } = await sb.storage.from(bucket.name).list('', { limit: 100 });
      console.log(`   Objects: ${objects?.length || 0}`);
    }
  }
  
  // Save complete report
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalChecked,
      storageUrls: inventory.storageUrls.length,
      localRelative: inventory.localRelative.length,
      localAbsolute: inventory.localAbsolute.length,
      externalHttp: inventory.externalHttp.length,
      missing: inventory.missing.length,
      broken: inventory.broken.length
    },
    inventory
  };
  
  await import('fs').then(fs => {
    fs.writeFileSync('final-image-inventory.json', JSON.stringify(report, null, 2));
  });
  
  console.log('\n✅ Complete inventory saved to final-image-inventory.json');
  
  // Return critical issues
  return {
    criticalIssues: inventory.localRelative.length + inventory.localAbsolute.length,
    inventory
  };
}

comprehensiveAudit().catch(console.error);
