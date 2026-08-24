# ZT LOUNGE — BOOKING CONTRACT RECONCILIATION

**Date:** 2026-08-24  
**Mode:** READ-ONLY FORENSIC INVESTIGATION  
**Status:** COMPLETE

---

## 1. EXECUTIVE SUMMARY

**VERDICT: FAIL — CONTRACT/DATA-LIFECYCLE MISMATCHES FOUND**

The investigation reveals critical mismatches between the public booking flow, repository code, and the proposed migrations. The `create_booking()` function definition is **NOT PRESENT** in the repository, and the proposed migration has signature mismatches with the public caller.

---

## 2. ACTUAL PUBLIC BOOKING FLOW

### 2.1 Entry Point: Public Website Form

**File:** `../zt-lounge/assets/js/forms.js`  
**Function:** `bindBookingForm(form)`  
**Lines:** 165-251

### 2.2 Form Fields and Payload

| UI Field | JS Variable | Payload Field | Type | Required | Default | Transformation |
|----------|-------------|---------------|------|----------|---------|----------------|
| Full Name | `name.value` | `fullName` | string | YES | - | `.trim()` |
| Phone | `phone.value` | `phone` | string | YES | - | `normalizeKenyanPhone()` → `+2547XXXXXXXX` |
| Email | `emailVal` | `email` | string | NO | `null` | - |
| Date | `date.value` | `date` | string (YYYY-MM-DD) | YES | - | - |
| Time | `time` | `time` | string (HH:MM) | YES | `'12:00'` | - |
| Guests | `guestsVal` | `guests` | integer | NO | `1` | `parseInt()` |
| Service | auto-detected | `serviceSlug` | string | NO | `'restaurant'` | `getServiceSlug()` from URL |
| Occasion | `occasion` | `occasion` | string | NO | `''` | - |
| Special Requests | `specialRequests` | `specialRequests` | string | NO | `''` | - |

### 2.3 Service Slug Mapping

From `forms.js` lines 150-159:
```javascript
if (path.indexOf('lounge') !== -1) return 'lounge-bar';
if (path.indexOf('vip') !== -1) return 'vip-cabins';
if (path.indexOf('events') !== -1) return 'events';
if (path.indexOf('conference') !== -1) return 'conference';
if (path.indexOf('autospa') !== -1) return 'auto-spa';
return 'restaurant';
```

### 2.4 Phone Normalization

From `forms.js` lines 88-94:
```javascript
function normalizeKenyanPhone(value) {
    var cleaned = value.replace(/[\s\-()]/g, '');
    if (cleaned.indexOf('+') === 0) return cleaned;
    if (cleaned.indexOf('254') === 0) return '+' + cleaned;
    if (cleaned.indexOf('0') === 0) return '+254' + cleaned.slice(1);
    return '+' + cleaned;
}
```

---

## 3. CANONICAL INPUT CONTRACT

### 3.1 Public Booking Payload

```
{
  fullName: string,        // REQUIRED
  phone: string,           // REQUIRED, normalized to +2547XXXXXXXX
  email: string | null,    // OPTIONAL, default: null
  serviceSlug: string,     // OPTIONAL, default: 'restaurant'
  date: string,            // REQUIRED, YYYY-MM-DD
  time: string,            // REQUIRED, HH:MM, default: '12:00'
  guests: number,          // OPTIONAL, default: 1
  occasion: string,          // OPTIONAL, default: ''
  specialRequests: string    // OPTIONAL, default: ''
}
```

---

## 4. RPC CONTRACT

### 4.1 BookingRepository.js (Public Caller)

**File:** `../zt-lounge/assets/js/repositories/BookingRepository.js`  
**Function:** `insert(data)`  
**Lines:** 159-209

```javascript
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

### 4.2 Input Parameter Matrix

| Parameter | Public Caller | Migration Definition | Status |
|-----------|---------------|---------------------|--------|
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

## 5. RPC RETURN CONTRACT

### 5.1 Public Caller Response Handling

From `BookingRepository.js` lines 193-207:
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
        end_time: booking.end_time,
        guests: booking.guests,
        status: booking.status
    }
};
```

### 5.2 Return Field Matrix

