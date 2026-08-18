import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const sb = createClient(url, serviceKey);

async function phase7DatabaseVerification() {
  console.log('=== PHASE 7: LIVE DATABASE VERIFICATION ===\n');
  
  const tables = [
    { name: 'hero_slides', imageFields: ['image_url'] },
    { name: 'gallery', imageFields: ['image_url'] },
    { name: 'services', imageFields: ['image_url'] },
    { name: 'menu_items', imageFields: ['image_url'] },
    { name: 'business_settings', imageFields: ['logo_url', 'favicon_url'] },
  ];
  
  const results = [];
  let totalChecked = 0;
  let totalValid = 0;
  let totalFailed = 0;
  
  for (const table of tables) {
    const { data, error } = await sb.from(table.name).select('*');
    
    if (error) {
      console.error(`❌ ${table.name}: ${error.message}`);
      continue;
    }
    
    for (const record of data || []) {
      for (const field of table.imageFields) {
        const value = record[field];
        
        if (!value || value === '') {
          // Empty is acceptable for optional fields
          continue;
        }
        
        totalChecked++;
        
        // Check URL format
        let urlValid = false;
        let storageObject = null;
        let httpStatus = null;
        let contentType = null;
        
        if (value.startsWith('https://') && value.includes('supabase.co/storage')) {
          urlValid = true;
          
          // Extract bucket and path
          const match = value.match(/storage\/v1\/object\/public\/([^/]+)\/(.+)/);
          if (match) {
            const [, bucket, path] = match;
            
            // Check if object exists
            const { data: objects } = await sb.storage.from(bucket).list('', { limit: 1000 });
            storageObject = objects?.some(o => path.includes(o.name)) ? '✅' : '❌';
          }
          
          // HTTP check
          try {
            const response = await fetch(value, { method: 'HEAD' });
            httpStatus = response.status;
            contentType = response.headers.get('content-type');
          } catch (e) {
            httpStatus = 'ERROR';
          }
        } else if (value.startsWith('/')) {
          // Local public path (valid for favicon)
          urlValid = true;
          httpStatus = 'LOCAL';
          storageObject = 'N/A';
        } else {
          // Invalid
          urlValid = false;
        }
        
        const passed = urlValid && (httpStatus === 200 || httpStatus === 'LOCAL');
        
        if (passed) {
          totalValid++;
        } else {
          totalFailed++;
        }
        
        results.push({
          table: table.name,
          id: record.id,
          field,
          url: value,
          urlValid,
          storageObject,
          httpStatus,
          contentType,
          result: passed ? '✅ PASS' : '❌ FAIL'
        });
        
        console.log(`${passed ? '✅' : '❌'} ${table.name}.${field} (ID: ${record.id})`);
        console.log(`   URL: ${value.substring(0, 80)}...`);
        console.log(`   HTTP: ${httpStatus} | Storage: ${storageObject} | Type: ${contentType || 'N/A'}`);
      }
    }
  }
  
  console.log('\n=== VERIFICATION SUMMARY ===');
  console.log(`Total checked: ${totalChecked}`);
  console.log(`✅ Valid: ${totalValid}`);
  console.log(`❌ Failed: ${totalFailed}`);
  console.log(`Success rate: ${((totalValid / totalChecked) * 100).toFixed(1)}%`);
  
  if (totalFailed > 0) {
    console.log('\n❌ FAILED URLS:');
    results.filter(r => r.result === '❌ FAIL').forEach(r => {
      console.log(`   ${r.table}.${r.field} (${r.id}): ${r.url}`);
    });
  }
  
  return {
    totalChecked,
    totalValid,
    totalFailed,
    results
  };
}

phase7DatabaseVerification().catch(console.error);
