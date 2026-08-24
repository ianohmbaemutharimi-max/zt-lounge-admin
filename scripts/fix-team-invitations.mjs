#!/usr/bin/env node
/**
 * Team Invitations Database Fix
 * 
 * Checks if the invitations table exists and applies the migration if needed.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkInvitationsTable() {
  console.log('🔍 Checking for invitations table...\n');
  
  // Check if table exists
  const { data, error } = await supabase
    .from('invitations')
    .select('id')
    .limit(1);
  
  if (error) {
    if (error.message.includes('does not exist') || error.message.includes('schema cache')) {
      console.log('❌ invitations table not found');
      return false;
    }
    console.error('⚠️  Error checking table:', error.message);
    return false;
  }
  
  console.log('✅ invitations table exists');
  return true;
}

async function applyMigration() {
  console.log('\n📝 Applying team invitations migration...\n');
  
  const migrationPath = join(__dirname, '..', 'supabase', 'migrations', '20260818_add_team_invitations.sql');
  const migrationSQL = readFileSync(migrationPath, 'utf-8');
  
  // Execute the migration
  const { error } = await supabase.rpc('exec_sql', { sql_query: migrationSQL });
  
  if (error) {
    // Try direct execution via PostgREST
    console.log('⚠️  RPC method failed, trying direct execution...');
    
    // Split into individual statements and execute
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    for (const statement of statements) {
      if (!statement) continue;
      
      try {
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseServiceKey,
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({ sql_query: statement + ';' })
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ Failed to execute statement: ${errorText}`);
        }
      } catch (err) {
        console.error(`❌ Error executing statement:`, err.message);
      }
    }
  } else {
    console.log('✅ Migration applied successfully');
  }
}

async function verifySchema() {
  console.log('\n🔍 Verifying schema...\n');
  
  // Check table structure
  const { data, error } = await supabase
    .from('invitations')
    .select('*')
    .limit(0);
  
  if (error) {
    console.error('❌ Schema verification failed:', error.message);
    return false;
  }
  
  console.log('✅ Schema verified');
  
  // Check RLS policies
  const { data: policies, error: policyError } = await supabase
    .rpc('exec_sql', {
      sql_query: `
        SELECT policyname, cmd 
        FROM pg_policies 
        WHERE tablename = 'invitations'
      `
    });
  
  if (!policyError && policies) {
    console.log(`✅ Found ${policies.length || 0} RLS policies`);
  }
  
  return true;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  ZT LOUNGE ADMIN — TEAM INVITATIONS DATABASE FIX');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  const tableExists = await checkInvitationsTable();
  
  if (!tableExists) {
    console.log('\n⚠️  The invitations table needs to be created');
    console.log('📋 This will apply migration: 20260818_add_team_invitations.sql\n');
    
    await applyMigration();
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for schema cache
    
    const verified = await verifySchema();
    
    if (verified) {
      console.log('\n✅ Team invitations table successfully created!');
      console.log('\n📝 Next steps:');
      console.log('   1. Test the API: GET /api/admin/team-invitations?status=pending');
      console.log('   2. Verify team invitation UI');
      console.log('   3. Test invitation creation\n');
    } else {
      console.log('\n⚠️  Manual verification required');
      console.log('   Run this query in Supabase SQL Editor:');
      console.log('   SELECT * FROM invitations LIMIT 1;\n');
    }
  } else {
    console.log('\n✅ Team invitations table already exists!');
    console.log('   No migration needed.\n');
    
    // Still verify schema
    await verifySchema();
  }
  
  console.log('═══════════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('\n❌ FATAL ERROR:', err.message);
  process.exit(1);
});
