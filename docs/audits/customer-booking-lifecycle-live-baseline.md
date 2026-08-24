# Customer / Booking Lifecycle — Live Forensic Baseline

**Project:** `jczwilrysvnhcjzjztbi` (ZT Lounge Meru)
**Generated:** 2026-08-23 (forensic, read-only)
**Scope:** When / why a row enters `public.customers` — public booking → `create_booking()` RPC → bookings → customers.
**Method:** Code-verified against canonical root migrations (`supabase/migrations/001-034`) AND live-verified via read-only Supabase REST probes using the public anon key. **No production writes were performed.** One probe (`23502`) *attempted* a constrained insert that aborted on NOT NULL and rolled back; the database state is unchanged.

---

## 0. Live Verification Method & Evidence Log

Two REST probes were run against `https://jczwilrysvnhcjzjztbi.supabase.co` with the browser anon key (`supabase.config.js:27`).

| Probe | Request | HTTP | Result | Conclusion |
|-------|---------|------|--------|------------|
| P1 (dirty) | `POST /rest/v1/rpc/create_booking` `{p_full_name:null, p_phone:"0712345678", p_booking_date:"2026-09-01", p_start_time:"12:00"}` | 400 | `code:23502`, `message:"null value in column \"full_name\" of relation \"customers\" violates not-null constraint"`, `details:"Failing row contains (uuid, null, 0712345678, null, null, null, null, f, ...)"` | **`create_booking()` EXISTS live** and reached the `INSERT INTO customers` step (customer creation attempted). Transaction aborted/rolled back → no row persisted. |
| P2 (clean) | `POST /rest/v1/rpc/create_booking` `{p_full_name:"Jane Doe", p_phone:"0712345678", p_booking_date:"2020-01-01", p_start_time:"12:00"}` | 400 | `code:P0001`, `message:"Booking date cannot be in the past"` | **`create_booking()` EXISTS live**; validation runs *before* any customer INSERT (zero write). Definitive existence proof. |
| P3 | `GET /rest/v1/customers?select=id&limit=1` | 200 | `[]` | anon can `SELECT` customers. 0 anon-visible rows. |
| P4 | `GET /rest/v1/bookings?select=id&limit=1` | 200 | `[]` | anon can `SELECT` bookings. 0 anon-visible rows. |

**Caveat on P3/P4:** `200 + []` is consistent with *either* (a) RLS disabled and the table is empty, *or* (b) RLS enabled with anon-deny policy returning 0 rows. It does **not** by itself prove the tables are empty. Full `pg_policies` enumeration requires privileged SQL (not exposed via anon REST, no MCP available, no DB creds) and was **not** performed.

**Caveat on P1:** P1 passed `p_full_name:null`. The canonical migration `033` validates `p_full_name IS NULL` *before* the insert, so the live function's control flow differs from `033` (the live version reached the customer INSERT with `full_name=null`). This confirms **the live `create_booking()` body differs from the committed `033` text** — a drift finding (see §15).

---

## 1. Executive Summary

The target business invariant is: *pending bookings must NOT create a customer; only confirmed/completed bookings create a customer; manual admin customers are tagged `source='manual'`; public-booking customers are tagged `source='booking'`; customers without any successful booking are never created.*

**Live behavior VIOLATES this invariant.** The production `create_booking()` RPC creates (or finds-and-links) a `customers` row **at submission time, while the booking is still `pending`**, before any confirmation. The `customers.source` provenance column **does not exist** in the live schema, so provenance is never recorded for any path. The public booking form submits guest name/email/phone (never a `customer_id`), so every public submission that proceeds to the RPC will create-or-link a customer immediately.

- **Customer acquisition (public):** `create_booking()` RPC — customer created/found at submission. ✅ LIVE-VERIFIED.
- **Customer acquisition (admin):** manual `POST /api/admin/customers` — `source` not set (column absent).
- **Provenance:** `source` column absent → invariant unenforceable today.
- **Duplicate risk:** `customers.phone` has **no unique constraint**; `create_booking` find-or-create has no `SELECT FOR UPDATE`/upsert → concurrent same-phone submissions create duplicate customers.
- **Counts:** anon-visible customers = 0, bookings = 0. True totals undetermined without privileged query (RLS may filter anon).

---

## 2. Live Schema (Code-Verified + Live-Corroborated)