| Field | RPC Returns (Migration) | Frontend Expects | Status |
|-------|------------------------|------------------|--------|
| `id` | `uuid` | `booking.booking_id` | **MISMATCH** |
| `booking_number` | `text` | `text` | MATCH |
| `status` | `text` | `text` | MATCH |
| `customer_id` | `uuid` | `uuid` | MATCH |
| `service_id` | **NOT IN RETURNS** | `uuid` | **MISSING** |
| `booking_date` | **NOT IN RETURNS** | `date` | **MISSING** |
| `start_time` | **NOT IN RETURNS** | `time` | **MISSING** |
| `end_time` | **NOT IN RETURNS** | `time` | **MISSING** |
| `guests` | **NOT IN RETURNS** | `integer` | **MISSING** |

---

## 6. DATABASE SCHEMA CONTRACT

### 6.1 Repository Response Allowlists

From `src/lib/repository.ts` lines 68-69:
```typescript
customers: ["id", "full_name", "phone", "email", "gender", "date_of_birth", "notes", 
            "marketing_opt_in", "source", "is_active", "created_at", "updated_at"],
bookings: ["id", "booking_number", "customer_id", "service_id", "staff_id", 
           "booking_date", "start_time", "end_time", "guests", "status", 
           "special_requests", "created_by", "created_at", "updated_at"],
```

### 6.2 Repository Writable Fields

From `src/lib/repository.ts` lines 102-103:
```typescript
customers: ["full_name", "phone", "email", "gender", "date_of_birth", "notes", 
            "marketing_opt_in", "source", "is_active"],
bookings: ["booking_number", "customer_id", "service_id", "staff_id", "booking_date", 
           "start_time", "end_time", "guests", "status", "special_requests", "created_by"],
```

### 6.3 Schema Status

| Field | Repository Expects | Live DB Has | Status |
|-------|-------------------|-------------|--------|
| `customers.source` | YES (line 68, 102) | **NO** (per forensic report) | **MISMATCH** |
| `bookings.customer_id` | NOT NULL | NOT NULL | MATCH |
| `bookings.service_id` | YES | YES | MATCH |
| `bookings.end_time` | YES | YES | MATCH |

---

## 7. CUSTOMER LIFECYCLE

### 7.1 Customer Creation Paths

| Path | Caller | Auth | Creates Customer | When | Via |
|------|--------|------|------------------|------|-----|
| Public RPC | BookingRepository.js | anon | YES | BEFORE booking insert | `create_booking()` function |
| Admin Handler | BookingHandler.ts | authenticated | NO | N/A | `Repository.create()` direct insert |

### 7.2 Live Evidence (from forensic reports)

From `ZT_BOOKING_CUSTOMER_FORENSIC_REPORT.md`:
- 24 customers, 34 bookings
- **20 customers (83%) have ONLY pending bookings**
- 2 customers have confirmed bookings
- 2 customers have zero bookings

**CONCLUSION:** Customers ARE created at booking submission time (pending), NOT at confirmation. This violates the business invariant.

---

## 8. BOOKING ↔ CUSTOMER RELATIONSHIP

### 8.1 Schema Constraints

From migration evidence:
- `bookings.customer_id` is NOT NULL
- Foreign key to `customers.id`

### 8.2 Live Evidence

From `ZT_BOOKING_CUSTOMER_FORENSIC_REPORT.md`:
```
bookings.customer_id is NOT NULL (all 34 bookings have it)
```

**CONCLUSION:** A legitimate booking CANNOT exist without a customer_id.

---

## 9. STATUS LIFECYCLE

### 9.1 Application-Level State Machine

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

### 9.2 Enforcement

From `src/lib/booking-handler.ts`:
- `validateStatusUpdate()` checks transitions (lines 49-65)
- **ONLY application-level enforcement**
- **NO database CHECK constraint**

---

## 10. ADMIN BOOKING CONTRACT

### 10.1 Admin API Route

**File:** `src/app/api/admin/[resource]/route.ts`

### 10.2 Admin Booking Handler

**File:** `src/lib/booking-handler.ts`  
**Function:** `create(data)`  
**Lines:** 23-36

