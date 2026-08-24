# ZT LOUNGE — PUBLIC BOOKING → CUSTOMER END-TO-END AUDIT

**Date:** 2026-08-24  
**Mode:** READ-ONLY FORENSIC INVESTIGATION  
**Status:** INVESTIGATION IN PROGRESS

---

## 1. EXECUTIVE SUMMARY

**VERIFICATION STATUS:** BLOCKED — LIVE DATABASE COULD NOT BE VERIFIED

The investigation reveals significant repository-to-production drift with unverifiable live database state. Key findings:

1. **Repository drift:** `create_booking()` function definition is NOT in the repository
2. **Contract mismatch:** Migration signature differs from public caller
3. **Invalid SQL:** Customer provenance migration uses unsupported PostgreSQL syntax
4. **Live database unverified:** Supabase MCP access blocked

---

## 2. ACTUAL PUBLIC BOOKING FLOW

### 2.1 Entry Point
- **File:** `../zt-lounge/assets/js/repositories/BookingRepository.js`
- **Function:** `insert(bookingData)`
- **Line:** 159-209

### 2.2 RPC Call
```javascript
// Line 180-189
return client.rpc('create_booking', {
    p_full_name: data.fullName,
    p_phone: data.phone,
    p_booking_date: data.date,
    p_start_time: startTime,
    p_guests: data.guests || 1,
    p_email: data.email || null,
    p_service_slug: serviceSlug,
    p_special_requests: specialRequests || null
})
```

**CRITICAL:** `p_end_time` is NOT passed by the public caller.

---

## 3. FRONTEND CONTRACT

| UI Field | JS Variable | Payload Field | Type | Required | Transformation |
|----------|-------------|---------------|------|----------|----------------|
| Name | `fullName` | `p_full_name` | string | YES | direct |
| Phone | `phone` | `p_phone` | string | YES | direct |
| Date | `date` | `p_booking_date` | string (YYYY-MM-DD) | YES | direct |
| Time | `time` | `start_time` | string (HH:MM) | YES | `startTime` = `data.time \|\| '12:00'` |
| Guests | `guests` | `p_guests` | integer | NO | default: 1 |
| Email | `email` | `p_email` | string | NO | default: null |
| Service | `serviceSlug` | `p_service_slug` | string | NO | default: 'restaurant' |
| Occasion | `occasion` | `p_special_requests` | string | NO | prefixed with "Occasion: " |
| Special Requests | `specialRequests` | `p_special_requests` | string | NO | merged with occasion |

---

## 4. ENDPOINT CONTRACT MISMATCH MATRIX

| Field | Public Caller | Migration Definition | Issue |
|-------|---------------|---------------------|-------|
| `p_full_name` | ✓ | ✓ | MATCH |
| `p_phone` | ✓ | ✓ | MATCH |
| `p_email` | ✓ | ✓ | MATCH |
| `p_booking_date` | ✓ | ✓ | MATCH |
| `p_start_time` | ✓ | ✓ | MATCH |
| `p_end_time` | **NOT PASSED** | **REQUIRED** | **MISMATCH** |
| `p_guests` | ✓ | ✓ | MATCH |
| `p_service_slug` | ✓ | ✓ | MATCH |
| `p_special_requests` | ✓ | ✓ | MATCH |

---

## 5. DATABASE BOOKING CONTRACT

### 5.1 Expected Columns (from public caller response handling)
Line 196-206 of `BookingRepository.js`:
```javascript
var booking = result.data;
return {
    customerId: booking.customer_id,
    booking: {
        id: booking.booking_id,        // expects booking.booking_id
        booking_number: booking.booking_number,
        customer_id: booking.customer_id,
        service_id: booking.service_id,  // expects service_id
        booking_date: booking.booking_date,
        start_time: booking.start_time,
        end_time: booking.end_time,       // expects end_time
        guests: booking.guests,           // expects guests
        status: booking.status
    }
};
```

