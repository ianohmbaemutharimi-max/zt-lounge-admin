# PHASE 1 — LIVE DATABASE SCHEMA ANALYSIS

**Date**: 2026-08-18  
**Status**: 🔴 CRITICAL FINDING  
**Analysis Date**: 2026-08-18T12:13:35Z

---

## EXECUTIVE SUMMARY

**THE MIGRATION HAS NOT BEEN APPLIED TO THE LIVE DATABASE.**

The `media_id` column is **MISSING** from all 4 CMS tables:
- ❌ menu_items.media_id — MISSING
- ❌ services.media_id — MISSING
- ❌ gallery.media_id — MISSING
- ❌ hero_slides.media_id — MISSING

This confirms the root cause of the 500 errors on these APIs.

---

## DETAILED SCHEMA INSPECTION

### 1. menu_items Table

**Current Columns** (15 total):
- id (uuid, PK)
- page_id (uuid, FK → website_pages)
- category_id (uuid, FK → menu_categories)
- name (text)
- description (text, nullable)
- price (numeric, nullable)
- image_url (text, nullable)
- display_order (int4)
- is_active (boolean)
- created_at (timestamptz)
- updated_at (timestamptz)
- slug (text, nullable)
- alt_text (text, nullable)
- category (text, nullable)
- type (text, nullable)
- is_featured (boolean, nullable)

**Missing**:
- ❌ `media_id` (UUID, should FK → media_assets.id, ON DELETE SET NULL)

**Data Count**: 13 rows exist

---

### 2. services Table

**Current Columns** (21 total):
- id (uuid, PK)
- category_id (uuid, FK)
- name (text)
- slug (text, unique)
- description (text, nullable)
- duration_minutes (int4)
- price (numeric)
- image_url (text, nullable)
- featured (boolean)
- is_active (boolean)
- created_at (timestamptz)
- updated_at (timestamptz)
- alt_text (text, nullable)
- tag (text, nullable)
- href (text, nullable)
- type (text, nullable)
- display_order (int4, nullable)
- page_id (uuid, nullable)
- icon (text, nullable)

**Missing**:
- ❌ `media_id` (UUID, should FK → media_assets.id, ON DELETE SET NULL)

**Data Count**: 6 rows exist

---

### 3. gallery Table

**Current Columns** (13 total):
- id (uuid, PK)
- title (text)
- description (text, nullable)
- image_url (text)
- category (text, nullable)
- alt_text (text, nullable)
- display_order (int4)
- is_featured (boolean)
- is_active (boolean)
- uploaded_by (uuid, FK → profiles)
- created_at (timestamptz)
- updated_at (timestamptz)
- type (text, nullable)
- page_id (uuid, nullable, FK → website_pages)

**Missing**:
- ❌ `media_id` (UUID, should FK → media_assets.id, ON DELETE SET NULL)

**Data Count**: 14 rows exist

---

### 4. hero_slides Table

**Current Columns** (15 total):
- id (uuid, PK)
- page_id (uuid, nullable, FK → website_pages)
- badge (text, nullable)
- title (text)
- highlight (text, nullable)
- subtitle (text, nullable)
- image_url (text, nullable)
- buttons (jsonb)
- display_order (int4, nullable)
- is_active (boolean, nullable)
- created_at (timestamptz, nullable)
- updated_at (timestamptz, nullable)
- alt_text (text, nullable)
- cta_text (text, nullable)
- cta_link (text, nullable)

**Missing**:
- ❌ `media_id` (UUID, should FK → media_assets.id, ON DELETE SET NULL)

**Data Count**: 8 rows exist

---

## VERIFICATION: media_assets TABLE EXISTS

**Status**: ✅ EXISTS and is properly configured

**Columns** (15 total):
- id (uuid, PK) ← Target for media_id FKs
- bucket (text)
- path (text)
- public_url (text, nullable)
- original_name (text, nullable)
- mime_type (text, nullable)
- file_size (bigint, nullable)
- width (int4, nullable)
- height (int4, nullable)
- alt_text (text, nullable)
- title (text, nullable)
- content_hash (text, nullable)
- uploaded_by (uuid, FK → profiles)
- created_at (timestamptz)
- updated_at (timestamptz)

**Data Count**: 37 rows exist

**Note**: media_usage table exists (35 rows) to track which media is used where

---

## DATA INTEGRITY CHECK

### Existing Data Will NOT Be Lost

All tables contain existing data that uses `image_url`:

| Table | Row Count | Uses image_url |
|-------|-----------|---|
| menu_items | 13 | ✅ Yes |
| services | 6 | ✅ Yes |
| gallery | 14 | ✅ Yes |
| hero_slides | 8 | ✅ Yes |
| media_assets | 37 | N/A (source) |

Adding `media_id` as a **nullable** column will not destroy existing data.

---

## MIGRATION APPLICATION STATUS

**Migration File**: `supabase/migrations/20260817_add_media_id_to_cms_tables.sql`

**Local Status**: ✅ EXISTS and verified correct

**Live Database Status**: ❌ NOT APPLIED

**Migration Content Verified**:
- ✅ Adds media_id UUID to menu_items
- ✅ Adds media_id UUID to services
- ✅ Adds media_id UUID to gallery
- ✅ Adds media_id UUID to hero_slides
- ✅ Foreign key constraints (ON DELETE SET NULL)
- ✅ Performance indexes
- ✅ Backward compatible (nullable, no defaults)

---

## ROOT CAUSE OF 500 ERRORS

When the application queries menu_items/services/gallery/hero_slides:

```javascript
// The code tries to select media_id
SELECT id, name, media_id, ... FROM menu_items;
```

The database returns:
```
ERROR: column "media_id" does not exist
```

This becomes a 500 Internal Server Error because:
1. The column doesn't exist in the live database
2. The application code expects it to exist
3. Supabase PostgreSQL doesn't silently ignore missing columns
4. The error is not caught, so it bubbles up as HTTP 500

---

## NEXT ACTION: APPLY MIGRATION

**Method**: Use Supabase MCP to apply the migration SQL

**SQL to Execute**: The complete content of `supabase/migrations/20260817_add_media_id_to_cms_tables.sql`

**Expected Result After Application**:

| Table | Column Added | Type | Nullable | FK Target |
|-------|---|---|---|---|
| menu_items | media_id | uuid | YES | media_assets.id |
| services | media_id | uuid | YES | media_assets.id |
| gallery | media_id | uuid | YES | media_assets.id |
| hero_slides | media_id | uuid | YES | media_assets.id |

**After Application, APIs Should Return**:
- GET /api/admin/menu-items → 200 (not 500)
- GET /api/admin/services → 200 (not 500)
- GET /api/admin/gallery → 200 (not 500)
- GET /api/admin/hero-slides → 200 (not 500)

---

## PHASE 1 ASSESSMENT

**Step 1 - Live Schema Inspection**: ✅ COMPLETE

**Finding**: Migration NOT applied

**Status**: Ready to proceed to Step 3 (Apply Migration)

---

**Generated**: 2026-08-18T12:13:35Z  
**Analysis Tool**: Supabase MCP list_tables (verbose mode)  
**Database**: jczwilrysvnhcjzjztbi  
