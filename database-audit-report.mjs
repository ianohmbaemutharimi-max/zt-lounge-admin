/**
 * Comprehensive Database Audit Report
 * Compares local schema expectations with remote Supabase database reality
 */

// Remote schema from Supabase MCP (actual production database)
const REMOTE_SCHEMA = {
  contact_messages: {
    columns: ['id', 'full_name', 'phone', 'email', 'subject', 'message', 'status', 'replied_by', 'replied_at', 'created_at'],
    missing: ['updated_at'],  // Expected by local schema but MISSING remotely
  },
  notifications: {
    columns: ['id', 'profile_id', 'booking_id', 'title', 'message', 'type', 'is_read', 'created_at', 'read_at'],
    missing: ['updated_at'],  // Expected by local schema but MISSING remotely
  },
};

// Local schema expectations from src/db/schema.ts
const LOCAL_SCHEMA_EXPECTATIONS = {
  contact_messages: {
    expects_columns: ['id', 'user_id', 'full_name', 'phone', 'email', 'subject', 'message', 'status', 'replied_by', 'replied_at', 'created_at', 'updated_at'],
  },
  notifications: {
    expects_columns: ['id', 'profile_id', 'booking_id', 'title', 'message', 'type', 'is_read', 'read_at', 'created_at', 'updated_at'],
  },
};

// Repository allowlists from src/lib/repository.ts
const REPOSITORY_ALLOWLISTS = {
  contact_messages: ['id', 'full_name', 'phone', 'email', 'subject', 'message', 'status', 'replied_by', 'replied_at', 'created_at', 'updated_at'],
  notifications: ['id', 'profile_id', 'booking_id', 'title', 'message', 'type', 'is_read', 'read_at', 'created_at'],  // Note: NO updated_at here!
};

console.log('═══════════════════════════════════════════════════════════════');
console.log('           DATABASE SCHEMA MISMATCH AUDIT REPORT');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('PROJECT: ZT Lounge Admin');
console.log('SUPABASE PROJECT: jczwilrysvnhcjzjztbi');
console.log('AUDIT DATE:', new Date().toISOString());
console.log('\n═══════════════════════════════════════════════════════════════\n');

console.log('CRITICAL FINDING #1: contact_messages table\n');
console.log('❌ SCHEMA MISMATCH DETECTED');
console.log('   Local schema (src/db/schema.ts:366) defines: updated_at column');
console.log('   Remote database: MISSING updated_at column');
console.log('   Repository allowlist expects: updated_at in SELECT queries');
console.log('   Impact: HTTP 500 error on /api/admin/contact-messages\n');

console.log('   Remote columns:', REMOTE_SCHEMA.contact_messages.columns.join(', '));
console.log('   Missing columns:', REMOTE_SCHEMA.contact_messages.missing.join(', '));
console.log('\n───────────────────────────────────────────────────────────────\n');

console.log('CRITICAL FINDING #2: notifications table\n');
console.log('⚠️  PARTIAL MISMATCH');
console.log('   Local schema (src/db/schema.ts:289) defines: updated_at column');
console.log('   Remote database: MISSING updated_at column');
console.log('   Repository allowlist: Does NOT include updated_at (line 72)');
console.log('   Migration file exists: supabase/migrations/add_notifications_updated_at.sql');
console.log('   Impact: Migration never applied OR manually reverted\n');

console.log('   Remote columns:', REMOTE_SCHEMA.notifications.columns.join(', '));
console.log('   Missing columns:', REMOTE_SCHEMA.notifications.missing.join(', '));
console.log('\n───────────────────────────────────────────────────────────────\n');

console.log('FINDING #3: Migration State Mismatch\n');
console.log('📊 Migration list output shows:');
console.log('   - Local migrations 001-034: Referenced but files do NOT exist');
console.log('   - Only 1 actual file in supabase/migrations/');
console.log('   - Remote has 19 timestamp-based migrations applied');
console.log('   - Massive divergence between local and remote history\n');

console.log('   Local migration files:');
console.log('     ✓ add_notifications_updated_at.sql (present but not applied)');
console.log('   Local migration references (phantom):');
console.log('     001-034 (shown by CLI but files missing)\n');

console.log('\n═══════════════════════════════════════════════════════════════\n');
console.log('ROOT CAUSE ANALYSIS\n');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('The remote database was built/modified directly without using');
console.log('the local migration system. Evidence:');
console.log('  1. Remote has 19 timestamped migrations not tracked locally');
console.log('  2. Local migration file (add_notifications_updated_at.sql) not applied');
console.log('  3. Schema mismatches between local type definitions and remote reality');
console.log('  4. contact_messages table never got updated_at column\n');

console.log('The application code was written expecting columns that don\'t exist');
console.log('remotely, causing query failures.\n');

console.log('\n═══════════════════════════════════════════════════════════════\n');
console.log('IMPACT ASSESSMENT\n');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('BROKEN ENDPOINTS:');
console.log('  ❌ GET /api/admin/contact-messages → HTTP 500');
console.log('     Reason: Querying non-existent updated_at column\n');

console.log('WORKING ENDPOINTS:');
console.log('  ✅ GET /api/admin/notifications → HTTP 200');
console.log('     Reason: Repository allowlist omits updated_at\n');

console.log('  ✅ Other endpoints → HTTP 200');
console.log('     Reason: Schema matches or allowlist adapted\n');

console.log('\n═══════════════════════════════════════════════════════════════\n');
console.log('RECOMMENDED REPAIR STRATEGY\n');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('OPTION A: Fix Application Code (SAFE, RECOMMENDED)');
console.log('  1. Remove updated_at from contact_messages schema expectation');
console.log('  2. Remove updated_at from contact_messages repository allowlist');
console.log('  3. Remove updated_at from contact_messages writable fields');
console.log('  4. Document that contact_messages only has created_at\n');

console.log('OPTION B: Fix Database Schema (REQUIRES MIGRATION)');
console.log('  1. Create migration: ALTER TABLE contact_messages ADD updated_at');
console.log('  2. Apply migration to remote database');
console.log('  3. Verify no data loss\n');

console.log('OPTION C: Hybrid Approach (SAFEST)');
console.log('  1. Fix application code to match current remote schema (Option A)');
console.log('  2. Add updated_at column via new migration for future consistency');
console.log('  3. Test thoroughly before deploying\n');

console.log('\n═══════════════════════════════════════════════════════════════\n');
console.log('MIGRATION HISTORY REPAIR\n');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('⚠️  WARNING: Do NOT use the suggested repair commands from');
console.log('    `supabase db pull` without verification!\n');

console.log('SAFE APPROACH:');
console.log('  1. Accept that remote and local histories have diverged');
console.log('  2. Remote database is the source of truth (it\'s production)');
console.log('  3. Fix application code to match remote schema');
console.log('  4. Future migrations go forward from current state\n');

console.log('═══════════════════════════════════════════════════════════════\n');
console.log('END OF AUDIT REPORT');
console.log('═══════════════════════════════════════════════════════════════\n');