### 5.2 Migration Return Type
From `20260824_create_booking_function.sql`:
```sql
RETURNS TABLE(
  id uuid,
  booking_number text,
  status text,
  customer_id uuid
)
```

**MISMATCHES:**
| Field | Migration Returns | Public Expects |
|-------|------------------|----------------|
| `id` vs `booking_id` | `id` | `booking.booking_id` |
| `service_id` | NOT IN RETURNS | REQUIRED |
| `booking_date` | NOT IN RETURNS | REQUIRED |
| `start_time` | NOT IN RETURNS | REQUIRED |
| `end_time` | NOT IN RETURNS | REQUIRED |
| `guests` | NOT IN RETURNS | REQUIRED |

---

## 6. AUTHORITATIVE BOOKING RPC SIGNATURE (INFERRED)

Based on public caller and forensic evidence:

```
FUNCTION: public.create_booking(
    p_full_name text,
    p_phone text,
    p_email text DEFAULT NULL,
    p_booking_date date,
    p_start_time time,
    p_guests integer DEFAULT 1,
    p_service_slug text DEFAULT NULL,
    p_special_requests text DEFAULT NULL
)
RETURNS TABLE(
    booking_id uuid,          -- NOT id
    booking_number text,
    service_id uuid,          -- REQUIRED
    customer_id uuid,
    booking_date date,        -- REQUIRED
    start_time time,          -- REQUIRED
    end_time time,            -- DERIVED, NOT INPUT
    guests integer,           -- REQUIRED
    status text               -- 'pending'
)
SECURITY DEFINER
```

---

## 7. SERVICE RESOLUTION

**Public website flow:** `BookingRepository.js` line 93-106

```javascript
function resolveService(client, slug) {
    return client.from('services')
        .select('id, duration_minutes')
        .eq('slug', slug)
        .eq('is_active', true)
        .maybeSingle()
}
```

**Issue:** The comment says "The RPC handles: service resolution, availability check" but the migration's function also does service lookup by slug. This is DUPLICATION. The public website pre-resolves the service but then passes the slug to the RPC.

---

## 8. BOOKING CREATION PIPELINE (MIGRATION)

From `20260824_create_booking_function.sql`:

```
1. Service lookup by p_service_slug
2. Customer lookup by phone
3. Customer INSERT if not found
4. Customer record CREATED AT THIS POINT
5. Booking number generation (MD5-based)
6. Booking INSERT with status='pending'
7. Return booking fields
```

**CRITICAL FINDING:** Customer is created BEFORE booking is confirmed. This violates the business invariant.

---

## 9. CUSTOMER CREATION / LINKAGE ANALYSIS

### 9.1 Public Booking Path
```
Guest submits → BookingRepository.insert() → create_booking() RPC
       ↓
SELECT customer by phone
       ↓ (if not found)
INSERT customer (full_name, phone, email)
       ↓
customer_id assigned
       ↓
INSERT booking with customer_id, status='pending'
```

**VERIFIED FROM EVIDENCE:**
- `CREATE_BOOKING_CONTRADICTION_RECONCILIATION_1787406459150.json` shows `customer_id` returned
- `ZT_BOOKING_CUSTOMER_FORENSIC_REPORT.md` line 285: "20 of 24 customers (83%) have ONLY pending bookings"
- `src/lib/booking-handler.ts` line 31: `this.repo.create("bookings", ...)` uses direct table INSERT

### 9.2 Admin Booking Path
```
Admin creates booking
       ↓
BookingHandler.create()
       ↓
Repository.create("bookings", data)
       ↓
supabase.from('bookings').insert()
       ↓
REQUIRES: customer_id, service_id (UUIDs)
       ↓
NO customer creation
```

**MISMATCH:** Public and admin paths have DIFFERENT booking creation mechanisms.

### 9.3 Customer Creation Matrix (INFERRED)

| Path | Caller | Auth | Creates Customer | When | Via |
|------|--------|------|------------------|------|-----|
| Public RPC | BookingRepository.js | anon | YES | BEFORE booking insert | create_booking() function |
| Admin Handler | BookingHandler.ts | authenticated | NO | N/A | Repository.create() direct insert |

