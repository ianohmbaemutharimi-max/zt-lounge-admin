# PHASE 4D: DASHBOARD RPC REPAIR — MCP BLOCKAGE REPORT

**Date:** 2026-08-15  
**Time:** 14:07 UTC+3  
**Verdict:** **BLOCKED** — Supabase MCP unavailable for DDL execution

---

## EXECUTIVE SUMMARY

The dashboard RPC contract mismatch has been diagnosed and a corrected migration prepared. However, **automatic application via Supabase MCP is blocked** due to persistent "Not Found" errors across all Supabase MCP endpoints.

---

## MCP INVESTIGATION RESULTS

### Attempted MCP Operations

All Supabase MCP tools consistently return:
```json
{"error":{"name":"Error","message":"Not Found"}}
```

#### Operations Attempted:

1. **`cApsUn0mcp0list_tables`**
   - Project: `xgjobvdlhzfvyvytbmnq`
   - Schemas: `["public"]`
   - Result: `Error: Not Found`

2. **`cApsUn0mcp0execute_sql`**
   - Project: `xgjobvdlhzfvyvytbmnq`
   - Query: Schema inspection
   - Result: `Error: Not Found`

3. **`cApsUn0mcp0apply_migration`**
   - Project: `xgjobvdlhzfvyvytbmnq`
   - Name: `fix_dashboard_stats_rpc`
   - Result: `Error: Not Found`

### Root Cause Analysis

The "Not Found" error indicates one of:

1. **MCP Server Connectivity Issue**
   - Supabase MCP server may not be running or properly configured
   - Authentication/connection credentials may be invalid
   - Project ref may be incorrect

2. **API Endpoint Unavailability**
   - The specific Supabase MCP endpoints may not exist
   - API version mismatch
   - Required Supabase Management API access not granted

3. **Project Access Issue**
   - Project ID `xgjobvdlhzfvyvytbmnq` may not be accessible via MCP
   - User permissions insufficient for MCP operations
   - Project may be paused or in restricted state

---

## ALTERNATIVE APPLICATION METHODS EVALUATED

### Method 1: Service Role Client via PostgREST ❌

**Attempted:** `supabase.rpc('exec', { query: migrationSQL })`

**Result:** BLOCKED
```
Error: Could not find the function public.exec(query) in the schema cache
```

**Reason:** PostgREST does not expose DDL execution capabilities for security reasons.

### Method 2: Supabase MCP ❌

**Attempted:** Multiple MCP tools (`list_tables`, `execute_sql`, `apply_migration`)

**Result:** BLOCKED
```
Error: Not Found
```

**Reason:** MCP endpoints return 404, indicating connectivity/configuration/access issues.

### Method 3: Supabase CLI ⚠️

**Status:** Not attempted programmatically

**Command:** `supabase db push`

**Constraint:** Requires:
- Supabase CLI installed and configured
- Migration history reconciliation
- Interactive confirmation

**Risk:** May conflict with existing migration state.

---

## CURRENT DATABASE STATE

### Live RPC Output (INCORRECT)

```json
{
  "bookings": 4,
  "customers": 4,
  "services": 6,
  "messages": 2
}
```

**Problems:**
- Missing `cards` structure
- Missing `revenue` array
- Missing `trends` array
- Missing `recentBookings` array
- Missing `activity` array
- Missing `notifications` array

### Expected UI Contract

```typescript
{
  cards: {
    todays_bookings: number,
    pending_bookings: number,
    total_customers: number,
    active_services: number,
    staff_members: number,
    pending_messages: number,
    monthly_revenue: number
  },
  revenue: Array<{ month: string, revenue: number }>,
  trends: Array<{ day: string, bookings: number }>,
  recentBookings: Array<Booking>,
  activity: Array<Activity>,
  notifications: Array<Notification>
}
```

---

## MIGRATION STATUS

### Corrected Migration File

**Location:** `supabase/migrations/20260815_fix_dashboard_stats_rpc.sql`

**Status:** ✅ Ready, ❌ Not applied

**Schema Corrections Made:**
1. ✅ `booking_time` → `start_time` (bookings.start_time exists)
2. ✅ `notifications.body` → `notifications.message`
3. ✅ `activity_logs.actor` → `profiles.email` via JOIN on `profile_id`

**Security:**
- ✅ `SECURITY DEFINER`
- ✅ `SET search_path = public`
- ✅ `GRANT EXECUTE ON FUNCTION ... TO authenticated`
- ✅ No `PUBLIC` grants

---

## MANUAL APPLICATION REQUIRED

Since automatic application is blocked, **manual intervention is required**.

### ✅ RECOMMENDED: Supabase Dashboard SQL Editor

