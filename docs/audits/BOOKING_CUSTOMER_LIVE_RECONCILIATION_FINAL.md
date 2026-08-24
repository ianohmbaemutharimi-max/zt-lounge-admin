# ZT LOUNGE — LIVE DATABASE BOOKING CONTRACT RECONCILIATION FINAL

**Date:** 2026-08-24  
**Author:** Forensic Audit + Implementation Plan  
**Mode:** READ-ONLY ANALYSIS (Live database access required for execution)  

---

## 1. BEFORE ARCHITECTURE

### 1.1 Current State (From Forensic Evidence)

**Public Booking Flow:**
```
Public Website (../zt-lounge/)
  ↓
forms.js → BookingRepository.js
  ↓
supabase.rpc('create_booking', {
  p_full_name, p_phone, p_booking_date, p_start_time,
  p_guests, p_email, p_service_slug, p_special_requests
})
  ↓
Live create_booking() RPC (exists in production only)
  ↓
Customer created at PENDING booking time
```

**Admin Booking Flow (Repository):**
```
Admin Dashboard
  ↓
POST /api/admin/[resource]
  ↓
BookingHandler.create() → Repository.create("bookings")
  ↓
Direct INSERT into bookings table
  ↓
customer_id NOT NULL constraint enforced
```

### 1.2 Critical Issues Identified

| Issue | Severity | Evidence |
|-------|----------|----------|
| Repository drift | CRITICAL | create_booking() definition NOT in repository |
| Signature mismatch | CRITICAL | Migration requires p_end_time, caller doesn't provide it |
| Business invariant violation | CRITICAL | 83% of customers (20/24) have only pending bookings |
| Invalid SQL migration | CRITICAL | GENERATED column with subquery will fail |
| Missing source column | HIGH | Live DB has no source column, repo expects it |
| RLS unverified | HIGH | Cannot confirm policies are active |
| Status transitions | MEDIUM | Application-only enforcement |

---

## 2. LIVE DATABASE CONTRACT (NEEDS VERIFICATION)

### 2.1 Required Live Queries

**Execute these queries against the live database:**

```sql
-- 1. Extract create_booking() function definition
SELECT pg_get_functiondef(oid) as function_def
FROM pg_proc
WHERE proname = 'create_booking' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- 2. Check function signature
SELECT 
    proname as function_name,
    pg_get_function_arguments(oid) as arguments,
    pg_get_function_result(oid) as returns,
    prosecdef as is_security_definer
FROM pg_proc
WHERE proname = 'create_booking' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- 3. Check grants
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'bookings' OR table_name = 'customers';

-- 4. Check RLS status
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE tablename IN ('bookings', 'customers') AND schemaname = 'public';

-- 5. Check policies
SELECT polname, polcmd, polqual, polwithcheck
FROM pg_policies
WHERE tablename IN ('bookings', 'customers') AND schemaname = 'public';

-- 6. Check constraints
SELECT conname, contype, condef
FROM pg_constraint
WHERE conrelid IN (
    'public.bookings'::regclass,
    'public.customers'::regclass
);

-- 7. Check indexes
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename IN ('bookings', 'customers') AND schemaname = 'public';

-- 8. Check for admin_booking function
SELECT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'admin_booking' 
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
) as admin_booking_exists;

-- 9. Customer phone uniqueness
SELECT phone, COUNT(*) as count
FROM public.customers
WHERE phone IS NOT NULL
GROUP BY phone
HAVING COUNT(*) > 1;

-- 10. Customer source column check
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'customers' AND column_name = 'source';

-- 11. Booking status check constraint
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.bookings'::regclass AND conname LIKE '%status%';
```

---

## 3. FINAL CANONICAL CONTRACT

### 3.1 Public create_booking() RPC

**INPUT (must match public caller):**
```sql
CREATE FUNCTION public.create_booking(
    p_full_name text,
    p_phone text,
    p_email text DEFAULT NULL,
    p_booking_date date,
    p_start_time time,
    p_guests integer DEFAULT 1,
    p_service_slug text,
    p_special_requests text DEFAULT NULL
)
RETURNS TABLE(
    booking_id uuid,
    booking_number text,
    customer_id uuid,
    service_id uuid,
    booking_date date,
    start_time time,
    end_time time,
    guests integer,
    status text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Implementation details:
    -- 1. Normalize phone
    -- 2. Resolve service by slug
    -- 3. Get service duration
    -- 4. Calculate end_time = start_time + duration
    -- 5. Check availability
    -- 6. Find/create customer
    -- 7. Generate booking number
    -- 8. Insert booking with status='pending'
    -- 9. Return all fields
END;
$$;
```