---

## 10. CUSTOMER ↔ BOOKING RELATIONSHIP

### 10.1 Schema Constraints (Migration)
From `20260824_create_booking_function.sql`:
- `bookings.customer_id` is NOT NULL
- No mention of generating customer.id for pending bookings

### 10.2 Live Evidence
From `ZT_BOOKING_CUSTOMER_FORENSIC_REPORT.md`:
```
bookings columns: id, booking_number, customer_id, ...
bookings.customer_id is NOT NULL (all 34 bookings have it)
```

**CONCLUSION:** A legitimate booking CANNOT exist without a customer_id.

---

## 11. CUSTOMER PROVENANCE

### 11.1 Repository Code
From `src/lib/repository.ts`:
- Line 68: `customers` response allowslist includes `source`
- Line 102: `customers` writable fields includes `source`

### 11.2 Live Database
From `ZT_BOOKING_CUSTOMER_FORENSIC_REPORT.md`:
```
customers columns: id, full_name, phone, email, gender, date_of_birth, notes, 
                   marketing_opt_in, created_at, updated_at, is_active
```
**NO `source` column exists in live database.**

### 11.3 Migration Attempt
From `20260823_add_customer_provenance.sql`:
```sql
ADD COLUMN source text GENERATED ALWAYS AS (
    CASE WHEN EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.customer_id = customers.id
          AND b.status IN ('confirmed', 'completed')
    ) THEN 'booking' ELSE 'manual' END
) STORED
```

**CRITICAL FLAW:** PostgreSQL does NOT allow subqueries in `GENERATED ALWAYS` column expressions. This migration will FAIL.

---

## 12. STATUS LIFECYCLE

### 12.1 Application-Level State Machine
From `src/lib/booking-validation.ts` lines 125-131:

```typescript
export const VALID_STATUS_TRANSITIONS = {
  pending: ["confirmed", "cancelled", "no_show"],
  confirmed: ["completed", "cancelled", "no_show"],
  completed: [], // Terminal
  cancelled: [], // Terminal
  no_show: []    // Terminal
};
```

### 12.2 Enforcement
From `src/lib/booking-handler.ts` lines 41-73:
- `validateStatusUpdate()` checks transitions
- **ONLY application-level enforcement**
- **NO database CHECK constraint**

---

## 13. ADMIN DISPLAY PIPELINE

### 13.1 Customer Display
From `src/features/customers/customers-view.tsx` and admin routes:
- Fetches from `/api/admin/customers`
- Returns `id, full_name, phone, email, gender, date_of_birth, notes, marketing_opt_in, source, is_active, created_at, updated_at`

**ISSUE:** Admin expects `source` field but live DB doesn't have it.

### 13.2 Booking Display
From `src/features/bookings/bookings-view.tsx`:
- Fetches from `/api/admin/bookings`
- Returns various booking fields

---

## 14. SECURITY BOUNDARY

### 14.1 RLS Policies (Migration Intent)
From `20260822_enable_booking_rls_security.sql`:
- Anonymous: DENY all direct access to bookings/customers
- Anonymous: ALLOW create_booking() RPC
- Authenticated admin: ALLOW all via `bookings_admin_all`/`customers_admin_all` policies

### 14.2 Live Verification Status: NOT VERIFIED
- Supabase MCP access requires authorization not available
- Could not query pg_policies or verify RLS is enabled

---

## 15. CONCURRENCY RISKS

### 15.1 Phone Deduplication in create_booking()
```sql
SELECT c.id INTO v_customer_id FROM public.customers c WHERE c.phone = p_phone;
IF v_customer_id IS NULL THEN
  INSERT INTO customers...
END IF;
```

**RISK:** Two simultaneous requests with same new phone could create duplicates.

**VERIFICATION:** Cannot check for UNIQUE constraint on `customers.phone` (MCP blocked).

---

