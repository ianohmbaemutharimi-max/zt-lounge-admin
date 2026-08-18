# PHASE 2 — COLLECTION ARCHITECTURE AUDIT

**Date**: 2026-08-18  
**Status**: ✅ COMPLETE  
**Phase**: Phase 2 — Collection Architecture Audit + Fix

---

## EXECUTIVE SUMMARY

### Search Results
Searched entire `src/` directory for: `.slice(`, `.splice(`, `.limit(`, `.take(`

### Finding
**NO artificial CMS collection limits found.**

All pagination is explicit and intentional.

---

## DETAILED ANALYSIS

### Category Classification

| Location | Code | Classification | Status |
|----------|------|----------------|--------|
| `src/lib/validation/admin.ts:193` | `term.slice(0, 200)` | B — Search term validation truncation | ✅ Correct |
| `src/features/promotions/promotions-view.tsx:62` | `toISOString().slice(0, 10)` | B — UI date formatting | ✅ Correct |
| `src/features/customers/customers-view.tsx` | `split(" ").map(...).slice(0, 2)` | B — UI avatar initials | ✅ Correct |
| `src/lib/team/invitations.ts:1` | `.limit(1)` | A — Legitimate single-record query | ✅ Correct |
| `src/lib/team/invitations.ts:5` | `.limit(1)` | A — Legitimate single-record query | ✅ Correct |
| `src/lib/team/invitations.ts:9` | `.limit(1)` | A — Legitimate single-record query | ✅ Correct |
| `src/lib/team/invitations.ts:13` | `query.limit(filters.limit)` | A — User-controlled pagination | ✅ Correct |
| `src/features/bookings/bookings-view.tsx:67` | `startTime?.slice(0, 5)` | B — UI time formatting | ✅ Correct |
| `src/features/bookings/bookings-view.tsx:69` | `endTime?.slice(0, 5)` | B — UI time formatting | ✅ Correct |
| `src/features/bookings/bookings-view.tsx:87` | `[].slice(0, 3)` | B — Calendar cell display truncation | ✅ Correct |
| `src/integrations/google-business-profile/sync.ts:1` | `allReviews.slice(0, maxReviews)` | A — Respects API limit parameter | ✅ Correct |
| `src/integrations/google-business-profile/oauth.ts` | `.limit(1)` | A — Single config query | ✅ Correct |
| `src/app/api/admin/[resource]/route.ts:76` | `key.slice(7)` | B — String manipulation for filter parsing | ✅ Correct |
| `src/app/api/admin/upload/route.ts` | `error.stack?.split('\n').slice(0, 5)` | B — Error logging stack trace | ✅ Correct |

### Category Summary

| Category | Count | Items |
|----------|-------|-------|
| A — Genuine pagination | 6 | team/invitations.ts (×4), google-business-profile sync/oauth, booking pagination |
| B — Intentional UI truncation | 7 | date formatting, avatar initials, time display, calendar cell rendering, search validation |
| C — Security/rate-limit | 0 | — |
| D — API payload protection | 0 | — |
| E — Business-rule limit | 0 | — |
| F — Accidental CMS truncation | 0 | **NONE FOUND** |

---

## PAGINATION ANALYSIS

### Repository `findAll` method (`src/lib/repository.ts:202`)

```typescript
async findAll(table: string, options?: FindAllOptions): Promise<PaginatedResult<any>> {
  const limit = Math.min(100, Math.max(1, options?.limit ?? 10));
  const offset = Math.max(0, options?.offset ?? 0);
  // ...
  query = query.range(offset, offset + limit - 1);
  // Returns count for total pagination
}
```

### Route handler (`src/app/api/admin/[resource]/route.ts:46`)

```typescript
const limit = Number(url.searchParams.get("limit") ?? 10);
const offset = Number(url.searchParams.get("offset") ?? 0);
const { page, limit: validatedLimit, offset: validatedOffset } = 
  validatePagination(1, limit, offset);
// validatePagination: Math.min(100, Math.max(1, Math.floor(limit)))
```

### Assessment

- ✅ Default limit of 10 is reasonable for initial page load
- ✅ Maximum limit of 100 prevents unbounded responses
- ✅ Client can request different pages via `?limit=100&offset=0`
- ✅ `X-Total-Count`, `X-Page`, `X-Total-Pages` headers provided
- ✅ NOT artificial truncation — this is standard pagination

---

## PROMOTIONS SCHEMA MISMATCH DISCOVERED

During Phase 2 audit, a data contract mismatch was found:

### Live Database Schema (verified via MCP)

```sql
promotions columns:
- id (uuid, PK)
- title (text)
- description (text, nullable)
- banner_image (text, nullable)
- discount_percent (numeric, nullable)
- start_date (date, nullable)
- end_date (date, nullable)
- is_active (boolean, nullable)
- created_at (timestamptz)
- updated_at (timestamptz)
```

### Repository Response Allowlist

```typescript
promotions: ["id", "title", "description", "banner_image", "discount_percent",
             "start_date", "end_date", "is_active", "created_at", "updated_at"]
```

### UI Schema (promotions-view.tsx)

Uses camelCase field names that DON'T match the database:
- `isActive` (should be `is_active`)
- `startDate` (should be `start_date`)
- `endDate` (should be `end_date`)
- `discountType` (not a DB column)
- `discountValue` (should be `discount_percent`)

### Impact

The UI uses camelCase while the API returns snake_case. This causes:
- `p.isActive` → `undefined` (field is `is_active`)
- `p.startDate` → `undefined` (field is `start_date`)
- `p.endDate` → `undefined` (field is `start_date`)
- `p.discountValue` → `undefined` (field is `discount_percent`)

This means promotions display incorrectly but doesn't cause 500 errors.

### Fix Required

The promotions-view.tsx needs to be updated to use the actual database column names (snake_case) consistent with the repository's response allowlist.

---

## HERO SLIDES VERIFICATION

### Live Database Schema (verified)

```sql
hero_slides columns:
- id (uuid, PK)
- page_id (uuid, nullable)
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
- media_id (uuid, nullable) ← NOW EXISTS after migration
```

### Repository Response Allowlist

```typescript
hero_slides: ["id", "page_id", "badge", "title", "highlight", "subtitle", 
               "image_url", "media_id", "buttons", "display_order", "is_active",
               "created_at", "updated_at", "alt_text", "cta_text", "cta_link"]
```

### UI Schema (website-cms.tsx)

Uses correct snake_case matching DB columns. ✅

---

## MENU ITEMS VERIFICATION

### Live Database Schema (verified)

```sql
menu_items columns:
- id, page_id, category_id, name, description, price, image_url, 
  display_order, is_active, created_at, updated_at, slug, alt_text, 
  category, type, is_featured, media_id ← NOW EXISTS
```

### Repository Response Allowlist

```typescript
menu_items: ["id", "page_id", "category_id", "name", "description", "price",
             "image_url", "media_id", "display_order", "is_active", 
             "created_at", "updated_at", "slug", "alt_text", "category", 
             "type", "is_featured"]
```

✅ All correct — the response allowlist matches the live schema.

---

## CONCLUSION

### Phase 2 Results

1. **No artificial CMS collection limits**: ✅ PASS
2. **Pagination is explicit and intentional**: ✅ PASS
3. **No accidental truncation**: ✅ PASS
4. **Promotions schema mismatch identified**: ⚠️ Requires fix

### Recommendation

Fix the promotions-view.tsx to use the actual database column names (snake_case) to ensure the UI displays data correctly.