1. Navigate to: **https://supabase.com/dashboard**
2. Select project: **ZT Lounge** (xgjobvdlhzfvyvytbmnq)
3. Open: **SQL Editor** (left sidebar)
4. Create: **New Query**
5. Copy/paste entire contents of:
   ```
   supabase/migrations/20260815_fix_dashboard_stats_rpc.sql
   ```
6. Execute: Click **Run** or press `Ctrl+Enter`
7. Verify: Success message appears

### Alternative: Supabase CLI

```bash
# If migration history needs repair:
supabase migration repair --status reverted <timestamp>

# Then push:
supabase db push
```

### Alternative: Direct psql

```bash
psql "postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres" \
  -f supabase/migrations/20260815_fix_dashboard_stats_rpc.sql
```

---

## POST-APPLICATION VERIFICATION

After manual application, run:

```bash
node scripts/apply-dashboard-rpc-live.mjs
```

**Expected output:**
```
✅ RPC ALREADY HAS CORRECT CONTRACT
   No repair needed. Dashboard should be working.
```

This will verify:
- ✅ Function returns all 6 top-level keys
- ✅ `cards` contains all 7 metrics
- ✅ All array fields are properly typed

---

## BUILD & TYPECHECK STATUS

**Typecheck:** ✅ PASS
```bash
npm run typecheck
# Exit code: 0
```

**Build:** ✅ PASS
```bash
npm run build
# Next.js 16.2.6
# 19 routes compiled
# Exit code: 0
```

**Upload Route:** ✅ NO ISSUES
- Inspected `src/app/api/admin/upload/route.ts:277`
- Syntax: `mime_type: declaredMimeType,` is correct
- No parser errors detected

---

## FILES CHANGED

**Production Code:** 0 files modified

**Investigation Scripts:**
- `scripts/apply-dashboard-rpc-live.mjs` (diagnostic)
- `PHASE_4D_FINAL_MCP_BLOCKAGE_REPORT.md` (this report)

**Migration Files:**
- `supabase/migrations/20260815_fix_dashboard_stats_rpc.sql` (corrected, ready)

---

## ROOT CAUSE: CONTRACT MISMATCH

### Problem
The live `get_dashboard_stats()` RPC returns a flat structure incompatible with the dashboard UI's nested contract requirements.

### Why It Happened
1. Original RPC used incorrect column names
2. Function existed but used outdated schema references
3. Migration file created but never applied to live database

### Why Previous Tests Didn't Catch It
- RPC executed successfully (no SQL errors)
- Tests didn't validate response structure
- Dashboard errors may have been attributed to other issues

---

## BLOCKAGE SUMMARY

| Method | Status | Reason |
|--------|--------|--------|
| Supabase MCP | ❌ BLOCKED | All endpoints return "Not Found" |
| PostgREST client | ❌ BLOCKED | DDL execution not permitted |
| Supabase CLI | ⚠️ Available | Requires manual execution |
| Dashboard SQL Editor | ✅ Available | Requires manual execution |
| Direct psql | ✅ Available | Requires credentials & manual execution |

---

## NEXT STEPS

1. **User** applies migration via Supabase Dashboard SQL Editor
2. **Verify** via `node scripts/apply-dashboard-rpc-live.mjs`
3. **Test** dashboard overview page in browser
4. **Confirm** all 7 card metrics display correctly
5. **Proceed** to next phase if needed

---

## CONCLUSION

The dashboard RPC issue has been **fully diagnosed** and the corrected migration is **ready for application**. However, programmatic application via Supabase MCP is **blocked** due to persistent "Not Found" errors across all MCP endpoints.

This is an **infrastructure/configuration limitation**, not a code defect.

**Manual database operation required to proceed.**

---

## SUPABASE MCP DIAGNOSTIC DETAILS

### MCP Server Information
- **Server Name:** `supabase`
- **Available Tools:** 20+ tools detected in system prompt
- **Connection Status:** Unknown (all operations return 404)

### Possible Resolution Paths

1. **Check MCP Server Status**
   ```bash
   # If MCP server is separate service:
   mcp-server status supabase
   ```

2. **Verify MCP Configuration**
   - Check MCP server configuration file
   - Verify Supabase Management API credentials
   - Confirm project access permissions

3. **Restart MCP Server**
   ```bash
   # If applicable:
   mcp-server restart supabase
   ```

4. **Alternative: Use Supabase Management API Directly**
   - Requires API key with appropriate scopes
   - Direct REST API calls bypass MCP layer
   - Not currently implemented in this codebase

---

**Status:** Investigation complete, migration prepared, manual application required  
**Blocker:** Supabase MCP "Not Found" on all endpoints  
**Workaround:** Manual SQL execution via Supabase Dashboard
