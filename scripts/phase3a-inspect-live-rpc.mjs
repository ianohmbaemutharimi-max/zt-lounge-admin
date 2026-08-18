#!/usr/bin/env node

/**
 * PHASE 3A: INSPECT LIVE get_dashboard_stats() RPC
 * 
 * Query the actual live Supabase database to determine:
 * 1. Does get_dashboard_stats() exist?
 * 2. What are its parameters?
 * 3. What does it return?
 * 4. What is the execution result?
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing Supabase configuration');
  process.exit(1);
}

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

console.log('🔍 PHASE 3A: INSPECT LIVE get_dashboard_stats() RPC\n');
console.log('='.repeat(80));

async function inspectLiveRPC() {
  const report = {
    exists: false,
    canExecute: false,
    returnedFields: [],
    returnedValues: {},
    executionTimeMs: null,
    error: null
  };

  try {
    // STEP 1: Try to execute the RPC
    console.log('\n📋 STEP 1: EXECUTE LIVE RPC\n');
    console.log('Executing: adminClient.rpc("get_dashboard_stats")');
    
    const startTime = Date.now();
    const { data, error } = await adminClient.rpc('get_dashboard_stats');
    const executionTime = Date.now() - startTime;
    
    report.executionTimeMs = executionTime;

    if (error) {
      console.log(`\n❌ RPC EXECUTION FAILED`);
      console.log(`Error: ${error.message}`);
      console.log(`Code: ${error.code || 'N/A'}`);
      console.log(`Details: ${error.details || 'N/A'}`);
      report.error = {
        message: error.message,
        code: error.code,
        details: error.details
      };
      
      if (error.message.includes('Could not find') || error.code === '42883') {
        console.log('\n⚠️  RPC does NOT exist in live database');
        report.exists = false;
      } else {
        console.log('\n⚠️  RPC exists but execution failed');
        report.exists = true;
      }
    } else {
      report.exists = true;
      report.canExecute = true;
      
      console.log(`\n✅ RPC EXECUTION SUCCESSFUL`);
      console.log(`Execution Time: ${executionTime}ms`);
      
      // STEP 2: Analyze returned data
      console.log('\n📋 STEP 2: ANALYZE RETURNED DATA\n');
      
      if (data) {
        report.returnedFields = Object.keys(data);
        report.returnedValues = data;
        
        console.log('Returned Fields:');
        console.log('='.repeat(80));
        Object.keys(data).forEach(field => {
          const value = data[field];
          const type = typeof value;
          console.log(`  ${field.padEnd(25)} ${String(value).padEnd(15)} (${type})`);
        });
        
        console.log('\nFull Response:');
        console.log('='.repeat(80));
        console.log(JSON.stringify(data, null, 2));
      } else {
        console.log('⚠️  RPC returned NULL or undefined');
      }
    }

    // STEP 3: Query PostgreSQL catalog for function metadata (if exists)
    if (report.exists) {
      console.log('\n📋 STEP 3: QUERY FUNCTION METADATA\n');
      
      try {
        // Try to get function definition from pg_proc
        const { data: funcData, error: funcError } = await adminClient
          .rpc('exec_sql', {
            query: `
              SELECT 
                n.nspname as schema,
                p.proname as name,
                pg_get_function_arguments(p.oid) as arguments,
                pg_get_function_result(p.oid) as return_type,
                l.lanname as language,
                p.prosrc as source
              FROM pg_proc p
              LEFT JOIN pg_namespace n ON p.pronamespace = n.oid
              LEFT JOIN pg_language l ON p.prolang = l.oid
              WHERE p.proname = 'get_dashboard_stats'
              LIMIT 1;
            `
          });

        if (!funcError && funcData && funcData.length > 0) {
          const func = funcData[0];
          console.log('Function Metadata:');
          console.log('='.repeat(80));
          console.log(`Schema:       ${func.schema}`);
          console.log(`Name:         ${func.name}`);
          console.log(`Arguments:    ${func.arguments || '(none)'}`);
          console.log(`Return Type:  ${func.return_type}`);
          console.log(`Language:     ${func.language}`);
          console.log(`\nSource Code:`);
          console.log('-'.repeat(80));
          console.log(func.source);
          console.log('-'.repeat(80));
        } else {
          console.log('⚠️  Could not query function metadata via exec_sql');
          console.log('(This is normal if exec_sql RPC does not exist)');
        }
      } catch (metaError) {
        console.log('⚠️  Function metadata query not available');
      }
    }

    // FINAL SUMMARY
    console.log('\n' + '='.repeat(80));
    console.log('📊 PHASE 3A SUMMARY');
    console.log('='.repeat(80));
    console.log(`\nRPC Exists:           ${report.exists ? '✅ YES' : '❌ NO'}`);
    console.log(`Can Execute:          ${report.canExecute ? '✅ YES' : '❌ NO'}`);
    console.log(`Execution Time:       ${report.executionTimeMs}ms`);
    console.log(`Fields Returned:      ${report.returnedFields.length}`);
    
    if (report.returnedFields.length > 0) {
      console.log(`\nField List:`);
      report.returnedFields.forEach(f => console.log(`  - ${f}`));
    }
    
    if (report.error) {
      console.log(`\nError: ${report.error.message}`);
    }

    console.log('\n✅ PHASE 3A COMPLETE\n');
    return report;

  } catch (err) {
    console.error('\n❌ Fatal error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

inspectLiveRPC();
