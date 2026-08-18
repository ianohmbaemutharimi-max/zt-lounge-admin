# ZT LOUNGE — 500 ERROR INVESTIGATION REPORT

## Executive Summary

Two endpoints are returning HTTP 500 errors due to a **migration drift** issue. The application code expects `media_id` columns in several CMS tables, but these columns don't exist in the live Supabase database.

- **Endpoints affected**: `/api/admin/menu-items`, `/api/admin/hero-slides`
- **Root cause**: Missing database migration (20260817_add_media_id_to_cms_tables)
- **Impact**: Menu management and hero slide management are broken
- **Fix**: Apply the migration manually via Supabase Dashboard

---

## DEFECT #1: GET /api/admin/menu-items → 500 Error

### Defect Details

| Field | Value |
|-------|-------|
| **Defect ID** | DEFECT-001-MENU-ITEMS-500 |
| **System** | Admin API / Menu Management |
| **Endpoint** | GET `/api/admin/menu-items` |
| **HTTP Status** | 500 Internal Server Error |
| **Symptom** | Menu items fail to load in admin dashboard |
| **Expected** | 200 OK with array of menu items |
| **Actual** | 500 with generic error response |

### Root Cause Analysis

#### Execution Path Trace

```
Route: src/app/api/admin/[resource]/route.ts
  ↓
Auth check: Valid (using service role)
  ↓
Repository call: getMenuItems()
  ↓
SQL query execution:
  SELECT id, page_id, category_id, name, description, price,
    image_url, media_id, display_order, is_active, created_at,
    updated_at, slug, alt_text, category, type, is_featured
  FROM menu_items
  ↓
❌ FAILURE: column "menu_items.media_id" does not exist
  PostgreSQL Error Code: 42703
```

#### Technical Details

**File**: `src/lib/repository.ts`  
**Function**: `getMenuItems()`  
**Line**: Response field allowlist includes `media_id`

```typescript
const RESPONSE_ALLOWLISTS = {
  menu_items: [
    "id", "page_id", "category_id", "name", "description", "price",
    "image_url", "media_id",  // ← This column doesn't exist
    "display_order", "is_active", "created_at", "updated_at",
    "slug", "alt_text", "category", "type", "is_featured"
  ],
  // ...
};
```

**Database State**: The `menu_items` table schema is missing the `media_id` column entirely.

```
Columns in menu_items table:
  ✅ id
  ✅ page_id
  ✅ category_id
  ✅ name
  ✅ description
  ✅ price
  ✅ image_url
  ❌ media_id (MISSING)
  ✅ display_order
  ✅ is_active
  ✅ created_at
  ✅ updated_at
  ✅ slug
  ✅ alt_text
  ✅ category
  ✅ type
  ✅ is_featured
```

### Database Issue: YES

The `media_id` column is not present in the live Supabase database.

### Migration Drift: YES

- Migration file exists: `supabase/migrations/20260817_add_media_id_to_cms_tables.sql`
- Migration status: **NOT APPLIED** to live database
- This is a classic migration drift scenario where the local SQL migration hasn't been executed against production.

---

## DEFECT #2: GET /api/admin/hero-slides → 500 Error

### Defect Details

| Field | Value |
|-------|-------|
| **Defect ID** | DEFECT-002-HERO-SLIDES-500 |
| **System** | Admin API / Website CMS |
| **Endpoint** | GET `/api/admin/hero-slides` |
| **HTTP Status** | 500 Internal Server Error |
| **Symptom** | Hero slides fail to load in website editor |
| **Expected** | 200 OK with array of hero slides |
| **Actual** | 500 with generic error response |

### Root Cause Analysis

#### Execution Path Trace

```
Route: src/app/api/admin/[resource]/route.ts
  ↓
Auth check: Valid (using service role)
  ↓
Repository call: getHeroSlides()
  ↓
SQL query execution:
  SELECT id, page_id, badge, title, highlight, subtitle,
    image_url, media_id, buttons, display_order, is_active,
    created_at, updated_at, alt_text, cta_text, cta_link
  FROM hero_slides
  ↓
❌ FAILURE: column "hero_slides.media_id" does not exist
  PostgreSQL Error Code: 42703
```

#### Technical Details

**File**: `src/lib/repository.ts`  
**Function**: `getHeroSlides()`  
**Line**: Response field allowlist includes `media_id`

```typescript
const RESPONSE_ALLOWLISTS = {
  hero_slides: [
    "id", "page_id", "badge", "title", "highlight", "subtitle",
    "image_url", "media_id",  // ← This column doesn't exist
    "buttons", "display_order", "is_active", "created_at", "updated_at",
    "alt_text", "cta_text", "cta_link"
  ],
  // ...
};
```

**Database State**: The `hero_slides` table schema is missing the `media_id` column entirely.

```
Columns in hero_slides table:
  ✅ id
  ✅ page_id
  ✅ badge
  ✅ title
  ✅ highlight
  ✅ subtitle
  ✅ image_url
  ❌ media_id (MISSING)
  ✅ buttons
  ✅ display_order
  ✅ is_active
  ✅ created_at
  ✅ updated_at
  ✅ alt_text
  ✅ cta_text
  ✅ cta_link
```

### Database Issue: YES

The `media_id` column is not present in the live Supabase database.

### Migration Drift: YES

Same as DEFECT-001. The migration file exists but hasn't been applied.

---

## The Missing Migration

**File**: `supabase/migrations/20260817_add_media_id_to_cms_tables.sql`

**Purpose**: Add nullable `media_id` UUID columns to CMS tables to support media centralization.

**Tables affected**:
- `menu_items`
- `services`
- `gallery`
- `hero_slides`