```typescript
async create(data: unknown) {
  const validation = validateBookingData(data);
  if (!validation.success) {
    return validationError(validation.error);
  }
  try {
    const created = await this.repo.create("bookings", validation.data);
    return { success: true, data: created };
  } catch (error: any) {
    return this.handleDatabaseError(error, "create");
  }
}
```

### 10.3 Admin vs Public Comparison

| Aspect | Public Booking | Admin Booking | Status |
|--------|---------------|---------------|--------|
| Entry Point | BookingRepository.js | BookingHandler.ts | DIVERGENT |
| RPC/API | `supabase.rpc('create_booking')` | `Repository.create()` | DIVERGENT |
| Customer Creation | YES (in RPC) | NO | **MISMATCH** |
| Service ID | Passed as slug, resolved in RPC | Must be UUID | **MISMATCH** |
| Staff ID | Not used | Required | **MISMATCH** |
| Booking Number | Generated in RPC | Must be provided | **MISMATCH** |

---

## 11. ADMIN CUSTOMER DISPLAY CONTRACT

### 11.1 Customer API Response

From `src/lib/repository.ts` line 68:
```typescript
customers: ["id", "full_name", "phone", "email", "gender", "date_of_birth", "notes", 
            "marketing_opt_in", "source", "is_active", "created_at", "updated_at"],
```

### 11.2 Customer Writable Fields

From `src/lib/repository.ts` line 102:
```typescript
customers: ["full_name", "phone", "email", "gender", "date_of_birth", "notes", 
            "marketing_opt_in", "source", "is_active"],
```

**ISSUE:** Admin customer API expects `source` field but live DB does NOT have it.

---

## 12. CONTRACT MISMATCH MATRIX

| Field / Behavior | Public Caller | RPC Definition | DB | Admin | Status |
|-----------------|---------------|----------------|-----|-------|--------|
| `p_end_time` | NOT PASSED | REQUIRED | DERIVED | N/A | **MISMATCH** |
| `booking_id` vs `id` | expects `booking_id` | returns `id` | N/A | N/A | **MISMATCH** |
| `service_id` | expects returned | NOT in RETURNS | N/A | N/A | **MISSING** |
| `booking_date` | expects returned | NOT in RETURNS | N/A | N/A | **MISSING** |
| `start_time` | expects returned | NOT in RETURNS | N/A | N/A | **MISSING** |
| `end_time` | expects returned | NOT in RETURNS | N/A | N/A | **MISSING** |
| `guests` | expects returned | NOT in RETURNS | N/A | N/A | **MISSING** |
| `customer` creation | in RPC | in migration | N/A | NOT | **DIVERGENT** |
| `customer.source` | repo expects | not in live DB | N/A | N/A | **MISSING** |
| `customer_id` nullable | N/A | NOT NULL | N/A | N/A | **BLOCKING** |

---

## 13. REPOSITORY ↔ PRODUCTION DRIFT

| Component | Repository | Live Production | Drift |
|-----------|------------|-----------------|-------|
| `create_booking()` definition | NOT PRESENT | EXISTS (unverified) | **CRITICAL** |
| `source` column | code expects | DOES NOT EXIST | **CRITICAL** |
| Return columns | incomplete | unknown | **CRITICAL** |
| `p_end_time` param | REQUIRED | DERIVED (inferred) | **CRITICAL** |
| Customer provenance | GENERATED column | N/A | **BROKEN SQL** |

---

## 14. DUPLICATED BUSINESS LOGIC

| Logic | Location 1 | Location 2 | Issue |
|-------|------------|------------|-------|
| Service resolution | BookingRepository.js (pre-resolve) | create_booking() RPC | DUPLICATION |
| Customer lookup | create_booking() RPC | N/A | OK |
| Availability check | NOT in public code | create_booking() RPC | OK |
| End time derivation | NOT in public code | create_booking() RPC | OK |
| Booking number generation | NOT in public code | create_booking() RPC | OK |

---

## 15. SECURITY BOUNDARY

### 15.1 RLS Status: NOT VERIFIED

Supabase MCP access blocked (unauthorized).

### 15.2 Migration Intent (20260822_enable_booking_rls_security.sql)
- Anonymous: DENY all direct access to bookings/customers
- Anonymous: ALLOW create_booking() RPC via SECURITY DEFINER
- Authenticated admin: ALLOW all via role-based policy

