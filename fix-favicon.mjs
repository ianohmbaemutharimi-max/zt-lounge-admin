import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const sb = createClient(url, serviceKey);

async function fixFavicon() {
  console.log('=== PHASE 2: FIX FAVICON ===\n');
  
  const faviconPath = 'D:\\zt lounge\\zt-lounge-demo\\zt-lounge\\assets\\images\\branding\\favicon.ico';
  
  console.log('1. Checking if favicon exists...');
  if (!existsSync(faviconPath)) {
    console.log(`❌ Favicon not found at: ${faviconPath}`);
    return;
  }
  console.log('✅ Favicon file exists');
  
  console.log('\n2. Reading favicon file...');
  const faviconBuffer = readFileSync(faviconPath);
  console.log(`✅ Read ${faviconBuffer.length} bytes`);
  
  console.log('\n3. Attempting upload with different content types...');
  
  // Try multiple content types
  const contentTypes = [
    'image/vnd.microsoft.icon',
    'image/x-icon',
    'image/icon',
    'application/octet-stream'
  ];
  
  let uploadSuccess = false;
  let publicUrl = null;
  
  for (const contentType of contentTypes) {
    console.log(`\n   Trying: ${contentType}`);
    
    const { data, error } = await sb.storage
      .from('logos')
      .upload('favicon.ico', faviconBuffer, {
        contentType,
        upsert: true
      });
    
    if (error) {
      console.log(`   ❌ Failed: ${error.message}`);
    } else {
      console.log(`   ✅ Success!`);
      uploadSuccess = true;
      publicUrl = sb.storage.from('logos').getPublicUrl('favicon.ico').data.publicUrl;
      console.log(`   URL: ${publicUrl}`);
      break;
    }
  }
  
  if (!uploadSuccess) {
    console.log('\n❌ All content types failed. Converting to PNG...');
    console.log('⚠️  Manual action required: Convert favicon.ico to favicon.png');
    console.log('   Then copy to: zt-lounge-admin/public/favicon.png');
    console.log('   And update business_settings.favicon_url to: /favicon.png');
    return false;
  }
  
  console.log('\n4. Updating database...');
  const { error: updateError } = await sb
    .from('business_settings')
    .update({ favicon_url: publicUrl })
    .eq('id', 1);
  
  if (updateError) {
    console.log(`❌ Database update failed: ${updateError.message}`);
    return false;
  }
  
  console.log('✅ Database updated');
  
  console.log('\n5. Verifying...');
  const response = await fetch(publicUrl, { method: 'HEAD' });
  console.log(`HTTP ${response.status} ${response.statusText}`);
  
  if (response.status === 200) {
    console.log('\n✅ FAVICON MIGRATION COMPLETE');
    return true;
  } else {
    console.log('\n❌ FAVICON VERIFICATION FAILED');
    return false;
  }
}

fixFavicon().catch(console.error);
