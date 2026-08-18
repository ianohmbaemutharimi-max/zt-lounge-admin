# CORE CMS REMEDIATION BASELINE — PHASE 0

**Date:** August 17, 2026  
**Status:** Pre-remediation baseline established  
**Git State:** Not a git repository (no version control tracking)

---

## 1. BASELINE STATE

### Repository Setup
- **Framework:** Next.js 16.2.6 + TypeScript 5.9.3
- **Database:** PostgreSQL via Supabase
- **ORM:** Drizzle ORM 0.45.2
- **Auth:** @supabase/ssr 0.12.4
- **State:** Zustand, React Query 5.101.4
- **UI:** React 19.2.6, Tailwind CSS 4.1.17
- **Testing:** Playwright 1.62.1
- **Build:** TypeScript, ESLint, no error

### Package Scripts Available
```
npm run dev          # Development server
npm run build        # Production build
npm run start        # Start production server
npm run lint         # Run ESLint
npm run typecheck    # TypeScript validation
```

### Test Infrastructure
- ✅ Playwright configured
- ✅ E2E tests exist: `tests/media-library-edit.spec.ts`, `tests/media-edit-verification.spec.ts`
- ⚪ No unit tests found
- ⚪ No integration test config found

---

## 2. EXISTING ARCHITECTURE

### Core CMS Infrastructure (Verified)

| Component | File | Purpose | Status |
|-----------|------|---------|--------|
| **Repository** | `src/lib/repository.ts` (17,712 bytes) | CRUD operations, field validation | ✅ Exists |
| **Authentication** | `src/lib/auth/server.ts` (10,716 bytes) | JWT, session, role management | ✅ Exists |
| **Admin Validation** | `src/lib/validation/admin.ts` (8,837 bytes) | Resource allowlist, field validation | ✅ Exists |
| **Resource Config** | `src/lib/resource-config.ts` (3,983 bytes) | Table mappings, search fields | ✅ Exists |
| **Dynamic API Routes** | `src/app/api/admin/[resource]/route.ts` (5,174 bytes) | GET/POST handler | ✅ Exists |
| **Dynamic ID Routes** | `src/app/api/admin/[resource]/[id]/route.ts` (3,424 bytes) | GET/PATCH/DELETE handler | ✅ Exists |
| **Middleware** | `middleware.ts` (4,136 bytes) | Auth/session enforcement | ✅ Exists |
| **DB Schema** | `src/db/schema.ts` (20,269 bytes) | Drizzle schema definition | ✅ Exists |

### Authentication Model
- Role-based: `super_admin`, `admin`, `manager`, `staff`
- Admin roles: `super_admin`, `admin`
- Content manager roles: `super_admin`, `admin`, `manager`
- Session via JWT (Supabase SSR)
- Profiles table with role_id FK

### RBAC Model
- **Allowlist approach:** `ADMIN_RESOURCES` set in `validation/admin.ts`
- **Resources:** 30+ registered, including:
  - `menu-items`, `menu-categories`
  - `gallery`
  - `media_assets`
  - `services`, `service-categories`
  - `website-pages`, `hero-slides`
  - Bookings, customers, testimonials, FAQs, promotions, etc.
- **Field validation:** Per-resource EDITABLE_FIELDS, ORDERABLE_COLUMNS, SEARCHABLE_FIELDS
- **No client-side auth:** All checks server-side

### CMS Features

| Feature | Dashboard | API | Components | DB Tables | Status |
|---------|-----------|-----|-----------|-----------|--------|
| **Menu** | ✅ `src/app/dashboard/menu/page.tsx` | ✅ `[resource]` pattern | ❌ No dedicated `src/features/menu/` | `menu_items`, `menu_categories` | CODE-VERIFIED |
| **Gallery** | ✅ `src/app/dashboard/gallery/page.tsx` | ✅ `[resource]` pattern | ✅ `src/features/gallery/` exists | `gallery` | CODE-VERIFIED |
| **Media** | ✅ `src/app/dashboard/media/page.tsx` | ✅ `[resource]` + `/api/media` | ✅ `media-library-view.tsx`, `media-edit-modal.tsx` | `media_assets` | 🟢 **RUNTIME-VERIFIED** |
| **Services** | ✅ `src/app/dashboard/services/page.tsx` | ✅ `[resource]` pattern | ✅ `src/features/services/catalog-manager.tsx` | `services`, `service_categories` | CODE-VERIFIED |
| **Website CMS** | ✅ `src/app/dashboard/website/page.tsx` | ✅ `[resource]` pattern | ❌ No dedicated `src/features/website/` | `website_pages`, `hero_slides` | CODE-VERIFIED |