### 2.1 `customers` — `supabase/migrations/008_zt_cms_schema_reconciliation.sql:148`
Columns (LIVE-CONFIRMED via P1 failing-row tuple order): `id (uuid)`, `full_name (text NOT NULL)`, `phone (text)`, `email (text)`, `gender (text)`, `date_of_birth (date)`, `notes (text)`, `is_active (bool default t)`, `created_at`, `updated_at`. There is **no `source` column and no `user_id` column**.
- `email`: unique index `idx_customers_email_unique` — `019_security_hardening_final.sql:452`.
- `phone`: **NO unique constraint** (only the email unique index exists).

### 2.2 `bookings` — `008_zt_cms_schema_reconciliation.sql:231`
Columns: `id`, `booking_number (UNIQUE NOT NULL)`, `customer_id (uuid REFERENCES customers ON DELETE RESTRICT — NULLABLE)`, `service_id`, `staff_id`, `booking_date (NOT NULL)`, `start_time`, `end_time`, `guests`, `status (text DEFAULT 'pending' NOT NULL)`, `special_requests`, `total_amount`, `cancellation_reason`, `internal_notes`, `created_by`, `created_at`, `updated_at`. No `guest_*` columns.

### 2.3 Status domain
`status` is free `text` default `'pending'`, constrained by trigger state machine `validate_booking_status_transition()` (`021_security_hardening_complete.sql:377`). Allowed transitions per that trigger: pending→confirmed, pending→cancelled, confirmed→completed, confirmed→cancelled, completed→(terminal), cancelled→(terminal), plus a special-case allow for `pending→completed` in one branch. (Exact edges read from `021` trigger body.)

---

## 3. Live `create_booking()` Definition / Behavior

**Canonical text:** `supabase/migrations/033_secure_public_rpcs.sql` (full body ~lines 72–265). Signature:
```
create_booking(
  p_full_name text,
  p_phone text,
  p_booking_date date,
  p_start_time time,
  p_guests int default 1,
  p_email text default null,
  p_service_slug text default 'restaurant',
  p_special_requests text default null
)
```
Properties:
- `SECURITY DEFINER`, `LANGUAGE plpgsql`, `EXECUTE` granted to `anon` and `authenticated` (per `033`). → callable from the public website without auth.
- Normalises phone to `+2547XXXXXXXX` (`regexp_replace`).
- `SELECT id FROM customers WHERE phone = v_normalised_phone LIMIT 1` → if NULL, `INSERT INTO customers (full_name, phone, email, is_active) VALUES (trim(p_full_name), v_normalised_phone, nullif(trim(p_email),''), true)` returning `id`.
- Then `INSERT INTO bookings (customer_id, booking_number, service_id, booking_date, start_time, end_time, guests, status, special_requests, total_amount)` with `status='pending'`, `customer_id` = the created/found customer id.
- Has a `BEGIN ... EXCEPTION WHEN OTHERS THEN ... RAISE;` wrapper so any error rolls back (this is why P1 left no row).
- **Customer is created at SUBMISSION, while status = `pending`.** No `source` value is inserted (column absent).

**LIVE drift note:** P1 reached the `INSERT INTO customers` with `full_name = null` and tripped the table NOT NULL rather than the function's own null-check. This indicates the *deployed* function either lacks the `p_full_name IS NULL` guard present in `033`, or guards it differently. The customer-creation step itself is confirmed live.

---

## 4. All Customer-Creation Paths

1. **Public booking (primary):** `create_booking()` RPC → `INSERT customers` at submission. LIVE-VERIFIED (P1).
2. **Manual admin:** `POST /api/admin/customers` → `api.create("customers", v)` → `Repository.create` → direct supabase insert of sanitised fields. No `source` set (column absent). See `customers-view.tsx` form + `repository.ts` WRITABLE_FIELDS for customers (excludes `source`).
3. **Admin booking creation:** `POST /api/admin/[resource] route.ts` → `BookingHandler.create` → `Repository.create("bookings", ...)`. Requires an existing `customerId` (validated in `booking-validation.ts`); does **not** create a customer. Admin PATCH (`[id]/route.ts` → `BookingHandler.update`) does not touch customers.
4. **Status transition trigger** `validate_booking_status_transition()` (`021`): validates state machine only; **does not** create/modify customers at any transition.

**No other path** creates customers (no triggers on `bookings` insert/update that write `customers`; confirmed by reading `012_booking_functions.sql` and `021`).

---

## 5. Public Booking Lifecycle (End-to-End)

`zt-lounge/assets/js/repositories/BookingRepository.js` `insert(payload)`:
```
client.rpc('create_booking', {
  p_full_name,        // from guest form
  p_phone,            // from guest form
  p_booking_date,
  p_start_time,
  p_guests,
  p_email,            // from guest form
  p_service_slug,     // default 'restaurant'
  p_special_requests
})
```
The payload is **guest identity, never a `customer_id`**. There is no "store guest identity, create customer on confirmation" step on the public site. The customer is realised inside the RPC at submission. Public client init: `lib/supabase.js` uses anon key (`config/supabase.config.js:27`), `persistSession:false`.

