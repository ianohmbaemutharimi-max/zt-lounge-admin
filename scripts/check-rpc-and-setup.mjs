#!/usr/bin/env node

/**
 * ZT LOUNGE ADMIN — CHECK RPC AND SETUP ADMIN
 * 
 * 1. Check if get_dashboard_stats() RPC exists
 * 2. If not, apply migration
 * 3. Find or list existing admin users
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing Supabase configuration');
  process.exit(1);
}

// Create admin client
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

console.log('🔍 ZT LOUNGE ADMIN — RPC & SETUP VERIFICATION\n');
console.log('='.repeat(70));

async function checkAndSetup() {
  const results = {
    rpcExists: false,
    migrationApplied: false,
    adminUsersFound: [],
    error: null
  };

  try {
    // Step 1: Check if RPC exists
    console.log('\n1️⃣  Checking if get_dashboard_stats() RPC exists...');
    
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_dashboard_stats');
    
    if (rpcError) {
      if (rpcError.message.includes('function') && rpcError.message.includes('does not exist')) {
        console.log('❌ RPC does not exist');
        console.log('\n2️⃣  Applying migration...');
        
        // Read and execute migration
        const migrationPath = join(__dirname, '..', 'supabase', 'migrations', '20260815_create_dashboard_stats_rpc.sql');
        const migrationSQL = readFileSync(migrationPath, 'utf8');
        
        // Execute migration using service role
        const { error: migrationError } = await supabase.rpc('exec_sql', { 
          sql: migrationSQL 
        }).single();
        
        if (migrationError) {
          // Try direct execution via PostgREST (won't work but worth trying)
          console.log('⚠️  Cannot apply migration via exec_sql RPC');
          console.log('   Migration must be applied via Supabase Dashboard or CLI');
          console.log('\n📋 MIGRATION SQL:');
          console.log(migrationSQL);
          results.error = 'Migration needs manual application';
        } else {
          console.log('✅ Migration applied successfully');
          results.migrationApplied = true;
          results.rpcExists = true;
        }
      } else {
        results.error = `RPC check failed: ${rpcError.message}`;
        console.error(`❌ ${results.error}`);
      }
    } else {
      console.log('✅ RPC exists and executed successfully');
      console.log(`   Sample data: ${JSON.stringify(rpcData).substring(0, 100)}...`);
      results.rpcExists = true;
    }

    // Step 2: Find admin users
    console.log('\n3️⃣  Finding admin users...');
    
    // Get admin role ID
    const { data: adminRole } = await supabase
      .from('roles')
      .select('id')
      .eq('name', 'admin')
      .single();
    
    if (!adminRole) {
      console.log('❌ Admin role not found in database');
      results.error = 'Admin role missing';
      return results;
    }

    // Get profiles with admin role
    const { data: adminProfiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, user_id, full_name, role_id')
      .eq('role_id', adminRole.id);
    
    if (profilesError) {
      console.log(`❌ Error fetching admin profiles: ${profilesError.message}`);
      results.error = profilesError.message;
      return results;
    }

    if (!adminProfiles || adminProfiles.length === 0) {
      console.log('❌ No admin users found');
      results.error = 'No admin users exist';
      return results;
    }

    console.log(`✅ Found ${adminProfiles.length} admin user(s)`);
    
    // Get email addresses from auth.users
    for (const profile of adminProfiles) {
      const { data: userData } = await supabase.auth.admin.getUserById(profile.user_id);
      if (userData?.user) {
        results.adminUsersFound.push({
          email: userData.user.email,
          name: profile.full_name,
          userId: profile.user_id
        });
        console.log(`   📧 ${userData.user.email} (${profile.full_name})`);
      }
    }

    return results;

  } catch (err) {
    results.error = err.message;
    console.error(`\n❌ Unexpected error: ${err.message}`);
    return results;
  }
}

// Run check
const results = await checkAndSetup();

console.log('\n' + '='.repeat(70));
console.log('\n📊 VERIFICATION RESULTS:\n');
console.log(`   RPC Exists:         ${results.rpcExists ? '✅ YES' : '❌ NO'}`);
console.log(`   Migration Applied:  ${results.migrationApplied ? '✅ YES' : '⏹️  N/A'}`);
console.log(`   Admin Users Found:  ${results.adminUsersFound.length > 0 ? `✅ ${results.adminUsersFound.length}` : '❌ NONE'}`);

if (results.adminUsersFound.length > 0) {
  console.log('\n📧 ADMIN USER EMAILS (for .env.local):');
  console.log('   Copy one of these to .env.local as ADMIN_EMAIL:');
  results.adminUsersFound.forEach(user => {
    console.log(`   • ${user.email}`);
  });
  console.log('\n   ⚠️  You need to add the password manually as ADMIN_PASSWORD');
}

if (results.error) {
  console.log(`\n   Error: ${results.error}`);
}

console.log('\n' + '='.repeat(70));

// Exit codes
if (results.rpcExists && results.adminUsersFound.length > 0) {
  console.log('\n✅ SETUP CHECK: READY FOR TESTING\n');
  process.exit(0);
} else if (!results.rpcExists) {
  console.log('\n⚠️  SETUP CHECK: RPC MIGRATION REQUIRED\n');
  console.log('Apply migration via Supabase Dashboard SQL Editor:');
  console.log('   supabase/migrations/20260815_create_dashboard_stats_rpc.sql\n');
  process.exit(2);
} else if (results.adminUsersFound.length === 0) {
  console.log('\n⚠️  SETUP CHECK: NO ADMIN USERS FOUND\n');
  process.exit(3);
} else {
  console.log('\n❌ SETUP CHECK: FAILED\n');
  process.exit(1);
}