### Media Library Edit Feature (Already Verified 🟢)
- ✅ Edit icon overlay on card hover
- ✅ Modal component: `media-edit-modal.tsx`
- ✅ PATCH `/api/admin/media_assets/{id}` functional
- ✅ Database persistence verified
- ✅ Original values restoration verified
- ✅ No regressions detected

---

## 3. KNOWN STATUS FROM PREVIOUS AUDIT

### Verified Working
- ✅ Authentication middleware
- ✅ Admin RBAC (resource allowlist)
- ✅ Input validation (UUID, search terms, field whitelists)
- ✅ Media Library Edit Icon (runtime verified)
- ✅ Dynamic resource routing pattern
- ✅ Server-side auth enforcement

### Requires Verification
- ⚪ RLS policies on all CMS tables (requires live Supabase inspection)
- ⚪ Test data cleanup (VERIFIED_EDIT_* values may exist in production)
- ⚪ Service-role credential isolation (ensure not exposed to client)
- ⚪ Menu CRUD E2E (code verified, runtime not tested)
- ⚪ Gallery CRUD E2E (code verified, runtime not tested)
- ⚪ Services CRUD E2E (code verified, runtime not tested)
- ⚪ Website CMS CRUD E2E (code verified, runtime not tested)
- ⚪ Public data propagation flow (admin change → public rendering)
- ⚪ Cache invalidation strategy (React Query, Next.js cache)
- ⚪ API error handling consistency
- ⚪ Performance metrics (N+1 queries, API latency)

### Test Infrastructure Issues
- ⚠️ Media E2E test timeout issue (120s exceeded at page reload step)
- ⚠️ Timeout not caused by application logic (earlier steps all passed)
- ⚠️ Need deterministic wait strategy instead of arbitrary sleep()

---

## 4. DATABASE SCHEMA (From Migrations)

### CMS-Related Tables

| Table | PK | Type | RLS | Status |
|-------|-----|------|-----|--------|
| `menu_items` | `id` UUID | Content | ⚪ Not verified | CODE |
| `menu_categories` | `id` UUID | Content | ⚪ Not verified | CODE |
| `gallery` | `id` UUID | Content | ⚪ Not verified | CODE |
| `media_assets` | `id` UUID | Content/Storage | ✅ Verified | RUNTIME |
| `services` | `id` UUID | Content | ⚪ Not verified | CODE |
| `service_categories` | `id` UUID | Content | ⚪ Not verified | CODE |
| `website_pages` | `id` UUID | Content | ⚪ Not verified | CODE |
| `hero_slides` | `id` UUID | Content | ⚪ Not verified | CODE |

### Common Schema Pattern
- Primary key: UUID
- Timestamps: `created_at`, `updated_at` (TIMESTAMPTZ)
- Status: `is_active`, `is_featured` (BOOLEAN)
- Ordering: `display_order` (INTEGER)
- Content: `title`, `description`, `name` fields

---

## 5. PRODUCTION FILES THAT WILL POTENTIALLY CHANGE

### During Remediation

**Migrations (Database):**
- May add/modify RLS policies
- May add new migrations for CMS table fixes
- Will NOT drop tables or existing columns

**Test Files (E2E):**
- `tests/media-edit-verification.spec.ts` (fix timeout)
- `tests/core-cms-menu.spec.ts` (new, Menu verification)
- `tests/core-cms-gallery.spec.ts` (new, Gallery verification)
- `tests/core-cms-services.spec.ts` (new, Services verification)
- `tests/core-cms-website.spec.ts` (new, Website CMS verification)

