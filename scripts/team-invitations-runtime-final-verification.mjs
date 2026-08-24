#!/usr/bin/env node
/**
 * Team Invitations - Final Runtime Verification
 * 
 * This script performs a complete runtime verification of the Team Invitations feature
 * using the actual production environment and database.
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';

// Test credentials - user should provide their actual super_admin credentials
const ADMIN_EMAIL = process.env.ADMIN_USER_EMAIL || process.env.E2E_SUPER_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_USER_PASSWORD || process.env.E2E_SUPER_ADMIN_PASSWORD;

console.log('\n' + '='.repeat(80));
console.log('TEAM INVITATIONS — FINAL RUNTIME VERIFICATION');
console.log('='.repeat(80));

// Verification results
const results = {
  environmentCheck: false,
  authenticationCheck: false,
  databaseSchemaCheck: false,
  getInvitationsAPI: false,
  postInvitationAPI: false,
  duplicateProtection: false,
  securityCheck: false,
  cleanupCheck: false,
};

let testInvitationId = null;
let authToken = null;

async function main() {
  try {
    // Phase 1: Environment Check
    console.log('\n📋 Phase 1: Environment Check');
    console.log('─'.repeat(80));
    
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.log('❌ Missing Supabase configuration');
      console.log('   SUPABASE_URL:', SUPABASE_URL ? '✓ SET' : '✗ MISSING');
      console.log('   SUPABASE_ANON_KEY:', SUPABASE_ANON_KEY ? '✓ SET' : '✗ MISSING');
      return;
    }
    
    console.log('✅ Supabase configuration present');
    results.environmentCheck = true;

    // Phase 2: Authentication Check
    console.log('\n🔐 Phase 2: Authentication Check');
    console.log('─'.repeat(80));
    
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      console.log('⚠️  Admin credentials not configured');
      console.log('   Add ADMIN_USER_EMAIL and ADMIN_USER_PASSWORD to .env.local');
      console.log('   Using fallback credentials...');
    }
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
    
    if (authError || !authData.session) {
      console.log('❌ Authentication failed:', authError?.message || 'No session');
      console.log('\n🔍 This may indicate:');
      console.log('   1. Credentials are incorrect or missing from .env.local');
      console.log('   2. The user does not exist in Supabase Auth');
      console.log('   3. The user is not assigned a super_admin or admin role');
      console.log('\n💡 To complete full verification, ensure:');
      console.log('   - ADMIN_USER_EMAIL is set to a super_admin user email');
      console.log('   - ADMIN_USER_PASSWORD is set to that user\'s password');
      
      // Continue with limited verification
      console.log('\n🔄 Continuing with database-only verification...');
    } else {
      authToken = authData.session.access_token;
      console.log('✅ Successfully authenticated');
      console.log('   User:', authData.user.email);
      console.log('   Token:', authToken.substring(0, 20) + '...');
      results.authenticationCheck = true;
    }

    // Phase 3: Database Schema Check
    console.log('\n🗄️  Phase 3: Database Schema Check');
    console.log('─'.repeat(80));
    
    const { data: tableData, error: tableError } = await supabase
      .from('invitations')
      .select('id')
      .limit(0);
    
    if (tableError) {
      if (tableError.code === 'PGRST116') {
        console.log('❌ Table public.invitations does NOT exist');
        console.log('   Migration 20260818_add_team_invitations.sql not applied');
      } else {
        console.log('❌ Database error:', tableError.message);
      }
      return;
    }
    
    console.log('✅ Table public.invitations exists and is accessible');
    results.databaseSchemaCheck = true;

    // Phase 4: GET /api/admin/team-invitations
    console.log('\n🔍 Phase 4: GET /api/admin/team-invitations');
    console.log('─'.repeat(80));
    
    if (!authToken) {
      console.log('⚠️  Skipped - no authentication token available');
    } else {
      try {
        const response = await fetch(`${BASE_URL}/api/admin/team-invitations?status=pending`, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
          },
        });
        
        console.log('   Status:', response.status);
        
        if (response.status === 200) {
          const data = await response.json();
          console.log('✅ GET endpoint working');
          console.log('   Pending invitations:', data.invitations?.length || 0);
          results.getInvitationsAPI = true;
        } else {
          const errorText = await response.text();
          console.log('❌ GET endpoint failed');
          console.log('   Response:', errorText.substring(0, 200));
        }
      } catch (error) {
        console.log('❌ GET request failed:', error.message);
        console.log('   Is the dev server running on', BASE_URL, '?');
      }
    }

    // Phase 5: POST /api/admin/team-invitations
    console.log('\n📤 Phase 5: POST /api/admin/team-invitations');
    console.log('─'.repeat(80));
    
    if (!authToken) {
      console.log('⚠️  Skipped - no authentication token available');
    } else {
      const testEmail = `test-${Date.now()}@test.local`;
      
      try {
        const response = await fetch(`${BASE_URL}/api/admin/team-invitations`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: testEmail,
            role_id: 1, // Assuming role_id 1 exists
          }),
        });
        
        console.log('   Status:', response.status);
        
        if (response.status === 201) {
          const data = await response.json();
          testInvitationId = data.invitation?.id;
          
          console.log('✅ POST endpoint working');
          console.log('   Created invitation ID:', testInvitationId);
          console.log('   Email:', data.invitation?.email);
          console.log('   Status:', data.invitation?.status);
          console.log('   Expires:', data.invitation?.expires_at);
          console.log('   Token hash stored:', !!data.invitation?.token_hash);
          results.postInvitationAPI = true;
          
          // Phase 6: Duplicate Prevention
          console.log('\n🔒 Phase 6: Duplicate Invitation Prevention');
          console.log('─'.repeat(80));
          
          const dupResponse = await fetch(`${BASE_URL}/api/admin/team-invitations`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${authToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email: testEmail,
              role_id: 1,
            }),
          });
          
          console.log('   Duplicate attempt status:', dupResponse.status);
          
          if (dupResponse.status === 400 || dupResponse.status === 409) {
            console.log('✅ Duplicate prevention working');
            results.duplicateProtection = true;
          } else {
            console.log('❌ Duplicate was NOT prevented (status:', dupResponse.status, ')');
          }
        } else {
          const errorText = await response.text();
          console.log('❌ POST endpoint failed');
          console.log('   Response:', errorText.substring(0, 200));
        }
      } catch (error) {
        console.log('❌ POST request failed:', error.message);
      }
    }

    // Phase 7: Security Check (unauthorized access)
    console.log('\n🛡️  Phase 7: Security Check');
    console.log('─'.repeat(80));
    
    try {
      const response = await fetch(`${BASE_URL}/api/admin/team-invitations?status=pending`);
      console.log('   Unauthorized request status:', response.status);
      
      if (response.status === 401 || response.status === 403) {
        console.log('✅ Unauthorized access correctly blocked');
        results.securityCheck = true;
      } else {
        console.log('⚠️  Unexpected status for unauthorized request');
      }
    } catch (error) {
      console.log('❌ Security check failed:', error.message);
    }

    // Phase 8: Cleanup
    console.log('\n🧹 Phase 8: Cleanup');
    console.log('─'.repeat(80));
    
    if (testInvitationId && authToken) {
      try {
        const response = await fetch(`${BASE_URL}/api/admin/team-invitations/${testInvitationId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${authToken}`,
          },
        });
        
        console.log('   Delete status:', response.status);
        
        if (response.status === 200 || response.status === 204) {
          console.log('✅ Test invitation cleaned up');
          results.cleanupCheck = true;
        } else {
          console.log('⚠️  Cleanup returned unexpected status');
        }
      } catch (error) {
        console.log('❌ Cleanup failed:', error.message);
      }
    } else {
      console.log('⚠️  No test invitation to clean up');
    }

  } catch (error) {
    console.log('\n❌ Fatal error:', error.message);
    console.error(error);
  } finally {
    // Print summary
    console.log('\n' + '='.repeat(80));
    console.log('VERIFICATION SUMMARY');
    console.log('='.repeat(80));
    
    const checks = [
      ['Environment Configuration', results.environmentCheck],
      ['Authentication', results.authenticationCheck],
      ['Database Schema (public.invitations)', results.databaseSchemaCheck],
      ['GET /api/admin/team-invitations', results.getInvitationsAPI],
      ['POST /api/admin/team-invitations', results.postInvitationAPI],
      ['Duplicate Prevention', results.duplicateProtection],
      ['Unauthorized Access Block', results.securityCheck],
      ['Cleanup', results.cleanupCheck],
    ];
    
    let passCount = 0;
    checks.forEach(([name, passed]) => {
      const icon = passed ? '✅' : '❌';
      console.log(`${icon} ${name}`);
      if (passed) passCount++;
    });
    
    console.log('\n' + '─'.repeat(80));
    console.log(`Result: ${passCount}/${checks.length} checks passed`);
    
    if (passCount === checks.length) {
      console.log('\n🎉 ALL CHECKS PASSED - FEATURE VERIFIED');
    } else if (passCount >= 3) {
      console.log('\n⚠️  PARTIAL VERIFICATION - Review failed checks above');
    } else {
      console.log('\n❌ VERIFICATION FAILED - Critical issues detected');
    }
    
    console.log('='.repeat(80) + '\n');
  }
}

main();