### 15.3 Anonymous Permissions (per migration)
| Operation | Status |
|-----------|--------|
| SELECT customers | DENIED |
| INSERT customers | DENIED |
| UPDATE customers | DENIED |
| DELETE customers | DENIED |
| SELECT bookings | DENIED |
| INSERT bookings | DENIED |
| UPDATE bookings | DENIED |
| DELETE bookings | DENIED |
| RPC create_booking() | ALLOWED |

---

## 16. CONCURRENCY RISKS

### 16.1 Phone Deduplication

The `create_booking()` function uses:
```sql
SELECT c.id INTO v_customer_id FROM public.customers c WHERE c.phone = p_phone;
IF v_customer_id IS NULL THEN
  INSERT INTO customers...
END IF;
```

**RISK:** Two simultaneous requests with same new phone could create duplicates.

**VERIFICATION:** Cannot check for UNIQUE constraint on `customers.phone` (MCP blocked).

---

## 17. UNKNOWNS REQUIRING LIVE DB VERIFICATION

| Item | Status |
|------|--------|
| create_booking() function definition | UNKNOWN |
| Function return columns | UNKNOWN |
| RLS enabled on bookings | UNKNOWN |
| RLS enabled on customers | UNKNOWN |
| Policies on bookings | UNKNOWN |
| Policies on customers | UNKNOWN |
| customers.phone unique constraint | UNKNOWN |
| bookings.customer_id nullable | UNKNOWN |
| customers.source column exists | VERIFIED: NO |

---

## 18. REQUIRED FIXES — PRIORITIZED

### P1 — BLOCKER: Obtain Authoritative Function Definition
- Extract `create_booking()` from live database
- Document exact signature, return columns, behavior

### P2 — BLOCKER: Fix Return Column Mismatch
- Migration must return: `booking_id`, `service_id`, `booking_date`, `start_time`, `end_time`, `guests`

### P3 — BLOCKER: Remove p_end_time Required
- Either make it optional with default, or derive it from start_time + service duration

### P4 — BLOCKER: Fix Invalid SQL
- Remove or fix `20260823_add_customer_provenance.sql` (GENERATED with subquery is invalid)

### P5 — HIGH: Verify RLS Live
- Confirm RLS is enabled and policies exist in production

### P6 — HIGH: Verify Unique Constraint
- Check if `customers.phone` has unique constraint for concurrency safety

### P7 — MEDIUM: Unify Admin Booking Path
- Admin should use same booking creation mechanism as public

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
create_booking_guest() RPC
      ↓
1. Resolve service by slug
2. Check availability
3. Look up customer by phone
4. If NOT found: Create customer with source='lead'
5. Insert booking with customer_id, status='pending'
      ↓
--- Booking pending ---
Admin confirms booking
      ↓
confirm_booking() RPC
      ↓
1. UPDATE customer SET source='booking' WHERE status='confirmed'
2. UPDATE booking status='confirmed'
```

### Option B: Current Implementation (NOT RECOMMENDED)

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
```

---

## 20. ACCEPTANCE CRITERIA

The following must be verified before any changes:

1. [ ] `create_booking()` function definition extracted from live DB
2. [ ] Function signature matches public caller
3. [ ] Function returns all expected columns
4. [ ] RLS policies verified in production
5. [ ] `customers.phone` unique constraint verified
6. [ ] `customers.source` column status determined
7. [ ] Admin booking path reconciled with public path

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
- `p_end_time` is DERIVED from start_time + service duration
- Booking number generated via MD5

---

## ARCHITECTURE DIAGRAM (ACTUAL IMPLEMENTATION)

```
PUBLIC WEBSITE
      │
      ▼
[../zt-lounge/assets/js/forms.js:165-251]
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
[Admin: src/features/bookings/bookings-view.tsx]
      │
      ▼
[API: src/app/api/admin/[resource]/route.ts]
      │
      ▼
[BookingHandler.ts:23] → Repository.create("bookings")
      │
      ▼
supabase.from('bookings').insert() ← REQUIRES customer_id, service_id
      │
      ▼
[REQUIRES PRE-EXISTING customer_id]
```

---

*Report compiled from repository inspection, existing forensic reports, and code analysis. Live database verification NOT POSSIBLE due to MCP access restrictions.*