**KEY REQUIREMENTS:**
- `p_end_time` is NOT a parameter (derived server-side)
- Returns `booking_id` (not `id`)
- Returns `service_id`, `booking_date`, `start_time`, `end_time`, `guests`
- Customer created with `source='lead'` for pending bookings

### 3.2 Admin Booking RPC

**INPUT:**
```sql
CREATE FUNCTION public.admin_booking(
    p_full_name text,
    p_phone text,
    p_email text DEFAULT NULL,
    p_booking_date date,
    p_start_time time,
    p_end_time time,
    p_guests integer DEFAULT 1,
    p_service_id uuid,
    p_staff_id uuid DEFAULT NULL,
    p_special_requests text DEFAULT NULL,
    p_created_by uuid DEFAULT NULL
)
RETURNS TABLE(
    booking_id uuid,
    booking_number text,
    customer_id uuid,
    service_id uuid,
    booking_date date,
    start_time time,
    end_time time,
    guests integer,
    status text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Implementation details:
    -- 1. Validate service_id exists
    -- 2. Normalize phone
    -- 3. Find/create customer
    -- 4. Generate booking number
    -- 5. Insert booking with status='pending'
    -- 6. Return all fields
END;
$$;
```

### 3.3 Confirmation RPC

**INPUT:**
```sql
CREATE FUNCTION public.confirm_booking(p_booking_id uuid)
RETURNS TABLE(
    booking_id uuid,
    booking_number text,
    customer_id uuid,
    status text,
    customer_source text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 1. Verify booking exists and is pending
    -- 2. Update status to 'confirmed'
    -- 3. Update customer.source = 'booking'
    -- 4. Return updated booking + customer info
END;
$$;
```

### 3.4 Customer Source Column

```sql
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual' NOT NULL;

ALTER TABLE public.customers
ADD CONSTRAINT customers_source_check
CHECK (source IN ('manual', 'lead', 'booking'));
```

**Source Values:**
- `manual` - Admin manually created customer
- `lead` - Customer created from pending booking
- `booking` - Customer with confirmed/completed booking

---

## 4. CUSTOMER LIFECYCLE

### 4.1 State Machine

```
                    ┌─────────────┐
                    │   MANUAL    │
                    │  (source=   │
                    │  manual)    │
                    └──────┬──────┘
                           │
                           │ booking created
                           ▼
                    ┌─────────────┐
                    │    LEAD     │
                    │  (source=   │
                    │  lead)      │
                    └──────┬──────┘
                           │
                           │ booking confirmed/completed
                           ▼
                    ┌─────────────┐
                    │   BOOKING   │
                    │  (source=   │
                    │  booking)   │
                    └─────────────┘
```

### 4.2 Status Transitions

```
pending ──confirm──► confirmed ──complete──► completed
   │                    │
   │ cancel             │ cancel
   ▼                    ▼
cancelled           cancelled

pending ──no_show──► no_show
   │                    ▲
   │ cancel             │
   ▼                    │
cancelled ──────────────┘
```

---

## 5. EXACT SQL CHANGES REQUIRED

### 5.1 Phase 1: Safety Baseline (READ-ONLY)

```sql
-- Record current state
CREATE TABLE IF NOT EXISTS booking_customer_audit_20260824 AS
SELECT 
    'customers' as table_name,
    COUNT(*) as row_count
FROM public.customers;

CREATE TABLE IF NOT EXISTS booking_customer_audit_bookings_20260824 AS
SELECT 
    'bookings' as table_name,
    COUNT(*) as row_count
FROM public.bookings;

-- Customer classification
CREATE TABLE IF NOT EXISTS customer_classification_20260824 AS
SELECT 
    c.id,
    c.full_name,
    c.phone,
    c.source,
    COALESCE(b.status, 'no_bookings') as booking_status,
    CASE 
        WHEN b.status = 'pending' THEN 'pending_only'
        WHEN b.status IN ('confirmed', 'completed') THEN 'legitimate'
        WHEN b.status = 'cancelled' THEN 'cancelled'
        WHEN b.status = 'no_show' THEN 'no_show'
        ELSE 'unknown'
    END as customer_type
FROM public.customers c
LEFT JOIN public.bookings b ON b.customer_id = c.id;
```

### 5.2 Phase 2: Add Customer Source Column

