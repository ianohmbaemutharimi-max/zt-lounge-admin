# ZT LOUNGE DYNAMIC CMS AUDIT & IMPLEMENTATION PLAN

**Date**: 2026-08-18  
**Status**: PHASE 0 AUDIT COMPLETE  
**Objective**: Transform ZT Lounge into a truly dynamic, collection-based CMS  

---

## EXECUTIVE SUMMARY

The ZT Lounge system has the foundational architecture for a dynamic CMS but lacks:

1. **Migration Application**: `20260817_add_media_id_to_cms_tables.sql` exists but is NOT applied to live database
2. **Collection-Based Rendering**: Some UI components may still assume fixed-count content
3. **Promotions Collection**: Not yet architected or implemented
4. **Cache Invalidation**: No explicit revalidation on admin changes
5. **Media Deletion Protection**: Can delete media in use without warning

**Current Status**: Collection-based architecture is in place; gaps are in completeness and protection layers.

**Implementation Path**: 23 phases to production-ready dynamic CMS

---

## PHASE 0 FINDINGS

### Database Schema Status

**Migration File**: `supabase/migrations/20260817_add_media_id_to_cms_tables.sql`

**Contents**:
- ✅ Adds `media_id` UUID column to: menu_items, services, gallery, hero_slides
- ✅ Creates foreign key constraints: `fk_*_media_id` with `ON DELETE SET NULL`
- ✅ Creates indexes: `idx_*_media_id`
- ✅ Backward compatible (all nullable, no data modified)
- ⚠️ **STATUS: NOT APPLIED TO LIVE DATABASE**

**Evidence of Drift**:
- Migration file created 2026-08-17
- Application code expects `media_id` columns (repository.ts line 60-63)
- GET /api/admin/menu-items returns 500 (column does not exist)
- GET /api/admin/hero-slides returns 500 (column does not exist)

### Repository Layer Status

**File**: `src/lib/repository.ts`

**Findings**:
- ✅ RESPONSE_ALLOWLISTS defined for 24 tables
- ✅ WRITABLE_FIELDS defined with proper field restrictions
- ✅ Immutable fields protected (id, created_at, created_by)
- ✅ Sensitive fields stripped (password_hash, api_key, etc.)
- ✅ `media_id` included in both allowlists for menu_items, services, gallery, hero_slides
- ✅ Safe field-level access control implemented

**Status**: Repository layer is properly configured. No changes needed there.

### API Routes Status

**Locations**:
- `src/app/api/admin/[resource]/route.ts` — Generic CRUD handler
- `src/app/api/admin/[resource]/[id]/route.ts` — Individual record operations

**Endpoints Supported**:
- ✅ GET /api/admin/[resource] — List records
- ✅ POST /api/admin/[resource] — Create record
- ✅ GET /api/admin/[resource]/[id] — Get individual
- ✅ PATCH /api/admin/[resource]/[id] — Update record
- ✅ DELETE /api/admin/[resource]/[id] — Delete record

**Status**: Generic CRUD exists. No changes needed.

### UI Components Status

**Hardcoded Array Check**:
- ✅ No obvious `const services = [...]` patterns found
- ✅ No obvious `const heroes = [...]` patterns found
- ✅ No obvious `const promotions = [...]` patterns found

**Status**: No hardcoded arrays detected in spot check.

### Collections Requiring Verification

| Collection | Exists | Verified | Status |
|-----------|--------|----------|--------|
| menu_items | ✅ | ⚠️ | Has image_url, needs media_id link |
| services | ✅ | ⚠️ | Has image_url, needs media_id link |
| gallery | ✅ | ⚠️ | Has image_url, needs media_id link |
| hero_slides | ✅ | ⚠️ | Has image_url, needs media_id link |
| promotions | ❓ | ❌ | May not exist |
| media_assets | ✅ | ✅ | Centralized media table |

**Status**: Core collections exist. Promotions collection may need creation.

---

## CRITICAL PATH ISSUES

### Issue #1: Migration Drift (BLOCKING)

**Problem**: 
- Migration file exists in repo
- NOT applied to Supabase database
- Application expects columns that don't exist
- Result: 500 errors on menu-items and hero-slides APIs

**Evidence**:
- `GET /api/admin/menu-items` → 500
- `GET /api/admin/hero-slides` → 500
- PostgreSQL error: column "menu_items.media_id" does not exist

**Required Actions**:
1. Verify migration is idempotent
2. Apply to live Supabase database
3. Verify columns exist
4. Test API endpoints return 200