## 16. MATCH vs MISMATCH MATRIX

| Field / Behavior | Public Caller | Repository RPC | DB | Admin | Status |
|-----------------|---------------|----------------|-----|-------|--------|
| `p_end_time` | NOT PASSED | REQUIRED | DERIVED | N/A | **MISMATCH** |
| `booking_id` vs `id` | expects `booking_id` | returns `id` | N/A | N/A | **MISMATCH** |
| `service_id` | expects returned | NOT in RETURNS | N/A | N/A | **MISMATCH** |
| `booking_date` | expects returned | NOT in RETURNS | N/A | N/A | **MISMATCH** |
| `start_time` | expects returned | NOT in RETURNS | N/A | N/A | **MISMATCH** |
| `end_time` | expects returned | NOT in RETURNS | N/A | N/A | **MISMATCH** |
| `guests` | expects returned | NOT in RETURNS | N/A | N/A | **MISMATCH** |
| `customer` creation | in RPC | in migration | N/A | NOT | **DIVERGENT** |
| `customer.source` | repo expects | not in live DB | N/A | N/A | **MISSING** |
| `customer_id` nullable | N/A | NOT NULL | N/A | N/A | **BLOCKING** |

---

## 17. REPOSITORY ↔ PRODUCTION DRIFT

| Component | Repository | Live Production | Drift |
|-----------|------------|-----------------|-------|
| create_booking() definition | NOT PRESENT | EXISTS (unverified) | **CRITICAL** |
| `source` column | code expects | DOES NOT EXIST | **CRITICAL** |
| Return columns | incomplete | unknown | **CRITICAL** |
| `p_end_time` param | REQUIRED | DERIVED (inferred) | **CRITICAL** |
| Customer provenance | GENERATED column | N/A | **BROKEN SQL** |

---

## 18. REQUIRED FIXES — PRIORITIZED

### P1 — BLOCKER: Obtain Authoritative Function Definition
- Extract `create_booking()` from live database
- Document exact signature, return columns, behavior

### P2 — BLOCKER: Fix Invalid SQL
- Remove or fix `20260823_add_customer_provenance.sql` (GENERATED with subquery is invalid)

### P3 — BLOCKER: Fix Return Column Mismatch
- Migration must return all columns expected by public caller
- `booking_id` (not `id`), `service_id`, `booking_date`, `start_time`, `end_time`, `guests`

### P4 — BLOCKER: Remove p_end_time Required
- Either make it optional with default, or derive it from start_time + service duration

### P5 — HIGH: Verify RLS Live
- Confirm RLS is enabled and policies exist in production

### P6 — HIGH: Verify Unique Constraint
- Check if `customers.phone` has unique constraint for concurrency safety

### P7 — MEDIUM: Unify Admin Booking Path
- Admin should use same booking creation mechanism as public
- Consider shared server-side booking service RPC

### P8 — MEDIUM: Add Missing `source` Column
- If provenance tracking is required

---

## 19. RECOMMENDED TARGET ARCHITECTURE

### Option A: Preserve Business Invariant (Recommended)
```
PUBLIC WEBSITE
      ↓
BookingRepository.js
      ↓
create_booking_guest() RPC (NEW - for public bookings)
      ↓
1. Resolve service by slug
2. Check availability
3. Look up customer by phone
4. If NOT found: Create customer with source='lead' (temporary)
5. Insert booking with customer_id, status='pending'
      ↓
--- Booking pending ---
Admin confirms booking
      ↓
confirm_booking() RPC (NEW)
      ↓
1. Check if customer_id exists
2. If customer has no 'pending' bookings linking: UPDATE customer source='booking'
3. UPDATE booking status='confirmed'
```

### Option B: Current Implementation
```
PUBLIC WEBSITE
      ↓
create_booking() RPC
      ↓
1. Service lookup
2. Customer created/upserted
3. Booking inserted with status='pending', customer_id NOT NULL
      ↓
--- Customer already linked at 'pending' phase ---
Admin updates status
```