```sql
-- Add source column if not exists
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';

-- Add check constraint
ALTER TABLE public.customers
ADD CONSTRAINT IF NOT EXISTS customers_source_check
CHECK (source IN ('manual', 'lead', 'booking'));

-- Classify existing customers
UPDATE public.customers c
SET source = CASE 
    WHEN EXISTS (
        SELECT 1 FROM public.bookings b 
        WHERE b.customer_id = c.id 
        AND b.status IN ('confirmed', 'completed')
    ) THEN 'booking'
    WHEN EXISTS (
        SELECT 1 FROM public.bookings b 
        WHERE b.customer_id = c.id 
        AND b.status = 'pending'
    ) THEN 'lead'
    ELSE 'manual'
END
WHERE c.source = 'manual';
```

### 5.3 Phase 3: Fix create_booking() Function

```sql
-- DROP existing function first (if it exists)
DROP FUNCTION IF EXISTS public.create_booking(text, text, text, date, time, integer, text, text);

-- Create corrected function
CREATE OR REPLACE FUNCTION public.create_booking(
    p_full_name text,
    p_phone text,
    p_email text DEFAULT NULL,
    p_booking_date date,
    p_start_time time,
    p_guests integer DEFAULT 1,
    p_service_slug text,
    p_special_requests text DEFAULT NULL
)
RETURNS TABLE(
    booking_id uuid,
    booking_number text,
    customer_id uuid,
    service_id uuid,
    booking_date date,
    start_time time,
    end_time time,
    guests integer,
    status text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_customer_id uuid;
    v_service_id uuid;
    v_service_duration integer;
    v_end_time time;
    v_booking_number text;
    v_normalized_phone text;
BEGIN
    -- Normalize phone
    v_normalized_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');
    
    -- Resolve service by slug
    SELECT id, duration_minutes INTO v_service_id, v_service_duration
    FROM public.services
    WHERE slug = p_service_slug AND is_active = true
    LIMIT 1;
    
    IF v_service_id IS NULL THEN
        RAISE EXCEPTION 'Service not found: %', p_service_slug;
    END IF;
    
    -- Calculate end time
    v_end_time := p_start_time + (v_service_duration || ' minutes')::interval;
    
    -- Find or create customer
    SELECT id INTO v_customer_id
    FROM public.customers
    WHERE phone = v_normalized_phone
    LIMIT 1;
    
    IF v_customer_id IS NULL THEN
        INSERT INTO public.customers (full_name, phone, email, source)
        VALUES (p_full_name, v_normalized_phone, p_email, 'lead')
        RETURNING id INTO v_customer_id;
    END IF;
    
    -- Generate booking number
    v_booking_number := 'ZT-' || (100000 + floor(random() * 900000)::integer);
    
    -- Insert booking
    INSERT INTO public.bookings (
        booking_number, customer_id, service_id, booking_date,
        start_time, end_time, guests, status, special_requests
    ) VALUES (
        v_booking_number, v_customer_id, v_service_id, p_booking_date,
        p_start_time, v_end_time, p_guests, 'pending', p_special_requests
    )
    RETURNING 
        id as booking_id,
        booking_number,
        customer_id,
        service_id,
        booking_date,
        start_time,
        end_time,
        guests,
        status
    INTO booking_id, booking_number, customer_id, service_id, booking_date, 
         start_time, end_time, guests, status;
END;
$$;
```

### 5.4 Phase 4: Create admin_booking() RPC