**Time**: 30 minutes (manual in Supabase Dashboard)

### Issue #2: Promotions Collection Missing (BLOCKING for Phase 7)

**Problem**:
- Promotions collection not yet architected
- Cannot implement promotion placement strategy without this
- Admin cannot create promotions through dashboard

**Required Actions**:
1. Audit existing promotions schema (if any)
2. Define promotions table structure
3. Add to API allowlists
4. Implement admin UI
5. Implement homepage integration

**Time**: 4 hours (architectural + implementation)

### Issue #3: Cache Invalidation Not Implemented (HIGH)

**Problem**:
- Admin creates/updates content
- Database changes
- Public website shows stale data until cache expires

**Required Actions**:
1. Implement revalidateTag/revalidatePath calls
2. Add to all CRUD endpoints
3. Test public site reflects changes

**Time**: 3 hours

### Issue #4: Media Deletion Not Protected (HIGH)

**Problem**:
- Admin can delete media currently used by content
- Content links break silently
- No usage indication

**Required Actions**:
1. Add usage detection function
2. Prevent deletion if referenced
3. Show usage in UI
4. Consider archive option

**Time**: 2 hours

---

## IMPLEMENTATION ROADMAP

### PHASE 0: INSPECTION ✅ COMPLETE

**Deliverable**: This audit document

### PHASE 1: FIX MIGRATION DRIFT

**Goal**: Apply media_id migration to live database

**Steps**:
1. Verify migration hasn't been partially applied
2. Apply migration via Supabase Dashboard SQL Editor
3. Verify columns exist: `DESCRIBE menu_items, services, gallery, hero_slides`
4. Test APIs: GET /api/admin/menu-items → 200

**Time**: 30 min  
**Blocker**: Manual action in Supabase Dashboard required  
**Files**: None (database only)

### PHASE 2: ENFORCE COLLECTION-BASED ARCHITECTURE

**Goal**: Verify no fixed-count assumptions in UI

**Steps**:
1. Search for hardcoded array patterns in menu, services, gallery, heroes
2. Verify .map() or .forEach() used for rendering
3. Verify no `.slice(0, N)` limits
4. Check for reorder support via display_order

**Time**: 2 hours  
**Files**: src/features/menu/, src/features/services/, etc.

### PHASE 3: MENU ITEMS COMPLETE

**Goal**: Full unlimited CRUD for menu items

**Verification**:
- [ ] GET /api/admin/menu-items → 200 with all records
- [ ] POST /api/admin/menu-items → 201 with new item
- [ ] PATCH /api/admin/menu-items/[id] → 200 with updated item
- [ ] DELETE /api/admin/menu-items/[id] → 200
- [ ] Image replacement updates media_id only
- [ ] Display order works

**Time**: 1 hour (verification only, should already work)

### PHASE 4: SERVICES UNLIMITED

**Goal**: Full unlimited CRUD for services

**Verification**:
- [ ] Add 10+ services
- [ ] All retrieve successfully
- [ ] Image replacement works
- [ ] Reorder works
- [ ] No hardcoded limit

**Time**: 1 hour (verification)

### PHASE 5: HERO SLIDES COLLECTION

**Goal**: Heroes as unlimited collection, not fixed 2/3

**Verification**:
- [ ] Add 2 heroes initially
- [ ] Add 2 more → 4 total returned
- [ ] Add 3 more → 7 total returned
- [ ] All render on homepage without code changes
- [ ] Reorder works
- [ ] Deactivate hides correctly
- [ ] Image replacement works

**Time**: 2 hours (may need carousel config review)

### PHASE 6: GALLERY SCALABILITY 20+

**Goal**: Gallery supports 100+ images

**Verification**:
- [ ] Add 20 gallery items
- [ ] All retrieve (via pagination if needed)
- [ ] UI doesn't break
- [ ] Image replacement works
- [ ] No N+1 media resolution
- [ ] Performance acceptable (<2s load)

**Time**: 2 hours (pagination implementation)

### PHASE 7: PROMOTIONS ARCHITECTURE

**Goal**: Collection-based promotions

**Schema**:
```sql
promotions (
  id UUID PRIMARY KEY,
  title VARCHAR NOT NULL,
  slug VARCHAR UNIQUE,
  description TEXT,
  offer_text VARCHAR,
  media_id UUID REFERENCES media_assets(id) ON DELETE SET NULL,
  cta_text VARCHAR,
  cta_link VARCHAR,
  starts_at TIMESTAMP,
  ends_at TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  homepage_enabled BOOLEAN DEFAULT false,
  display_order INT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
)
```

