// Safe test write to live Supabase to prove CMS -> DB -> API -> website flow
// Updates business_settings.tagline, verifies, then reverts to original.
const { createClient } = require('@supabase/supabase-js');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jczwilrysvnhcjzjztbi.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', url ? '✓' : '✗');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', serviceKey ? '✓' : '✗');
  process.exit(1);
}

const admin = createClient(url, serviceKey);

const TEST_TAGLINE = 'ZT Lounge Meru - CMS Test Write (safe, reverted)';

async function main() {
  console.log('=== SAFE TEST WRITE TO LIVE SUPABASE ===\n');

  // 1. Read current value
  const { data: before, error: readErr } = await admin
    .from('business_settings')
    .select('id, tagline')
    .eq('id', 1)
    .single();
  if (readErr) { console.error('READ ERROR:', readErr.message); return; }
  const original = before.tagline;
  console.log(`1. Original tagline: "${original}"`);

  // 2. Update to test value
  const { data: updated, error: updateErr } = await admin
    .from('business_settings')
    .update({ tagline: TEST_TAGLINE })
    .eq('id', 1)
    .select('id, tagline')
    .single();
  if (updateErr) { console.error('UPDATE ERROR:', updateErr.message); return; }
  console.log(`2. Updated tagline: "${updated.tagline}"`);
  console.log(`   Write succeeded: ${updated.tagline === TEST_TAGLINE ? 'YES' : 'NO'}`);

  // 3. Read back to confirm persisted
  const { data: verify, error: verifyErr } = await admin
    .from('business_settings')
    .select('tagline')
    .eq('id', 1)
    .single();
  if (verifyErr) { console.error('VERIFY ERROR:', verifyErr.message); return; }
  console.log(`3. Read back after write: "${verify.tagline}"`);
  console.log(`   Persisted: ${verify.tagline === TEST_TAGLINE ? 'YES' : 'NO'}`);

  // 4. Revert to original
  const { data: reverted, error: revertErr } = await admin
    .from('business_settings')
    .update({ tagline: original })
    .eq('id', 1)
    .select('tagline')
    .single();
  if (revertErr) { console.error('REVERT ERROR:', revertErr.message); return; }
  console.log(`4. Reverted tagline: "${reverted.tagline}"`);
  console.log(`   Revert succeeded: ${reverted.tagline === original ? 'YES' : 'NO'}`);

  console.log('\n=== SAFE WRITE TEST COMPLETE ===');
  console.log('Production data restored to original value.');
}

main().catch(console.error);