**RECOMMENDATION:** Option A aligns with business requirement that customers become "legitimate" at confirmation.

---

## 20. VERIFICATION PLAN

### 20.1 Prerequisites
1. Access to live Supabase database (project: jczwilrysvnhcjzjztbi)
2. Service role key for metadata queries
3. Ability to run: `SELECT * FROM pg_get_functiondef('create_booking'::regproc)`

### 20.2 Verification Queries
```sql
-- Function definition
SELECT pg_get_functiondef('create_booking'::regproc);

-- Table constraints
SELECT * FROM information_schema.columns WHERE table_name = 'bookings';
SELECT * FROM information_schema.columns WHERE table_name = 'customers';
SELECT * FROM information_schema.key_column_usage WHERE table_name = 'customers';

-- RLS status
SELECT relrowsecurity FROM pg_class WHERE relname = 'bookings';
SELECT relrowsecurity FROM pg_class WHERE relname = 'customers';

-- Policies
SELECT * FROM pg_policies WHERE tablename IN ('bookings', 'customers');
```

---

## 21. FINAL VERDICT

```
FAIL — CONTRACT/DATA-LIFECYCLE MISMATCHES FOUND
```

### VERIFIED FROM CODE
- Public booking calls `create_booking()` RPC via `supabase.rpc()`
- `p_end_time` is NOT passed by public caller
- Return columns expected by public: `booking_id`, `service_id`, `booking_date`, `start_time`, `end_time`, `guests`
- Admin booking uses `Repository.create()` direct table INSERT
- Status transitions enforced only at application level
- Repository code references `customer.source` field

### VERIFIED FROM EXISTING FORENSIC REPORTS
- 20/24 customers (83%) have ONLY pending bookings
- `bookings.customer_id` is NOT NULL in live database
- No `source` column exists in live database
- `create_booking()` exists and is callable by anon role

### LIVE DATABASE VERIFICATION
```
NOT VERIFIED — Supabase MCP access blocked (unauthorized)
```

### INFERRED
- `p_end_time` is DERIVED from start_time + service duration (based on RPC comments)
- Booking number generated via MD5 (based on format `ZT-6CF7F501`)

---

## APPENDIX: ARCHITECTURE DIAGRAM (ACTUAL IMPLEMENTATION)

```
PUBLIC WEBSITE
      │
      ▼
[../zt-lounge/assets/js/repositories/BookingRepository.js:180-189]
      │
      ▼
supabase.rpc('create_booking', {...})  ← p_end_time NOT included
      │
      ▼
[Database function: create_booking()] ← NOT in repository (MISSING)
      │
      ├── 1. Service lookup by slug
      ├── 2. Customer lookup by phone
      ├── 3. Customer INSERT if not found ← CREATES CUSTOMER AT PENDING
      ├── 4. Booking INSERT with status='pending', customer_id NOT NULL
      │
      ▼
[bookings table]
      │
      ▼
Status: pending → (admin action) → confirmed/completed/cancelled/no_show
      │
      ▼
[Admin: bookings-view.tsx + BookingHandler.ts:41]
      │
      ▼
Repository.update("bookings", id, {status: ...})
      │
      ▼
supabase.from('bookings').update()
      │
      ▼
CUSTOMER (already linked, no provenance tracking)
```

### ADMIN BOOKING PATH (DIFFERENT FROM PUBLIC)

```
Admin POST /api/admin/[resource]
      │
      ▼
[src/app/api/admin/[resource]/route.ts]
      │
      ▼
BookingHandler.create() [src/lib/booking-handler.ts:23]
      │
      ▼
Repository.create("bookings") [src/lib/repository.ts:303]
      │
      ▼
supabase.from('bookings').insert() ← REQUIRES customer_id, service_id
      │
      ▼
[REQUIRES PRE-EXISTING customer_id]
```

---

*Report compiled from repository inspection, existing forensic reports, and code analysis. Live database verification NOT POSSIBLE due to MCP access restrictions.*