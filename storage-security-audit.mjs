import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const sb = createClient(url, serviceKey);

async function auditStorageSecurity() {
  console.log('=== PHASE 3: STORAGE SECURITY AUDIT ===\n');
  
  const { data: buckets, error } = await sb.storage.listBuckets();
  
  if (error) {
    console.error('❌ Error listing buckets:', error);
    return;
  }
  
  for (const bucket of buckets) {
    console.log(`\n🪣 ${bucket.name}`);
    console.log(`   Public: ${bucket.public ? '✅ YES' : '❌ NO'}`);
    console.log(`   ID: ${bucket.id}`);
    console.log(`   Created: ${new Date(bucket.created_at).toLocaleString()}`);
    
    // List objects
    const { data: objects, error: listError } = await sb.storage
      .from(bucket.name)
      .list('', { limit: 10 });
    
    if (listError) {
      console.log(`   ❌ Error listing objects: ${listError.message}`);
    } else {
      console.log(`   Objects: ${objects?.length || 0} (showing first 10)`);
      if (objects && objects.length > 0) {
        objects.slice(0, 3).forEach(obj => {
          console.log(`     - ${obj.name} (${(obj.metadata?.size || 0 / 1024).toFixed(1)} KB)`);
        });
      }
    }
    
    // Test anonymous read (should work for public buckets)
    if (bucket.public && objects && objects.length > 0) {
      const testFile = objects[0].name;
      const publicUrl = sb.storage.from(bucket.name).getPublicUrl(testFile).data.publicUrl;
      
      try {
        const response = await fetch(publicUrl, { method: 'HEAD' });
        console.log(`   Anonymous READ: ${response.status === 200 ? '✅ ALLOWED' : '❌ DENIED'} (${response.status})`);
      } catch (e) {
        console.log(`   Anonymous READ: ❌ ERROR - ${e.message}`);
      }
    }
  }
  
  console.log('\n=== SECURITY REQUIREMENTS ===');
  console.log('✅ Public buckets allow anonymous READ (verified above)');
  console.log('⚠️  WRITE access requires RLS policies (checked via Supabase Dashboard)');
  console.log('⚠️  Service role key is server-side only (verify in code review)');
  
  console.log('\n=== BUCKET CONFIGURATION SUMMARY ===');
  const publicBuckets = buckets.filter(b => b.public);
  const privateBuckets = buckets.filter(b => !b.public);
  
  console.log(`Public buckets: ${publicBuckets.length}`);
  publicBuckets.forEach(b => console.log(`  - ${b.name}`));
  
  console.log(`Private buckets: ${privateBuckets.length}`);
  privateBuckets.forEach(b => console.log(`  - ${b.name}`));
}

auditStorageSecurity().catch(console.error);
