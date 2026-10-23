# ZT Lounge Admin — Architecture

> Operational management system for ZT Lounge Meru (bookings, menu, CMS, memberships, media, admin dashboard).
> Connected to Supabase remote project `jczwilrysvnhcjzjztbi.supabase.co` (AWS eu-west-2).
> Credentials live in gitignored `.env.local`; `.env.example` holds placeholders only.

---

## 1. Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2.6 (App Router, `src/app`) |
| UI | React 19.2.6, Tailwind CSS 4.1, shadcn/ui primitives (`src/components/ui.tsx`) |
| Language | TypeScript 5.9.3 (strict) |
| Database | Supabase Postgres 17 (remote, eu-west-2) |
| Supabase client | `@supabase/supabase-js` ^2.112.2, `@supabase/ssr` ^0.12.4, `@supabase/auth-helpers-nextjs` ^0.14.0 |
| ORM (schema only) | Drizzle ORM 0.45.2 + `pg` pool (`src/db/schema.ts`, `src/db/index.ts`) |
| Supabase CLI | `supabase` ^2.117.0 (installed via scoop, v2.121.0); project config in `supabase/config.toml` |
| E2E tests | Playwright 1.62 (`tests/e2e`) |
| Forms | React Hook Form + Zod |
| State | Zustand |
| Charts | Recharts |
| QR | qrcode / qrcode.react |
| Google integration | Google Business Profile API (OAuth) — reviews sync |


---

## 2. Supabase Connection

### 2.1 Remote project (production / dev target)

- **URL:** `https://jczwilrysvnhcjzjztbi.supabase.co`
- **Project ref:** `jczwilrysvnhcjzjztbi`
- **Anon key:** `NEXT_PUBLIC_SUPABASE_ANON_KEY` (browser-safe, in `.env.local`)
- **Service role:** `SUPABASE_SERVICE_ROLE_KEY` (server-only, in `.env.local`)
- **DB pooler:** `SUPABASE_DB_URL` — `postgresql://postgres.jczwilrysvnhcjzjztbi:…@aws-0-eu-west-2.pooler.supabase.com:6543/postgres`

### 2.2 Local Supabase CLI config

`supabase/config.toml` — `project_id = "jczwilrysvnhcjzjztbi"`. Local dev ports: API 54321, DB 54322, pooler disabled. Edge runtime enabled (Deno 2). Analytics enabled. 45 migrations in `supabase/migrations/` plus `supabase/migrations_retired/`.

### 2.3 Three Supabase client abstractions

| Client | File | Key | Purpose |
|---|---|---|---|
| Browser | `src/lib/supabase/client.ts` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Singleton `createBrowserClient` (@supabase/ssr). One GoTrueClient instance to avoid duplicate-client warnings. |
| Server (read/write cookies) | `src/lib/supabase/server.ts` → `getSupabaseServer()` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `createServerClient` for Route Handlers / Server Actions where `cookies()` is writable. |
| Server (read-only) | `src/lib/supabase/server.ts` → `getSupabaseServerReadOnly()` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `createServerClient` for Server Components (read-only cookie store; `setAll` is a no-op). Session refresh persisted by proxy middleware. |
| Admin (service role) | `src/lib/supabase/admin.ts` → `getSupabaseAdmin()` / `src/lib/supabase/server.ts` → `getSupabaseAdmin()` | `SUPABASE_SERVICE_ROLE_KEY` | `createClient` with `autoRefreshToken: false`, `persistSession: false`. Bypasses RLS. Used for admin mutations and metadata branding. |

### 2.4 Environment variables (`.env.local`, gitignored)

