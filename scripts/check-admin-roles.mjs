#!/usr/bin/env node
/**
 * Check for existing super_admin and manager users
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..');

dotenv.config({ path: join(root, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  console.log('Checking for admin roles...\n');

  // Get all roles
  const { data: roles, error: rolesError } = await supabase
    .from('roles')
    .select('id, name')
    .in('name', ['super_admin', 'admin', 'manager']);

  if (rolesError) {
    console.error('❌ Error fetching roles:', rolesError.message);
    process.exit(1);
  }

  console.log('Roles found:', roles?.map(r => r.name).join(', ') || 'none');

  const superAdminRole = roles?.find(r => r.name === 'super_admin');
  const adminRole = roles?.find(r => r.name === 'admin');
  const managerRole = roles?.find(r => r.name === 'manager');

  // Check for users with each role
  for (const role of [superAdminRole, adminRole, managerRole]) {
    if (!role) {
      console.log(`\n⚠️  ${role?.name || 'role'} role does not exist in roles table`);
      continue;
    }

    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, full_name, role_id, roles!inner(name)')
      .eq('role_id', role.id);

    if (error) {
      console.error(`❌ Error fetching ${role.name} profiles:`, error.message);
      continue;
    }

    console.log(`\n${role.name.toUpperCase()}:`);
    if (profiles && profiles.length > 0) {
      console.log(`  ✅ ${profiles.length} user(s) found:`);
      profiles.forEach(p => {
        console.log(`     - ${p.full_name} (${p.id})`);
      });
    } else {
      console.log(`  ❌ No users with ${role.name} role`);
    }
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