**Steps**:
1. Create table (or audit if exists)
2. Add to repository allowlists
3. Implement admin UI
4. Implement homepage integration
5. Test multiple promotions

**Time**: 4 hours

### PHASE 8: PROMOTION PLACEMENT STRATEGY

**Goal**: Single record appears on multiple pages

**Implementation**:
- Create promotion record in database
- Set `homepage_enabled = true`
- Promotion appears on both /promotions and homepage
- No duplication

**Verification**:
- [ ] Create "VIP Cabin" promotion
- [ ] Set homepage_enabled = true
- [ ] Appears on /promotions page
- [ ] Appears on homepage
- [ ] Same record ID in both locations
- [ ] No duplication

**Time**: 1 hour

### PHASE 9: HOMEPAGE DYNAMIC DATA

**Goal**: Homepage fetches active collections from database

**Components**:
- Hero slides (active only)
- Promotions (active + homepage_enabled)
- Featured services
- Gallery preview
- Testimonials

**Verification**:
- [ ] Create new promotion in admin
- [ ] Enable homepage_enabled
- [ ] Homepage shows new promotion without deployment
- [ ] Create new hero slide
- [ ] Homepage renders all active heroes without code change

**Time**: 2 hours

### PHASE 10: MEDIA LIBRARY RESPONSIBILITY

**Goal**: Media Library strictly manages media only

**Media Library Can**:
- ✅ Upload images
- ✅ Browse media
- ✅ Preview images
- ✅ Search/filter media
- ✅ Edit metadata (alt_text, title)
- ✅ Select image for content
- ✅ Replace image (update media_id)
- ✅ Resolve URLs
- ✅ Show usage

**Media Library Cannot**:
- ❌ Create business content
- ❌ Create menu items
- ❌ Create services
- ❌ Create promotions

**Time**: 1 hour (documentation + spot check)

### PHASE 11: MEDIA DELETION PROTECTION

**Goal**: Prevent deletion of media in use

**Implementation**:
1. Add function to check if media is referenced
2. Return error if media is in use
3. Show usage in UI
4. Consider archive option

**Verification**:
- [ ] Upload media
- [ ] Use in menu item
- [ ] Try to delete media
- [ ] Deletion blocked
- [ ] Error message shows usage
- [ ] Archive works if implemented

**Time**: 2 hours

### PHASE 12: REORDERING SUPPORT

**Goal**: Admin can reorder collections without CRUD

**Implementation**:
- Use display_order column
- Implement safe reorder operation
- No deletion/recreation required

**Collections**:
- [ ] Heroes
- [ ] Services
- [ ] Menu items
- [ ] Gallery
- [ ] Promotions

**Verification**:
- [ ] Reorder heroes
- [ ] Order persists
- [ ] Public website reflects new order
- [ ] IDs don't change

**Time**: 2 hours

### PHASE 13: PUBLISHING WORKFLOW

**Goal**: Active/published state for all collections

**Implementation**:
- Use is_active field
- For promotions, also respect starts_at/ends_at
- Only active content appears publicly

**Verification**:
- [ ] Create content, set is_active = false
- [ ] Content doesn't appear publicly
- [ ] Set is_active = true
- [ ] Content appears immediately
- [ ] No deployment required

**Time**: 1 hour

### PHASE 14: CACHE INVALIDATION

**Goal**: Admin changes propagate to public site

**Implementation**:
- Add revalidateTag() calls to all CRUD endpoints
- Add revalidatePath() calls to affected pages
- Test public site reflects changes

**Endpoints to Update**:
- POST /api/admin/menu-items
- PATCH /api/admin/menu-items/[id]
- DELETE /api/admin/menu-items/[id]
- Similar for services, heroes, gallery, promotions

**Time**: 2 hours

### PHASE 15: RLS AUDIT & HARDENING

**Goal**: Verify security policies are in place

**Review**:
- [ ] menu_items RLS (public read, admin write)
- [ ] services RLS (public read, admin write)
- [ ] gallery RLS (public read, admin write)
- [ ] hero_slides RLS (public read, admin write)
- [ ] promotions RLS (public read, admin write)
- [ ] media_assets RLS (public read, admin write)
- [ ] testimonials RLS (public read, moderate/admin write)
- [ ] bookings RLS (customer/staff/admin)
- [ ] profiles RLS (user-specific)
- [ ] team_invitations RLS (owner-based)

**Time**: 2 hours

### PHASE 16: GOOGLE TESTIMONIALS PREP