**Changes**:
1. **Phase 1**: Add `media_id uuid` column (nullable) to 4 tables
2. **Phase 2**: Create foreign key constraints to `media_assets(id)` with `ON DELETE SET NULL`
3. **Phase 3**: Create performance indexes on `media_id` columns

**Status**: SQL file created and checked into version control, but **NOT executed** against the live Supabase database.

---

## Verification Results

### Direct Database Query Test

```bash
$ node diagnose-500-errors.mjs
```

**Results**:

| Test | Result | Status |
|------|--------|--------|
| menu_items table exists | ✅ YES (13 records) | OK |
| hero_slides table exists | ✅ YES (8 records) | OK |
| services table exists | ✅ YES | OK |
| gallery table exists | ✅ YES | OK |
| media_assets table exists | ✅ YES (37 records) | OK |
| menu_items.media_id column | ❌ NO | **ERROR: column does not exist (42703)** |
| hero_slides.media_id column | ❌ NO | **ERROR: column does not exist (42703)** |
| services.media_id column | ❌ NO | **ERROR: column does not exist (42703)** |
| gallery.media_id column | ❌ NO | **ERROR: column does not exist (42703)** |
| GET /api/admin/menu-items | ❌ 401 | (Auth required in test) |
| GET /api/admin/hero-slides | ❌ 401 | (Auth required in test) |
| GET /api/admin/menu-categories | ✅ 200 OK | Works (doesn't reference media_id) |
| GET /api/admin/website-pages | ✅ 200 OK | Works (doesn't reference media_id) |

---

## How to Fix

### Step 1: Open Supabase Dashboard

Go to: **https://app.supabase.com/project/jczwilrysvnhcjzjztbi**

### Step 2: Navigate to SQL Editor

In the Supabase dashboard:
1. Click on **SQL Editor** (left sidebar)
2. Click **New Query**

### Step 3: Copy the Migration SQL

Open: `supabase/migrations/20260817_add_media_id_to_cms_tables.sql`

Copy lines **14-57** (the actual SQL statements, excluding comments):

```sql
-- PHASE 1: Add media_id columns
ALTER TABLE menu_items ADD COLUMN media_id uuid;
ALTER TABLE services ADD COLUMN media_id uuid;
ALTER TABLE gallery ADD COLUMN media_id uuid;
ALTER TABLE hero_slides ADD COLUMN media_id uuid;

-- PHASE 2: Foreign key constraints
ALTER TABLE menu_items
ADD CONSTRAINT fk_menu_items_media_id
FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE SET NULL;

ALTER TABLE services
ADD CONSTRAINT fk_services_media_id
FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE SET NULL;

ALTER TABLE gallery
ADD CONSTRAINT fk_gallery_media_id
FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE SET NULL;

ALTER TABLE hero_slides
ADD CONSTRAINT fk_hero_slides_media_id
FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE SET NULL;

-- PHASE 3: Create indexes
CREATE INDEX idx_menu_items_media_id ON menu_items(media_id);
CREATE INDEX idx_services_media_id ON services(media_id);
CREATE INDEX idx_gallery_media_id ON gallery(media_id);
CREATE INDEX idx_hero_slides_media_id ON hero_slides(media_id);
```

### Step 4: Execute

1. Paste the SQL into the editor
2. Click **Run** button
3. Wait for completion (~5-10 seconds)
4. Check for success message

### Step 5: Verify

Run the diagnostic again:

```bash
npm run dev  # (if not already running)

# In another terminal:
node diagnose-500-errors.mjs
```

Expected output:
```
✅ menu_items.media_id column verified
✅ hero_slides.media_id column verified
✅ services.media_id column verified
✅ gallery.media_id column verified
```

### Step 6: Test APIs

Once verified, the APIs should return 200:

```bash
curl http://localhost:3000/api/admin/menu-items
curl http://localhost:3000/api/admin/hero-slides
```

---

## Regression Testing Checklist

After applying the migration, verify:

- [ ] `GET /api/admin/menu-items` returns 200
- [ ] `GET /api/admin/hero-slides` returns 200
- [ ] `GET /api/admin/menu-categories` still returns 200
- [ ] `GET /api/admin/website-pages` still returns 200
- [ ] `/dashboard/menu` loads without errors
- [ ] `/dashboard/website` loads without errors
- [ ] Menu items display correctly
- [ ] Hero slides display correctly
- [ ] No console errors in browser
- [ ] No new 500 errors in server logs

---

## Timeline

| Phase | Status | Timestamp |
|-------|--------|-----------|
| Diagnosis | ✅ Complete | 2026-08-18 14:17 UTC |
| Root cause identified | ✅ Complete | Migration drift detected |
| Migration located | ✅ Complete | 20260817_add_media_id_to_cms_tables.sql |
| Manual fix instructions | ✅ Complete | See above |
| **Awaiting**: Migration application | ⏳ **PENDING** | User action required |
| **Awaiting**: API verification | ⏳ **PENDING** | After migration applied |
| **Awaiting**: Full system retest | ⏳ **PENDING** | After verification |

---

## Summary

**Status**: 🔴 CRITICAL - Two admin endpoints are down

**Root Cause**: Migration drift - the migration file exists but wasn't applied to the live database

**Severity**: HIGH - Menu and CMS management are unavailable

**Fix Complexity**: LOW - Single SQL execution in Supabase Dashboard

**Time to Fix**: 5-10 minutes

**Blockers**: None - manual fix required via UI (RPC methods not available for DDL from client)

---

## Next Steps for User

1. ✅ **READ** this report
2. 🔲 **APPLY** the migration (see instructions above)
3. 🔲 **VERIFY** using `node diagnose-500-errors.mjs`
4. 🔲 **TEST** the dashboard menus and CMS features
5. 🔲 **CONFIRM** no 500 errors remain

Once complete, the menu and hero slides endpoints will be functional again.