**Documentation (No code changes):**
- `CORE_CMS_RLS_AUDIT.md` (findings only)
- `CORE_CMS_SERVICE_ROLE_SECURITY.md` (findings only)
- `CORE_CMS_TEST_DATA_CLEANUP.md` (findings only)
- `CORE_CMS_CACHE_STRATEGY.md` (findings only)
- `CORE_CMS_FINAL_PRODUCTION_AUDIT.md` (final status)

**Source Code (Production Code):**
- ❌ Will NOT modify `src/lib/repository.ts`
- ❌ Will NOT modify `src/lib/auth/server.ts`
- ❌ Will NOT modify `src/lib/validation/admin.ts`
- ❌ Will NOT modify `src/app/api/admin/[resource]/route.ts`
- ❌ Will NOT modify `src/app/api/admin/[resource]/[id]/route.ts`
- ❌ Will NOT modify CMS dashboard pages (unless fixing a genuine bug)
- ❌ Will NOT modify Media Library Edit feature (already verified)

### What WILL Change
- RLS policies (via migrations)
- Test data (cleanup)
- Test suite (new E2E tests, fix timeouts)
- Documentation (findings, recommendations)

### What WILL NOT Change
- Core CRUD architecture (dynamic routing already optimal)
- Authentication model (already correct)
- RBAC model (resource allowlist already correct)
- Field validation (already strong)

---

## 6. REMEDIATION SCOPE

### Phase 0 ✅ Complete
- Baseline documented
- Architecture confirmed
- Test infrastructure reviewed
- Production files identified
- Safety checks completed

### Phases 1-18 Ahead

| Phase | Scope | Estimated Changes |
|-------|-------|-------------------|
| 1 | Database RLS Audit | May add/fix RLS policies |
| 2 | Service Role Security | Likely no code changes (audit only) |
| 3 | Test Data Cleanup | Query/delete test records |
| 4 | Fix E2E Timeout | Modify test timeouts/selectors |
| 5-8 | E2E Tests Menu/Gallery/Services/Website | Add new test files |
| 9-10 | Data Propagation/Cache | Audit only (no code changes unless found broken) |
| 11-13 | API/CRUD/Error Audit | Audit only |
| 14 | Performance | Audit only |
| 15 | Audit Logging | Assess, may recommend new feature |
| 16 | Full Test Suite | Run all tests |
| 17 | Regression Verification | Verify Media Edit still works |
| 18 | Final Production Audit | Status determination |

---

## 7. CRITICAL BASELINE CONSTRAINTS

### Do NOT
- ❌ Rewrite CMS architecture
- ❌ Replace dynamic routing with feature-specific routes
- ❌ Create duplicate APIs
- ❌ Modify Media Library Edit feature (already verified)
- ❌ Break existing authentication
- ❌ Weaken RBAC
- ❌ Introduce client-side authorization
- ❌ Commit to git (no git repo)

### Do
- ✅ Inspect before changing
- ✅ Make minimal safe changes
- ✅ Test after each phase
- ✅ Document findings
- ✅ Preserve working functionality
- ✅ Use runtime verification
- ✅ Diagnose failures (root cause)

---

## 8. SUCCESS CRITERIA FOR REMEDIATION

**Phase 0 Complete When:**
- ✅ Baseline documented
- ✅ No code modifications
- ✅ Architecture confirmed
- ✅ Ready to proceed to Phase 1

**Full Remediation Complete When:**
- ✅ All RLS policies verified/fixed
- ✅ Test data cleaned
- ✅ Service-role isolation verified
- ✅ All E2E tests pass
- ✅ Public data propagation verified
- ✅ Cache/revalidation working
- ✅ API error handling consistent
- ✅ Performance baseline established
- ✅ No P0 defects remain
- ✅ Media Library Edit still works
- ✅ Final audit: 🟢 **PRODUCTION READY**

---

## 9. NOTES

- Not a git repository: no version control for rollback (rely on Supabase backups)
- Playwright E2E framework is configured and ready
- Supabase SSR configured (anon key in NEXT_PUBLIC, service role separate)
- TypeScript configured with strict mode
- Build command: `npm run build`
- Test command: `npx playwright test`

---

**PHASE 0 COMPLETE**

Ready to proceed to Phase 1: Database + RLS Security Audit