```
NEXT_PUBLIC_SUPABASE_URL=https://jczwilrysvnhcjzjztbi.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=…                # browser-safe
SUPABASE_SERVICE_ROLE_KEY=…                    # server-only
SUPABASE_DB_URL=postgresql://…                 # drizzle/pg pooler
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Audit scripts (`scripts/db-schema-check.js`, `scripts/verify-live-cms.js`, `scripts/inspect-schema.js`, `scripts/verify-endpoints.js`) read these via `process.env` after `dotenv` loads `.env.local`.

---

## 3. Directory Layout

```
src/
├── app/                    # Next.js App Router
│   ├── (auth)/signup       # Auth route group
│   ├── actions/            # Server actions (empty placeholder)
│   ├── api/
│   │   ├── admin/[resource]/route.ts      # Generic CRUD for all admin resources
│   │   ├── admin/[resource]/[id]/route.ts # Single-record CRUD
│   │   ├── admin/[resource]/batch/route.ts# Batch operations
│   │   ├── admin/bookings, business-settings, contact-messages, customer-memberships,
│   │   │     google, google-reviews, media, media_assets, notifications, roles,
│   │   │     services, team-directory, team-invitations, upload …
│   │   ├── auth, dashboard, health, invitations, media, membership-plans, public …
│   │   └── public/                     # Public-facing read endpoints (testimonials …)
│   ├── auth, chat, dashboard, forgot-password, login, membership,
│   │   reviews, reset-password, unauthorized
│   ├── globals.css
│   ├── layout.tsx          # Root layout; CMS-driven branding via media_assets
│   └── page.tsx
├── components/             # Shared UI (admin, providers, toast, data-table, sidebar …)
├── contexts/               # AuthProvider
├── db/                     # Drizzle schema + pool
│   ├── schema.ts           # Canonical table definitions (~650 lines)
│   └── index.ts            # pg Pool + drizzle singleton (`getDb()`)
├── features/               # Feature-based domain modules (~17)
│   ├── bookings, cms, customers, dashboard, gallery, google-business-profile,
│   │   google-reviews, home, media, members, memberships, messages, promotions,
│   │   services, settings, team, testimonials, users
├── hooks/                  # use-notification-subscription, use-toast
├── integrations/           # google-business-profile (OAuth, sync)
├── lib/
│   ├── supabase/           # client.ts, server.ts, admin.ts (3 client factories)
│   ├── auth/               # server.ts (session + RBAC), redirect.ts (Loop 65 deep links)
│   ├── repository.ts       # Generic CRUD wrapper over Supabase (allowlists, immutable/sensitive fields)
│   ├── resource-config.ts  # URL segment → table mapping
│   ├── booking-handler.ts, membership-handler.ts  # Domain-specific write handlers
│   ├── media/              # resolver.ts, paths.ts, processor.ts, category-mapping
│   ├── storage/            # Storage bucket paths
│   ├── images/             # Image processing
│   ├── audit/              # CRUD audit logger (logCrudOperation)
│   ├── validation/         # Admin input validation
│   ├── contract/           # Public API response mapping
│   ├── mappers/            # DB row → public contract
│   ├── query-keys.ts       # TanStack Query keys
│   ├── rate-limit/         # Rate limiting
│   ├── team/, constants/, page-scope.ts, debug.ts, utils.ts …
├── proxy.ts                # Next.js 16 middleware (session refresh + route guards)
└── types/
    └── supabase.ts         # Generated `Database` type (supabase-gen)