```sql
CREATE OR REPLACE FUNCTION public.admin_booking(
    p_full_name text,
    p_phone text,
    p_email text DEFAULT NULL,
    p_booking_date date,
    p_start_time time,
    p_end_time time,
    p_guests integer DEFAULT 1,
    p_service_id uuid,
    p_staff_id uuid DEFAULT NULL,
    p_special_requests text DEFAULT NULL,
    p_created_by uuid DEFAULT NULL
)
RETURNS TABLE(
    booking_id uuid,
    booking_number text,
    customer_id uuid,
    service_id uuid,
    booking_date date,
    start_time time,
    end_time time,
    guests integer,
    status text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_customer_id uuid;
    v_booking_number text;
    v_normalized_phone text;
BEGIN
    -- Validate service exists
    IF NOT EXISTS (SELECT 1 FROM public.services WHERE id = p_service_id AND is_active = true) THEN
        RAISE EXCEPTION 'Invalid service_id: %', p_service_id;
    END IF;
    
    -- Normalize phone
    v_normalized_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');
    
    -- Find or create customer
    SELECT id INTO v_customer_id
    FROM public.customers
    WHERE phone = v_normalized_phone
    LIMIT 1;
    
    IF v_customer_id IS NULL THEN
        INSERT INTO public.customers (full_name, phone, email, source)
        VALUES (p_full_name, v_normalized_phone, p_email, 'lead')
        RETURNING id INTO v_customer_id;
    END IF;
    
    -- Generate booking number
    v_booking_number := 'ZT-' || (100000 + floor(random() * 900000)::integer);
    
    -- Insert booking
    INSERT INTO public.bookings (
        booking_number, customer_id, service_id, booking_date,
        start_time, end_time, guests, status, special_requests, created_by
    ) VALUES (
        v_booking_number, v_customer_id, p_service_id, p_booking_date,
        p_start_time, p_end_time, p_guests, 'pending', p_special_requests, p_created_by
    )
    RETURNING 
        id as booking_id,
        booking_number,
        customer_id,
        service_id,
        booking_date,
        start_time,
        end_time,
        guests,
        status
    INTO booking_id, booking_number, customer_id, service_id, booking_date, 
         start_time, end_time, guests, status;
END;
$$;
```

### 5.5 Phase 5: Create confirm_booking() RPC

```sql
CREATE OR REPLACE FUNCTION public.confirm_booking(p_booking_id uuid)
RETURNS TABLE(
    booking_id uuid,
    booking_number text,
    customer_id uuid,
    status text,
    customer_source text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Verify booking exists and is pending
    IF NOT EXISTS (SELECT 1 FROM public.bookings WHERE id = p_booking_id AND status = 'pending') THEN
        RAISE EXCEPTION 'Booking not found or not pending';
    END IF;
    
    -- Update booking status
    UPDATE public.bookings
    SET status = 'confirmed'
    WHERE id = p_booking_id
    RETURNING 
        id as booking_id,
        booking_number,
        customer_id,
        status
    INTO booking_id, booking_number, customer_id, status;
    
    -- Update customer source
    UPDATE public.customers
    SET source = 'booking'
    WHERE id = customer_id;
    
    -- Get customer source for return
    SELECT source INTO customer_source FROM public.customers WHERE id = customer_id;
END;
$$;
```

### 5.6 Phase 6: Grant Execute Permissions

```sql
-- Grant create_booking to anon (public booking)
GRANT EXECUTE ON FUNCTION public.create_booking(text, text, text, date, time, integer, text, text) TO anon;

-- Grant admin_booking to authenticated (admin dashboard)
GRANT EXECUTE ON FUNCTION public.admin_booking(text, text, text, date, time, time, integer, uuid, uuid, text, uuid) TO authenticated;

-- Grant confirm_booking to authenticated
GRANT EXECUTE ON FUNCTION public.confirm_booking(uuid) TO authenticated;
```

---

## 6. RLS VERIFICATION (NEEDS LIVE CHECK)

### 6.1 Required RLS Policies

**bookings table:**
```sql
-- Anonymous: cannot directly INSERT/SELECT/UPDATE/DELETE
CREATE POLICY bookings_anon_insert ON public.bookings
FOR INSERT TO anon USING (false);

CREATE POLICY bookings_anon_select ON public.bookings
FOR SELECT TO anon USING (false);

CREATE POLICY bookings_anon_update ON public.bookings
FOR UPDATE TO anon USING (false);

-- Authenticated: can manage bookings
CREATE POLICY bookings_authenticated ON public.bookings
FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

**customers table:**
```sql
-- Anonymous: cannot directly INSERT/SELECT/UPDATE/DELETE
CREATE POLICY customers_anon_insert ON public.customers
FOR INSERT TO anon USING (false);

CREATE POLICY customers_anon_select ON public.customers
FOR SELECT TO anon USING (false);

CREATE POLICY customers_anon_update ON public.customers
FOR UPDATE TO anon USING (false);

-- Authenticated: can manage customers
CREATE POLICY customers_authenticated ON public.customers
FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

---

## 7. DUPLICATE PHONE ANALYSIS

### 7.1 Run Before Adding Unique Constraint

```sql
-- Find duplicates
SELECT phone, COUNT(*) as count, STRING_AGG(id::text, ', ') as customer_ids
FROM public.customers
WHERE phone IS NOT NULL
GROUP BY phone
HAVING COUNT(*) > 1;

-- For each duplicate, determine canonical:
-- 1. Customer with most bookings
-- 2. Customer with most recent booking
-- 3. Customer with confirmed/completed booking
-- 4. Admin decision
```