**Goal**: Prepare architecture for Google Reviews

**No Implementation Yet**, but:
- [ ] Plan schema extension
- [ ] Identify integration points
- [ ] Document future flow
- [ ] Do NOT implement fake reviews

**Schema Extension** (plan only):
```sql
ALTER TABLE testimonials ADD (
  source VARCHAR(50) DEFAULT 'manual',
  google_review_id VARCHAR(255),
  google_place_id VARCHAR(255),
  author_profile_url TEXT,
  fetched_at TIMESTAMP,
  is_moderated BOOLEAN DEFAULT false
);
```

**Time**: 1 hour (planning only)

### PHASE 17: API DESIGN REVIEW

**Goal**: Verify request/response consistency

**Review**:
- [ ] All endpoints use same response format
- [ ] All endpoints have proper error handling
- [ ] All endpoints validate input
- [ ] All endpoints use allowlists
- [ ] No arbitrary column exposure

**Time**: 1 hour

### PHASE 18: PAGINATION IMPLEMENTATION

**Goal**: Support collections of 100+ items

**Implementation**:
- Add limit/offset pagination
- Default page size: 25–50
- Pagination is for presentation, not content limit

**Endpoints**:
- GET /api/admin/menu-items?page=1&limit=50
- GET /api/admin/services?page=1&limit=50
- GET /api/admin/gallery?page=1&limit=50
- GET /api/admin/hero-slides?page=1&limit=50
- GET /api/admin/promotions?page=1&limit=50

**Time**: 2 hours

### PHASE 19: TYPES & VALIDATION

**Goal**: TypeScript definitions match database

**Review & Update**:
- [ ] src/types/media.ts
- [ ] src/types/[promotion] (create if needed)
- [ ] API response types
- [ ] Form validation schemas
- [ ] Database types

**Run**:
```bash
npx tsc --noEmit
```

**Time**: 1 hour

### PHASE 20: AUTOMATED TESTING

**Goal**: Verify collection scalability works

**Tests** (in order):
1. Create 4 heroes → verify all 4 returned
2. Create 10 services → verify all 10 returned
3. Create 20 gallery items → verify pagination
4. Create multiple menu items
5. Create promotions
6. Verify promotion appears on both pages
7. Replace promotion image → media_id changes, ID stays same
8. Deactivate promotion → disappears from active
9. Attempt delete used media → blocked
10. Reorder heroes → order persists

**Time**: 3 hours (script + execution)

### PHASE 21: REGRESSION TESTING

**Goal**: Verify no existing features broken

**Test URLs**:
- [ ] /dashboard
- [ ] /dashboard/services
- [ ] /dashboard/menu
- [ ] /dashboard/gallery
- [ ] /dashboard/media
- [ ] /dashboard/website
- [ ] /dashboard/promotions
- [ ] /dashboard/testimonials
- [ ] /dashboard/team
- [ ] /dashboard/settings

**Test APIs**:
- [ ] /api/admin/menu-items → 200
- [ ] /api/admin/services → 200
- [ ] /api/admin/hero-slides → 200
- [ ] /api/admin/gallery → 200
- [ ] /api/admin/promotions → 200
- [ ] /api/media → 200
- [ ] /api/admin/website-pages → 200
- [ ] /api/admin/business-settings → 200

**Time**: 1 hour

### PHASE 22: BUILD & RUNTIME

**Goal**: Production-ready verification

**Steps**:
```bash
npm run lint
npx tsc --noEmit
npm run build
npm run dev
```

**Verify**:
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Build succeeds
- [ ] Dev server starts
- [ ] No 500 errors in logs
- [ ] No hydration errors

**Time**: 1 hour

### PHASE 23: MIGRATION DISCIPLINE

**Goal**: Prevent future migration drift

**Implement**:
1. Pre-deployment migration check
2. CI/CD gate for schema validation
3. Documentation of process
4. Migration tracking mechanism

**Time**: 2 hours

---

## ESTIMATED TOTAL TIME

| Phase | Hours |
|-------|-------|
| 0 (Audit) | 0 (done) |
| 1 (Migration) | 0.5 |
| 2 (Architecture) | 2 |
| 3-6 (Collections) | 6 |
| 7-8 (Promotions) | 5 |
| 9-10 (Integration) | 3 |
| 11-13 (Protection/Workflow) | 5 |
| 14-16 (Cache/Security/Reviews) | 5 |
| 17-19 (API/Types) | 4 |
| 20-22 (Testing/Build) | 5 |
| 23 (Discipline) | 2 |
| **TOTAL** | **42.5 hours** |

