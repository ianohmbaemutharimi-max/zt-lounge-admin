# PHASE 4A: CONTRACT INSPECTION REPORT

**Date:** 2026-08-15  
**Status:** ❌ FAIL (Schema Mismatch Detected)

---

## EXECUTIVE SUMMARY

Phase 4A inspection revealed **critical schema mismatches** between the migration SQL and the actual live database schema. The migration cannot be applied as-is.

---

## UI CONTRACT MAPPING

### Dashboard Overview (src/features/dashboard/overview.tsx)

**Required Response Structure:**
```typescript
{
  cards: {
    todays_bookings: number
    pending_bookings: number
    total_customers: number
    active_services: number
    staff_members: number
    pending_messages: number
    monthly_revenue: number
  },
  revenue: Array<{ month: string, revenue: number }>,
  trends: Array<{ day: string, bookings: number }>,
  recentBookings: Array<RecentBooking>,
  activity: Array<ActivityItem>,
  notifications: Array<NotificationItem>
}
```

### API Route (src/app/api/dashboard/stats/route.ts)

- Simple pass-through from `get_dashboard_stats()` RPC
- Wraps result in `{ success: true, data }`
- No transformation layer

### Client API (src/lib/api.ts)

- `api.stats()` calls `/api/dashboard/stats`
- Returns raw data object
- UI expects `data.cards`, `data.revenue`, etc.

---

## DATABASE SCHEMA VERIFICATION

### ✅ PASS: Tables Exist

All required tables exist in the live database:
- bookings
- customers
- services  
- profiles
- contact_messages
- activity_logs
- notifications

### ❌ FAIL: Column Mismatches

**bookings table:**
```
Migration expects: booking_time
Actual column:     start_time, end_time
Also has:          total_amount ✅
```

**notifications table:**
```
Migration expects: body
Actual column:     message
Also has:          title, is_read, created_at ✅
```

**activity_logs table:**
```
Migration expects: actor
Actual column:     [DOES NOT EXIST]
Available:         profileId, action, details, created_at ✅
```

---

## ROOT CAUSE ANALYSIS

The migration file `supabase/migrations/20260815_fix_dashboard_stats_rpc.sql` was created based on **assumed** schema, not the **actual** live database schema.

### Critical Errors in Migration:

**Line 111:**
```sql
'bookingTime', b.booking_time::text,  -- ❌ WRONG
```
Should reference `start_time` instead.

**Line 145:**
```sql
'body', n.body,  -- ❌ WRONG
```
Should reference `message` instead.

**Line 128:**
```sql
'actor', a.actor,  -- ❌ WRONG
```
Column `actor` does not exist. Must derive from `profileId` via JOIN or use alternative approach.

---

## SCHEMA SOURCES VERIFIED

1. **src/db/schema.ts** (TypeScript schema definition)
2. **Live Supabase database** (via PostgREST API verification)
3. **Previous migration history** (confirms schema evolution)

---

## CONTRACT REQUIREMENTS

### Minimum Required Database Objects:

**Tables:**
- bookings(id, booking_date, start_time, end_time, status, total_amount, customer_id, service_id, booking_number, created_at)
- customers(id, full_name)
- services(id, name, is_active)
- profiles(id, is_active, email)
- contact_messages(id, status)
- activity_logs(id, profile_id, action, details, created_at)
- notifications(id, title, message, is_read, created_at)

**Required RPC:**
- get_dashboard_stats() returning JSONB

**Security:**
- SECURITY DEFINER appears necessary since the function aggregates across multiple tables
- Authenticated users need EXECUTE permission

---

## PHASE 4A VERDICT

**STATUS: FAIL**

Cannot proceed to Phase 4C (Apply Migration) with the current migration file.

**NEXT ACTION: Proceed to Phase 4B** to create corrected migration matching actual database schema.

---

## FILES INSPECTED (NO CHANGES)

- src/features/dashboard/overview.tsx
- src/app/api/dashboard/stats/route.ts
- src/lib/api.ts
- src/db/schema.ts
- supabase/migrations/20260815_fix_dashboard_stats_rpc.sql

**NO CODE MODIFICATIONS WERE MADE IN PHASE 4A.**