```


---

## 4. Authentication & Authorization

### 4.1 Middleware (`src/proxy.ts`)

Next.js 16 resolves the proxy relative to `src/app`, so the entrypoint lives at `src/proxy.ts` (a root-level `middleware.ts` is silently ignored).

- **Matcher:** `/dashboard/:path*`, `/login`, `/api/auth/:path*`, `/api/admin/:path*`, `/api/dashboard/:path*`
- On every matched request it creates a `createServerClient` middleware client, refreshes the Supabase session, and propagates `Set-Cookie` to both the outgoing request and the response.
- `/login`: authenticated admins are redirected to their intended destination (Loop 65 deep-link preservation via `?redirect=`); non-admin sessions see the login page (prevents redirect loops).
- `/dashboard/*`: requires a session + `requireAdmin` profile check; otherwise redirects to `/login?redirect=<path>`.
- `/api/*`: pass-through — handlers authorize themselves via `getServerSession()`. No auth metadata is emitted as request headers (Loop 59 — removed `x-auth-role` / `x-auth-profile-id` / `x-auth-full-name` to prevent privilege escalation).

### 4.2 Auth utilities (`src/lib/auth/server.ts`)

Centralizes auth logic formerly scattered across middleware, route handlers, and layouts.

- `ADMIN_ROLES = ["super_admin", "admin"]`
- `CONTENT_MANAGER_ROLES = ["super_admin", "admin"]`
- `EMPLOYEE_ROLES = ["super_admin", "admin"]`
- `getServerSession(req?)` — returns `SessionContext` (supabase client + user + profile) or `{ok:false, error, status}`. Queries `profiles` by `id` (matching `auth.uid()`), joined to `roles` via `role_id`.
- `requireAuth(req)`, `requireAdmin(req, roles)` — imperative guards returning `AuthResult`.
- `withAdminAuth`, `withContentManagerAuth`, `withSuperAdminAuth` — higher-order wrappers for API route handlers. `withSuperAdminAuth` additionally requires `role === "super_admin"`.

### 4.3 Client-side auth

- `src/contexts/AuthContext.tsx` + `src/lib/supabase/client.ts` (`getSupabaseBrowser()` singleton).
- `src/hooks/use-notification-subscription.ts` uses the browser client for real-time notification subscriptions.


---

## 5. Data Model (Drizzle schema, `src/db/schema.ts`)

Canonical tables (approx. 30), UUID primary keys, `created_at`/`updated_at` timestamps:

**Identity & access**
- `roles` (id, name, description)
- `profiles` (id, user_id → auth.users, full_name, phone, role_id → roles, avatar_url, is_active)
- `activity_logs` (audit trail of CRUD operations)

**Media (canonical asset store)**
- `media_assets` (id, bucket, path, public_url, mime_type, file_size, width/height, category, content_hash, uploaded_by → profiles)

**Business configuration**
- `business_settings` (singleton, id default 1; name, contact, address, opening_hours jsonb, currency KES, timezone Africa/Nairobi, logo_media_id / logo_light_media_id / favicon_media_id → media_assets)
- `system_settings`, `business_closures`

**Content (page-scoped CMS)**
- `website_pages` (id, page_key, title, content, seo fields, flags)
- `hero_slides` (page_id → website_pages, media_id → media_assets, buttons, display_order)
- `gallery` (page_id → website_pages, media_id → media_assets)
- `testimonials` (customer_name, comment, rating, source, external_id, approved, is_featured)
- `promotions` (media_id → media_assets, page_id → website_pages, show_on_homepage)
- `faqs`, `contact_messages`

**Commerce / bookings**
- `service_categories`, `services` (category_id, name, slug, price, duration_minutes, media_id, page_id)
- `service_charges` (service_id, name, price, unit)
- `menu_categories`, `menu_items` (page_id, category_id, media_id)
- `bookings` (customer_id, service_id, staff_id, start/end, price snapshot, status)
- `booking_history`, `booking_notes`
- `customers`, `staff`, `staff_availability`, `staff_leave`

**Memberships (canonical domain: plans → benefits → customer memberships)**
- `membership_plans` (name, slug, annual_price, registration_fee, media_id → media_assets)
- `membership_plan_benefits` (plan_id, description)
- `customer_memberships` (customer_id → customers, plan_id → plans, member_number `ZT-M-00001` via sequence, status, price snapshots)


---

## 6. API Architecture

### 6.1 Generic admin resource API

`src/app/api/admin/[resource]/route.ts` (GET, POST) and `[resource]/[id]/route.ts` (GET, PATCH, DELETE) plus `batch/route.ts`.

- Auth wrapper chosen by resource:
  - `SUPER_ADMIN_RESOURCES` = membership-plans, membership-plan-benefits, roles, profiles → `withSuperAdminAuth`
  - `CONTENT_RESOURCES` = gallery, testimonials → `withContentManagerAuth`
  - Everything else → `withAdminAuth`
- `Repository` class (`src/lib/repository.ts`) wraps Supabase with:
  - Immutable field stripping (`id`, `created_at`, `role_id`, `booking_number`, …)
  - Sensitive field redaction (`ip_address`, `content_hash`, `password_hash`, …)
  - Response allowlists per table
  - `validateMediaCategoryForMutation` — media_id category enforcement at DB trigger + API + UI layers
  - Page-scoped boundary for `PAGE_SCOPED_RESOURCES` (gallery, hero_slides, menu_items, services, promotions) — `?page_id=` must match body and reference an existing `website_pages` row
- `RESOURCE_MAP` (`src/app/api/admin/resources.ts`) maps URL segments to Drizzle tables (~28 entries).

### 6.2 Dedicated admin routes

Bookings (`/confirm`, `/status`), business-settings branding, contact-messages (`/reply`, `/pending-count`), customer-memberships (`/cancel`, `/renew`), google reviews sync, media upload (`/api/admin/upload`), media import-external, team invitations, upload replace.

### 6.3 Public API

`/api/public/testimonials` — read-only, anon-key client, filters by `featured_only`.

### 6.4 Drizzle / direct Postgres

`src/db/index.ts` creates a `pg.Pool` from `DATABASE_URL` (`SUPABASE_DB_URL`) and a Drizzle instance. Exported as `db` proxy and `getDb()`. Used by `logActivity` and any direct SQL needs.


---

## 7. Media Architecture (canonical)

Single source of truth for all images: `media_assets` table → `public_url`.

- `business_settings.logo_media_id` / `favicon_media_id` → `media_assets.id` → `public_url` (root layout metadata; never falls back to legacy `logo_url`/`favicon_url`).
- `services.media_id`, `menu_items.media_id`, `hero_slides.media_id`, `gallery.media_id`, `membership_plans.media_id` — all FK to `media_assets`.
- `src/lib/media/resolver.ts` — resolves `media_id → media_assets → public_url`; no silent fallback for broken references.
- `src/lib/storage/paths.ts` — bucket path categories.
- Upload: `/api/admin/upload` (image processing via `src/lib/images/processor.ts`) and `/api/admin/media/import-external`.
- Duplicate detection in application code (no DB uniqueness on `content_hash`); returns 409 to reuse existing asset.


---

## 8. E2E Tests

- `tests/e2e/` — Playwright specs for pages, packages, promotions, booking edit, restaurant service info.
- `tests/e2e/fixtures/auth.ts` — Supabase client + `signInWithPassword` for `admin@salon.com`.
- `tests/e2e/setup/global-setup.ts` — verifies `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, E2E credentials before suite.

---

## 9. Key Design Decisions & Loops

| ID | Decision |
|---|---|
| Loop 59 | Removed `x-auth-role` / `x-auth-profile-id` / `x-auth-full-name` response headers — authorization derives solely from `getServerSession()`. |
| Loop 65 | Middleware preserves `/login?redirect=<path>` deep-link destination; validated via `safeRedirectPath` so it can never redirect to `/login` itself. |
| — | Media canonicalization: all content references `media_assets`, never raw URLs stored on content rows. |
| — | Session refresh: middleware (`proxy.ts`) owns cookie writes; Server Components use read-only client to avoid "Cookies can only be modified" errors. |
| — | Singleton browser Supabase client prevents duplicate GoTrueClient warnings. |
| — | Service-role admin client used only server-side; never exposed to browser. |

---

## 10. Scripts (package.json)

| Script | Command |
|---|---|
| `dev` | `next dev` |
| `build` | `next build` |
| `start` | `next start` |
| `lint` | `eslint .` |
| `typecheck` | `tsc --noEmit` |
| `verify:booking-contract` | `node scripts/verify-booking-update-contract.mjs` |
| `audit:phase1` | `node scripts/phase1-verification-baseline.mjs` *(target missing)* |
| `audit:phase1.1` | `node scripts/phase1-1-migration-rls-reconciliation.mjs` *(target missing)* |
| `audit:phase1.2` | `node scripts/phase1-2-rls-remediation.mjs` *(target missing)* |
| `test:e2e` | `playwright test` |

> Note: `audit:phase1*` scripts are declared but the target `.mjs` files do not exist.

---

## 11. How to run an env-based Supabase audit

```powershell
# Load .env.local then run a live audit script
$env:DOTENV_CONFIG_PATH=".env.local"
node scripts/db-schema-check.js        # tables + columns + sample queries
node scripts/verify-live-cms.js        # anon + service role reads, row counts
node scripts/inspect-schema.js         # RLS status, policies, row counts
node scripts/verify-endpoints.js       # service-role reads of CMS tables
```

Or inline:
```bash
node -e "require('dotenv').config({path:'.env.local'}); require('./scripts/db-schema-check.js')"
```

All audit scripts connect to `https://jczwilrysvnhcjzjztbi.supabase.co` using `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (and `NEXT_PUBLIC_SUPABASE_ANON_KEY` where public reads are tested).