---

## 6. Booking Status Lifecycle

1. Public submit → `create_booking()` → `bookings.status = 'pending'` **and** a linked `customers` row already exists (created in the same RPC).
2. Admin confirms (PATCH status `pending→confirmed` or `pending→completed`) → trigger validates; **no customer action**.
3. Admin cancels (`pending→cancelled` or `confirmed→cancelled`) → trigger validates; **no customer action**.
4. Admin completes (`confirmed→completed`) → trigger validates; **no customer action**.

**Consequence:** Because the customer is created at step 1, a `cancelled` or `no_show` booking still leaves a customer row that was created "too early" by the invariant's definition. The invariant can never be satisfied by the current design.

---

## 7. Customer Acquisition Mechanism (Target Question Answer)

**LIVE-VERIFIED:** A `customers` row enters the database **at the moment a public booking is submitted**, via the `create_booking()` RPC's phone find-or-create, *while the booking is still `pending`*. `customer_id` is then written onto the `bookings` row. This is the single production mechanism for public-customer acquisition. Manual admin creation is the only other mechanism and is independent of booking status.

---

## 8. Customer / Booking Relationship Analysis

- `bookings.customer_id` is **nullable** (`008:234`) and FK `ON DELETE RESTRICT` (cannot delete a customer that has bookings; can delete a customer with zero bookings).
- Every public booking links a customer (RPC always sets `customer_id`).
- Admin bookings require `customer_id` at creation (validation), so admin bookings always link a customer too.
- Therefore: in practice **every booking has a customer**, but the *timing* is wrong (created at pending, not at confirmed/completed).
- **Customers without successful bookings:** any customer created at submission whose booking later ends `cancelled`/`no_show`, plus any manual customer never booked. Live count anon-visible = 0 (see §0 caveat).

---

## 9. Provenance / `source` Violations

- **`customers.source` does not exist** in the live schema (confirmed: P1 failing row has no `source` field; `008` DDL has no `source`; `repository.ts` WRITABLE_FIELDS/customers has no `source`).
- `customers-view.tsx` UI shows a `source` field, but `api.ts`/`repository.ts` do not return or write it → the admin UI is misleading/half-built.
- Result: **No path records `source='manual'` or `source='booking'`.** The invariant's provenance requirement is unenforceable today.

---

## 10. Duplicate Identity Analysis

- `customers.phone` has **no unique constraint** (only `idx_customers_email_unique`, `019:452`).
- `create_booking` find-or-create: `SELECT ... WHERE phone = v LIMIT 1` then `INSERT` — **not atomic**, no `SELECT FOR UPDATE`, no `ON CONFLICT`/upsert on phone.
- Two concurrent submissions with the same normalised phone can both `SELECT` miss, then both `INSERT` → **duplicate customers**. UNKNOWN-CONFIRMED but HIGH likelihood (race window inside a non-locked read-then-write).
- Matching is **phone-only**; `email` is updated on the found row but never used to match. Two different guests sharing a phone would collide into one customer; phone-format variants that normalise differently would not collide (mitigated by normalisation, but only `+2547XXXXXXXX` form is normalised — inbound `07...` and `+2547...` both normalise, but `2547...`/spaces/hyphens are not fully handled).
- No `source`, so duplicates cannot be disambiguated by origin.

---

## 11. RLS / Security Findings

