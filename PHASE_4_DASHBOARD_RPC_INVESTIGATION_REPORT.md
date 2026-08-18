# PHASE 4: DASHBOARD RPC INVESTIGATION REPORT

**Date:** 2026-08-15  
**Status:** ⚠️ MIGRATION READY (Manual Application Required)  
**Investigation Phase:** 4A-4D Complete

---

## EXECUTIVE SUMMARY

Investigation into dashboard performance issues revealed that the `get_dashboard_stats()` RPC returns a **completely wrong contract structure**, causing the dashboard overview to fail.

### Root Cause Identified

The live database has a `get_dashboard_stats()` function that returns:
```json
{ "bookings": ..., "customers": ..., "services": ..., "messages": ... }
```

The UI expects:
```json
{ "cards": {...}, "revenue": [...], "trends": [...], "recentBookings": [...], "activity": [...], "notifications": [...] }
```

**This is a 100% mismatch.**

### Solution Status

✅ **Migration created and corrected** to match actual database schema  
⚠️ **Migration NOT YET APPLIED** (requires manual application)  
✅ **Verification script ready** to confirm fix

---

## INVESTIGATION TIMELINE

### Phase 4A: Contract Inspection ✅ COMPLETE

**Objective:** Map UI contract to database requirements without code changes

**Findings:**
1. UI expects specific dashboard response structure
2. Migration file existed but had **3 critical schema mismatches**:
   - Used `booking_time` (column doesn't exist, should be `start_time`)
   - Used `n.body` (column doesn't exist, should be `n.message`)
   - Used `a.actor` (column doesn't exist, need JOIN to profiles)

**Files Inspected:**
- `src/features/dashboard/overview.tsx` (UI contract)
- `src/app/api/dashboard/stats/route.ts` (API passthrough)
- `src/lib/api.ts` (client API)
- `src/db/schema.ts` (TypeScript schema definition)
- `supabase/migrations/20260815_fix_dashboard_stats_rpc.sql` (migration with errors)

**Report:** `PHASE_4A_CONTRACT_INSPECTION_REPORT.md`

---

### Phase 4B: Minimal Contract Migration ✅ COMPLETE

**Objective:** Fix migration to match actual database schema

**Changes Made:**

1. **Bookings table fix:**
   ```sql
   -- BEFORE (WRONG):
   'bookingTime', b.booking_time::text
   
   -- AFTER (CORRECT):
   'bookingTime', b.start_time::text
   ```

2. **Notifications table fix:**
   ```sql
   -- BEFORE (WRONG):
   'body', n.body
   
   -- AFTER (CORRECT):
   'body', n.message
   ```

3. **Activity logs fix:**
   ```sql
   -- BEFORE (WRONG):
   'actor', a.actor
   FROM activity_logs a
   
   -- AFTER (CORRECT):
   'actor', COALESCE(p.email, 'System')
   FROM activity_logs a
   LEFT JOIN profiles p ON a.profile_id = p.id
   ```

**Files Modified:**
- `supabase/migrations/20260815_fix_dashboard_stats_rpc.sql` (3 corrections)

**Report:** `PHASE_4B_MIGRATION_FIX_REPORT.md`

---

### Phase 4C: Apply Migration ⚠️ PENDING USER ACTION

**Objective:** Deploy corrected RPC function to live database

**Status:** Migration file ready but not applied

**Why Manual Application Required:**
- Supabase JS client doesn't support arbitrary SQL execution via RPC
- Service role key cannot execute DDL via PostgREST
- User must apply via Supabase Dashboard, CLI, or direct psql

**Instructions:** `APPLY_DASHBOARD_RPC_MIGRATION.md`

---

### Phase 4D: Live RPC Verification ⚠️ PENDING MIGRATION

**Objective:** Verify RPC returns correct contract structure

**Current Status:**
```
✅ RPC executes without SQL errors
❌ Returns wrong structure: {bookings, customers, services, messages}
❌ Expected structure: {cards, revenue, trends, recentBookings, activity, notifications}
```

**Verification Script:** `scripts/phase4cd-apply-and-verify-rpc.mjs`

**After Migration Applied, Expected:**
```
✅ RPC executes successfully
✅ All required top-level keys present
✅ All card metrics present
✅ All array fields properly typed
✅ Sample data validates
```

---

## TECHNICAL ANALYSIS

### Database Schema Verification

**Tables Confirmed to Exist:**
- ✅ bookings (with start_time, end_time, total_amount, customer_id, service_id)
- ✅ customers (with full_name)
- ✅ services (with name, is_active)
- ✅ profiles (with email, is_active)
- ✅ contact_messages (with status)
- ✅ activity_logs (with profile_id, action, details, created_at)
- ✅ notifications (with title, message, is_read, created_at)

**Columns Confirmed NOT to Exist:**
- ❌ bookings.booking_time (use start_time instead)
- ❌ notifications.body (use message instead)
- ❌ activity_logs.actor (use profile_id with JOIN instead)

### UI Contract Requirements

The dashboard overview (`src/features/dashboard/overview.tsx`) expects:

```typescript
interface DashboardStats {
  cards: {
    todays_bookings: number;
    pending_bookings: number;
    total_customers: number;
    active_services: number;
    staff_members: number;
    pending_messages: number;
    monthly_revenue: number;
  };
  revenue: Array<{ month: string; revenue: number }>;
  trends: Array<{ day: string; bookings: number }>;
  recentBookings: Array<RecentBooking>;
  activity: Array<ActivityItem>;
  notifications: Array<NotificationItem>;
}
```

### API Layer Verification

**Route:** `src/app/api/dashboard/stats/route.ts`
- Simple passthrough from `supabase.rpc('get_dashboard_stats')`
- Wraps in `{ success: true, data }`
- No transformation layer

**Client:** `src/lib/api.ts`
- `api.stats()` calls `/api/dashboard/stats`
- Returns raw data object
- UI destructures directly

**Conclusion:** API layer is correct. Problem is solely in the RPC function.

---

## SECURITY REVIEW

### SECURITY DEFINER Usage

**Justified:** YES

**Rationale:**
- Function aggregates across 7 tables
- Standard RLS would require per-table permissions
- Function contains NO dynamic SQL
- Function accepts NO user input
- SET search_path = public prevents injection
- Granted only to `authenticated` role

**Verdict:** Appropriate and properly secured

---

## PERFORMANCE CONSIDERATIONS

**Current Migration Status:**
- No indexes modified
- No new tables created
- No schema alterations
- Only function definition changed

**Optimization Reserved for Phase 5:**
- Materialized view consideration
- Index analysis
- Query plan optimization
- Caching strategy

---

## WHAT WAS NOT CHANGED

To maintain minimal scope:

❌ No frontend modifications  
❌ No API route modifications  
❌ No database schema changes  
❌ No new columns or tables  
❌ No performance optimizations  
❌ No TypeScript type regeneration  
❌ No repository abstractions

Only the RPC function definition was corrected.

---

## PHASE 4 PROGRESS

- [x] **Phase 4A:** Contract Inspection (NO CODE CHANGES)
- [x] **Phase 4B:** Minimal Contract Migration (3 schema fixes)
- [ ] **Phase 4C:** Apply Migration ⚠️ **USER ACTION REQUIRED**
- [ ] **Phase 4D:** Live RPC Verification (pending Phase 4C)
- [ ] **Phase 4E:** Application Verification (pending Phase 4D)
- [ ] **Phase 4F:** Final Decision & Comprehensive Report

---

## IMMEDIATE NEXT STEPS

### 1. User Applies Migration

**Choose ONE option from `APPLY_DASHBOARD_RPC_MIGRATION.md`:**

**Option A (Recommended):** Supabase Dashboard SQL Editor
**Option B:** Supabase CLI (`supabase db push`)
**Option C:** Direct psql connection

### 2. Run Verification

```bash
node scripts/phase4cd-apply-and-verify-rpc.mjs
```

**Expected outcome:** All checks pass, Phase 4D complete

### 3. Proceed to Phase 4E

Application-level testing with Next.js dev server to ensure:
- Dashboard loads without errors
- All cards display correct metrics
- Charts render properly
- Recent items populate
- No console errors

### 4. Complete Phase 4F

Generate final comprehensive report covering:
- Complete investigation timeline
- Root cause analysis
- Solution implementation
- Verification results
- Performance baseline
- Recommendations for Phase 5

---

## FILES CREATED

### Investigation Reports
- `PHASE_4A_CONTRACT_INSPECTION_REPORT.md`
- `PHASE_4B_MIGRATION_FIX_REPORT.md`
- `PHASE_4_DASHBOARD_RPC_INVESTIGATION_REPORT.md` (this file)

### Migration Files
- `supabase/migrations/20260815_fix_dashboard_stats_rpc.sql` (corrected)

### Scripts
- `scripts/phase4a-verify-database-schema.mjs`
- `scripts/phase4cd-apply-and-verify-rpc.mjs`

### Instructions
- `APPLY_DASHBOARD_RPC_MIGRATION.md`

---

## SUMMARY

The dashboard performance issue is caused by a **contract mismatch** between the database RPC and the UI expectations. The fix is straightforward: apply the corrected migration. No frontend or API changes are required. The investigation revealed the exact column mismatches and corrected them based on the actual live database schema.

**Status:** Ready for user to apply migration and proceed to verification phases.
