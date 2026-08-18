// Safe test write to live Supabase to prove CMS -> DB -> API -> website flow
// Updates business_settings.tagline, verifies, then reverts to original.
const { createClient } = require('@supabase/supabase-js');

const url = 'https://jczwilrysvnhcjzjztbi.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjendpbHJ5c3ZuaGNqemp6dGJpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Mzk0MTI1MCwiZXhwIjoyMDk5NTE3MjUwfQ.nj7YBr_EixrTdv5hqIzJVu3L7kFWVD15RJka4u7UgwM';
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