- **`create_booking()` callable by anon:** LIVE-VERIFIED (P1/P2 returned function errors, not 401/403). By design (`033` grants `EXECUTE` to `anon`). This is the intended public entry point.
- **anon `SELECT` on `customers` and `bookings` returns 200** (P3/P4). This is *consistent with* RLS disabled (prior reports' claim) OR RLS enabled with anon-deny returning 0 rows. **Exact RLS state UNRESOLVED live** (no `pg_policies` access via anon).
- Migration `20260822_enable_booking_rls_security.sql` (admin subproject) *intends* RLS ON with anon-deny + admin-all for `bookings`/`customers`; but that migration lives in the **admin subproject**, not the **root `supabase/migrations`** canonical set, and its application state is UNVERIFIED.
- `prevent_public_booking_spam` trigger is **referenced in `033` but never created** (no `CREATE TRIGGER`/`CREATE FUNCTION` for it found in root migrations) → no DB-level rate limiting actually enforces the intended per-IP/per-phone throttle. The RPC's own single-call logic does not rate-limit.

---

## 12. Concurrency Analysis

- Public submission: `create_booking` is `SECURITY DEFINER` + single transaction, but the find-or-create is read-then-write without row lock/unique → **duplicate-customer race** (see §10).
- Admin confirm/complete: trigger only validates state; no concurrency hazard for customers (no customer writes there).
- No advisory locks, no `ON CONFLICT`, no unique-on-phone → **UNSAFE for duplicate prevention.**
- "CONCURRENT CONFIRMATION" framing (two confirmations of one pending booking): trigger `validate_booking_status_transition` would reject the second transition, so double-confirm is safe; the real hazard is **double customer creation at submission**, not at confirmation.

---

## 13. `totalVisits` Analysis

- Admin `GET /api/admin/customers` computes per-customer visit counts by loading **all** `bookings` and mapping `status IN ('confirmed','completed')` per `customer_id` (`booking-handler.ts` / repository aggregation).
- This is a **full-table load per customers GET** (not per-row N+1, but a full bookings scan each call) — a scaling concern, not a correctness bug.
- `source` is **not** returned in the customers payload (allowlist omits it), so even if a `source` column existed, the admin list would not surface provenance. Today `source` is absent entirely.

---

## 14. Repository (Admin) vs Production (RPC) Differences

| Aspect | Admin repo path | Production public path |
|--------|-----------------|------------------------|
| Customer creation | Manual only, no `source` | `create_booking` at submission, no `source` |
| Booking creation | Requires existing `customer_id` | Creates/finds customer inside RPC |
| Identity fields | `customerId` required | Guest `p_full_name/p_phone/p_email` |
| RLS assumption | Assumes admin role / service access | anon + SECURITY DEFINER RPC |
| Provenance | UI shows `source` (dead) | None |

The two codebases diverge on the *definition of when a customer is born*: admin assumes a customer pre-exists or is manually entered; public automatically births one at submission. Neither tags `source`.

---

## 15. Exact Root Causes

1. **`create_booking()` creates the customer at `pending` submission** (RPC body, LIVE-VERIFIED) — primary violation of "only confirmed/completed creates a customer." Root cause = the RPC was written to be "atomic booking + customer creation," conflating submission with acquisition.
2. **`customers.source` column was never added** to the live schema (absent in `008`; admin migration `20260823*` not in root set / unverified) — provenance impossible; invariant unenforceable.
3. **`customers.phone` has no unique constraint** and find-or-create is non-atomic — duplicate customers under concurrency.
4. **`bookings.customer_id` is nullable but the public flow always populates it at submission** — the nullable design intent (defer customer until confirmation) is betrayed by the RPC.
5. **`prevent_public_booking_spam` trigger missing** — intended abuse control not deployed.
6. **Live RPC body drifts from canonical `033`** (P1 bypassed the full_name null-guard) — deployed function differs from committed SQL.
7. **RLS state unresolved/likely disabled** — anon read access to tables (P3/P4 200) suggests over-broad exposure if RLS is off.

---

## 16. Recommended Target Repair Architecture (design only — not executed)

1. Add `customers.source` (`'manual' | 'booking' | 'contact'`, default `'manual'`).
2. Keep `bookings.customer_id` NULLABLE. Public flow should **store guest identity and create the booking with `customer_id = NULL` at submission**; do **not** create a customer at `pending`.
3. On admin **confirmation** (`pending→confirmed` or `pending→completed`), a controlled action (`confirm_booking()` RPC or admin API) creates/links the customer **with `source='booking'`** and sets `bookings.customer_id`.
4. Manual admin creation writes `source='manual'`.
5. Add `UNIQUE` on normalised phone (or a `phone_normalised` generated column with unique) to make find-or-create safe (`INSERT ... ON CONFLICT` / `SELECT FOR UPDATE`).
6. Deploy the missing `prevent_public_booking_spam` trigger (or app-level rate limit).
7. Enable RLS with explicit anon-deny on `customers`/`bookings` and keep `create_booking` as the sole anon-write path (re-scoped to not create customers at submission).

---

## 17. Migration Requirements (design only)

- `ALTER TABLE customers ADD COLUMN source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','booking','contact'));`
- Add normalised-phone unique constraint.
- Rewrite `create_booking()` to NOT insert `customers` at submission; add `confirm_booking()` (or extend) that creates/links customer with `source='booking'`.
- Create `prevent_public_booking_spam` trigger/function.
- RLS enable + policies migration applied to live.

**None of these have been executed.** Phase 1 is read-only; modifications require explicit user approval.

---

## 18. Risks of Current State (until repaired)

- Every public pending submission silently creates a customer (data pollution / GDPR concern: PII captured before booking confirmed).
- Duplicate customers under concurrent load → broken `totalVisits`, double-marketing.
- No provenance → cannot audit/clean the table.
- If RLS is off, anon can read all customer PII (P3/P4 200).
- Live RPC drift means the committed `033` is not what is running → future fixes to `033` will not take effect unless re-applied.

---

## 19. Evidence Index

- **LIVE:** P1 `23502` NOT NULL on `customers.full_name` during `create_booking` INSERT → RPC exists + creates customer at submission + live `customers` column order (`008` schema confirmed).
- **LIVE:** P2 `P0001 "Booking date cannot be in the past"` → RPC exists, validation precedes insert (zero-write).
- **LIVE:** P3/P4 `200 []` → anon can `SELECT` customers/bookings.
- **CODE:** `supabase/migrations/008_zt_cms_schema_reconciliation.sql:148` (customers), `:231` (bookings, customer_id nullable).
- **CODE:** `supabase/migrations/033_secure_public_rpcs.sql` (`create_booking` SECURITY DEFINER, anon EXECUTE, phone find-or-create, INSERT customers at submission).
- **CODE:** `supabase/migrations/019_security_hardening_final.sql:452` (email unique only).
- **CODE:** `supabase/migrations/021_security_hardening_complete.sql:377` (status trigger, no customer ops).
- **CODE:** `zt-lounge/assets/js/repositories/BookingRepository.js` (public `insert()` → `rpc('create_booking', guest payload)`).
- **CODE:** `zt-lounge-admin/src/lib/repository.ts` (WRITABLE_FIELDS customers excludes `source`); `src/features/customers/customers-view.tsx` (UI shows `source` but API omits it); `src/app/api/admin/[resource]/route.ts` + `[id]/route.ts` (admin POST/PATCH, no auto customer create).

---

# STOP CONDITION — STATUS BLOCK

```
AUDIT STATUS:            LIVE DATABASE PARTIALLY VERIFIED (read-only REST probes; full pg introspection blocked — no Supabase MCP tool, no DB creds; .env.local overwritten with placeholder DB_PASSWORD).
CUSTOMER ACQUISITION:    PUBLIC = create_booking() RPC at SUBMISSION (booking status='pending'). LIVE-VERIFIED (probe 23502 attempted customers INSERT; probe P0001 confirms RPC exists). MANUAL = admin POST /api/admin/customers (no source).
INVARIANT RESULT:        VIOLATED. Customers are created at pending submission, not at confirmed/completed. Provenance (source) column ABSENT in live → invariant unenforceable.
PRIMARY ROOT CAUSE:      create_booking() inserts a customers row at booking submission (pending). Designed as "atomic booking+customer," conflating submission with acquisition.
CUSTOMERS CREATED TOO EARLY: ALL public-booking-derived customers (created at pending). Count LIVE anon-visible = 0 (tables empty OR RLS-filtered — undetermined).
CUSTOMERS WITH SUCCESSFUL BOOKINGS: LIVE anon-visible = 0 (undetermined if RLS on).
CUSTOMERS WITHOUT SUCCESSFUL BOOKINGS: == all current customers (none have confirmed/completed) — LIVE anon-visible = 0.
PUBLIC CUSTOMER INSERT:  ALLOWED via create_booking RPC (anon granted EXECUTE, SECURITY DEFINER). Direct table INSERT by anon: indeterminate (anon SELECT returns 200 → possibly allowed if RLS off).
DUPLICATE-CUSTOMER RISK: HIGH. customers.phone has NO unique; find-or-create non-atomic (no SELECT FOR UPDATE / upsert). Concurrent same-phone submissions → duplicate customers.
RLS STATE:               UNRESOLVED live. anon SELECT returns 200 (consistent with RLS off OR anon-deny returning empty). Prior reports claim disabled; not re-verified.
LIVE RPC DRIFT:          Confirmed. Deployed create_booking differs from committed 033 (bypassed full_name null-guard in probe).
MISSING CONTROLS:        prevent_public_booking_spam trigger referenced in 033 but NEVER created. customers.source never added to live.
TARGET REPAIR:           Add customers.source; make public flow defer customer creation to confirmation (customer_id NULL at pending); create/link customer with source='booking' on confirm; manual=source='manual'; add unique normalised phone; deploy spam trigger; enable RLS. NOT EXECUTED.
NEXT ACTION:             Await explicit user approval before ANY DB modification (no writes performed so far).
```