### 7.2 Safe Deduplication Process

```sql
-- Example: If customer_id_1 should be canonical
UPDATE public.bookings
SET customer_id = 'canonical_customer_id'
WHERE customer_id = 'duplicate_customer_id';

DELETE FROM public.customers
WHERE id = 'duplicate_customer_id';
```

---

## 8. TEST RESULTS (NEEDS EXECUTION)

### 8.1 Acceptance Criteria

| Test | Expected Result |
|------|-----------------|
| Public booking with new phone | Creates customer with source='lead', booking with status='pending' |
| Confirm booking | Updates status to 'confirmed', customer.source to 'booking' |
| Cancel pending booking | Status='cancelled', customer.source remains 'lead' |
| Admin booking | Same as public booking |
| Duplicate phone race | ONE customer created |
| Anonymous direct INSERT | BLOCKED by RLS |
| Invalid status transition | BLOCKED by application |

---

## 9. MIGRATION RECONCILIATION

### 9.1 Repository Migration Status

| Migration | Status | Action Required |
|-----------|--------|-----------------|
| `20260822_enable_booking_rls_security.sql` | PRESENT | Needs create_booking() to exist first |
| `20260823_add_customer_provenance.sql` | INVALID | DELETE - will fail |
| `20260824_create_booking_function.sql` | WRONG | REPLACE with correct signature |
| `20260826_add_customer_source_column.sql` | CORRECT | Can be applied |
| `20260827_create_admin_booking_rpc.sql` | CORRECT | Can be applied |

### 9.2 Recommended Migration Order

1. Add customer source column
2. Create create_booking() function
3. Create admin_booking() function
4. Create confirm_booking() function
5. Grant execute permissions
6. Enable RLS (if not enabled)
7. Create RLS policies
8. Add unique constraint on customers.phone (after deduplication)

---

## 10. REMAINING RISKS

### 10.1 Critical Risks
- [ ] Live function definition not extracted
- [ ] Signature mismatch may break public website
- [ ] Business invariant violation in existing data

### 10.2 High Risks
- [ ] RLS not verified
- [ ] Duplicate phones not resolved
- [ ] Customer source not properly classified

### 10.3 Medium Risks
- [ ] Status transitions not database-enforced
- [ ] No audit trail for customer source changes

---

## 11. ROLLBACK PLAN

If any change causes issues:

```sql
-- Rollback create_booking
DROP FUNCTION IF EXISTS public.create_booking(...);

-- Rollback admin_booking
DROP FUNCTION IF EXISTS public.admin_booking(...);

-- Rollback confirm_booking
DROP FUNCTION IF EXISTS public.confirm_booking(...);

-- Rollback source column (CAUTION: data loss)
ALTER TABLE public.customers DROP COLUMN IF EXISTS source;

-- Re-enable old function if needed
-- (Restore from backup or re-extract from production)
```

---

## 12. FINAL VERDICT

**BLOCKED — LIVE DATABASE ACCESS REQUIRED**

This document provides the complete plan for fixing the booking/customer lifecycle. However, execution requires:

1. **Live database credentials** (Supabase project URL, service role key)
2. **Ability to execute SQL** against the production database
3. **Supervised deployment** with rollback capability

### Prerequisites Before Execution:

1. [ ] Extract live create_booking() function definition
2. [ ] Verify current RLS policies
3. [ ] Analyze customer duplicates
4. [ ] Classify existing customers
5. [ ] Create backup of critical data
6. [ ] Schedule deployment during low-traffic period

### Post-Execution Verification:

1. [ ] Public booking test (new phone)
2. [ ] Admin booking test
3. [ ] Confirmation test
4. [ ] Cancellation test
5. [ ] Duplicate phone test
6. [ ] RLS policy verification
7. [ ] TypeScript compilation
8. [ ] Production build
9. [ ] Integration tests
10. [ ] E2E tests

---

## 13. NEXT STEPS

1. **Obtain live database access** - Provide Supabase credentials or use MCP
2. **Execute Phase 0** - Record baseline state
3. **Execute Phase 1** - Extract function definitions
4. **Execute Phase 2** - Apply schema changes
5. **Execute Phase 3** - Create/reconcile functions
6. **Execute Phase 4** - Grant permissions
7. **Execute Phase 5** - Verify RLS
8. **Execute Phase 6** - Run tests
9. **Update repository migrations** to match live database
10. **Deploy to production**

---

*This document is a comprehensive plan. Actual execution requires live database access and supervision.*