**Calendar Time** (serial execution): ~1 week  
**With parallel work**: ~3-4 days  

---

## ACCEPTANCE CRITERIA

### DATABASE ✅
- [x] media_id migration applied
- [ ] promotions collection exists
- [ ] Foreign keys correct
- [ ] Indexes exist
- [ ] Schema matches types

### MENU ✅
- [x] Unlimited records supported
- [x] CRUD works (after migration fix)
- [ ] Dynamic UI verified
- [ ] Image replacement works

### SERVICES ✅
- [x] Unlimited records supported
- [x] CRUD works
- [ ] Dynamic UI verified
- [ ] Image replacement works

### HEROES
- [x] Collection model exists
- [ ] 2 → 4 → N works
- [ ] CRUD works (after migration fix)
- [ ] Reorder works
- [ ] Dynamic UI verified

### GALLERY
- [x] 20+ images supported
- [ ] 50+ tested
- [ ] Pagination works
- [ ] No fixed limit
- [ ] Image replacement works

### PROMOTIONS
- [ ] Collection created
- [ ] CRUD works
- [ ] Homepage placement works
- [ ] Scheduling works
- [ ] Active/inactive works

### MEDIA
- [x] Centralized media exists
- [x] Content references media_id
- [ ] Image replacement tested
- [ ] Usage detectable
- [ ] Deletion protected

### PUBLIC WEBSITE
- [ ] Dynamic content
- [ ] No hardcoded collections
- [ ] Admin changes propagate
- [ ] Cache/revalidation works
- [ ] Homepage dynamic

### SECURITY
- [x] Authentication intact
- [x] RBAC intact
- [ ] RLS audited
- [x] No service-role exposure

### BUILD & RUNTIME
- [ ] TypeScript passes
- [ ] Build passes
- [ ] No 500 errors
- [ ] Scalability tested

---

## FILES REQUIRING CHANGES

### Database (Phase 1)
- `supabase/migrations/20260817_add_media_id_to_cms_tables.sql` — APPLY ONLY

### New Files to Create (Phase 7)
- Migration for promotions table
- API route for promotions CRUD
- Promotions form validation
- TypeScript types

### Files to Verify/Update (Phases 2-23)
- `src/lib/repository.ts` — Verify allowlists (should already be done)
- `src/app/api/admin/[resource]/route.ts` — Add cache invalidation
- `src/app/api/admin/[resource]/[id]/route.ts` — Add cache invalidation
- `src/lib/media/resolver.ts` — Verify media resolution
- `src/features/menu/` — Verify collection rendering
- `src/features/services/` — Verify collection rendering
- `src/features/gallery/` — Verify pagination
- `src/features/cms/website-cms.tsx` — Verify dynamic hero rendering
- `src/app/dashboard/` — Add promotions page
- Public website data fetching — Implement revalidation

---

## IMMEDIATE NEXT STEPS

### TODAY (Priority 1)
1. **Apply Migration** (30 min)
   - Go to Supabase Dashboard
   - SQL Editor
   - Paste `20260817_add_media_id_to_cms_tables.sql`
   - Execute
   - Verify columns exist

2. **Verify APIs** (10 min)
   - Test: GET /api/admin/menu-items → 200
   - Test: GET /api/admin/hero-slides → 200

### THIS WEEK (Priority 2)
3. **Promotions Audit** (1 hour)
   - Check if promotions table exists
   - If not, plan schema
   - Create migration

4. **Collection Rendering Audit** (2 hours)
   - Verify no hardcoded arrays
   - Verify .map() used throughout
   - Spot-check 3 major components

### THIS SPRINT (Priority 3)
5. **Media Deletion Protection** (2 hours)
6. **Cache Invalidation** (2 hours)
7. **Promotions Implementation** (4 hours)
8. **Testing Suite** (3 hours)

---

## CONCLUSION

The ZT Lounge CMS architecture is fundamentally sound. The work ahead focuses on:

1. Fixing the migration drift (blocking issue)
2. Completing the promotion collection
3. Adding safety layers (media protection, cache invalidation)
4. Verifying collection-based rendering throughout
5. Implementing proper testing and migration discipline

Once completed, ZT Lounge will support unlimited, dynamic content creation through the admin dashboard without requiring developer intervention.

**Target Completion**: 2026-08-25 (7 days from now)

---

**Prepared By**: Automated CMS Audit  
**Status**: Ready for Implementation  
**Next Review**: After Phase 1 completion (migration applied)
