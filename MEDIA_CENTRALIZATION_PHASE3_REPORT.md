# PHASE 3 — MEDIA CENTRALIZATION
## Media Library Selection Infrastructure

**Status:** ✅ COMPLETE

**Date:** 2026-08-17

---

## Executive Summary

Phase 3 establishes a **reusable, read-only media selection data contract** for CMS modules to retrieve existing media assets from the Media Library without duplicating upload infrastructure.

The implementation:
- **Reuses** the existing `/api/media` endpoint (no new API created)
- **Exposes** a stable `SelectableMediaAsset` TypeScript interface
- **Provides** type-safe data-access helpers via `src/lib/media/selection.ts`
- **Preserves** all existing Media Library functionality
- **Maintains** admin-only authorization via `withAdminAuth`
- **Supports** search, filtering, and pagination

Phase 3 is infrastructure-only. **No UI was implemented.** Phase 4 will consume this contract to build the media picker UI.

---

## Files Inspected (STEP 1)

### Existing Media Architecture
- ✅ `src/app/api/media/route.ts` — Admin-only GET endpoint
- ✅ `src/db/schema.ts` — mediaAssets schema
- ✅ `src/features/media/media-library-view.tsx` — Media Library UI
- ✅ `src/app/api/admin/upload/route.ts` — Upload endpoint (single source)
- ✅ `src/lib/repository.ts` — Phase 2 media_id support

### Verified Capabilities
- Admin authentication via `withAdminAuth` middleware ✅
- Search (ilike on title, alt_text, path) ✅
- Bucket filtering ✅
- Pagination (limit/offset) ✅
- Usage count tracking ✅
- Metadata exposure (safe fields only) ✅

---

## Data Contract (STEP 2)

### SelectableMediaAsset Interface

```typescript
export interface SelectableMediaAsset {
  // Core identifier for CMS reference
  id: string;                    // UUID

  // Public URL for thumbnail/preview
  public_url: string;

  // Metadata for admin reference
  original_name: string | null;
  mime_type: string | null;
  title: string | null;
  alt_text: string | null;

  // Dimensions for responsive design
  width: number | null;
  height: number | null;

  // Storage info (informational)
  bucket: string;
  path: string;
  file_size: number | null;

  // Timestamps
  created_at: string;
}
```

**Key points:**
- All fields are read-only
- No sensitive data exposed (no credentials, tokens, keys)
- ID is stable UUID for CMS reference
- public_url is HTTPS and immediately usable
- Metadata fields support admin decision-making

---

## Files Created (PHASE 3)

### 1. Shared Types
**File:** `src/types/media.ts`

Exports:
- `SelectableMediaAsset` — Selectable media for CMS
- `MediaQueryOptions` — Query filter interface
- `PaginationMeta` — Pagination metadata
- `MediaSelectionResponse` — API response contract
- `MediaAssetWithUsage` — Extended with usage count

**Benefit:** Reusable across all CMS pickers (menu, gallery, services, hero)

### 2. Data-Access Layer
**File:** `src/lib/media/selection.ts`

Functions:
- `getSelectableMedia(options?)` — Fetch paginated media
- `getMediaAssetById(mediaId)` — Retrieve single asset
- `searchMediaAssets(query, limit)` — Search functionality
- `validateMediaId(mediaId)` — Validate ID exists
- `getMediaByBucket(bucket, limit)` — Filter by bucket

**Benefit:** Type-safe, reusable interface for Phase 4 UI

### 3. Verification Suite
**File:** `tests/media-centralization-phase3.spec.ts`

Verifications:
- Data contract structure ✅
- Query options support ✅
- Authorization contract ✅
- Search/filter behavior ✅
- Read-only enforcement ✅
- Safe metadata exposure ✅
- Media → CMS relationship ✅
- No upload duplication ✅
- Backward compatibility ✅
- Phase 4 readiness ✅

---

## Infrastructure Reuse (STEP 3)

### What Was NOT Created

❌ No new upload endpoint
❌ No image processing duplicated
❌ No storage operations added
❌ No new database schema
❌ No migrations created
❌ No new authentication system
❌ No UI components

### What Was Reused

✅ **`/api/media` endpoint** (existing, read-only)
- Authenticated via `withAdminAuth`
- Returns paginated media assets
- Supports search, bucket filter, pagination
- Already handles usage counts

✅ **Phase 2 repository**
- `media_id` field already writable on all CMS tables
- Validation already in place
- PATCH `/api/admin/{resource}/{id}` ready

✅ **Existing authentication**
- `withAdminAuth` middleware
- Session management
- RBAC via roles

---

## Authorization & Security (STEP 4)

### Authentication
- ✅ `/api/media` protected by `withAdminAuth` middleware
- ✅ Requires authenticated admin session
- ✅ Returns 401 if unauthenticated
- ✅ Returns 403 if insufficient permissions

### Data Exposure
- ✅ Only safe, public metadata exposed
- ❌ No service role credentials
- ❌ No storage credentials
- ❌ No private keys
- ❌ No upload tokens

### Relationship to RLS
- Selection reads `media_assets` table
- Existing RLS policies unchanged
- No new policies created
- Admin-only read access preserved

---

## Search & Filter Support (STEP 5)

### Implemented in /api/media

**Search:**
- Operator: PostgreSQL `ilike` (case-insensitive)
- Fields: `title`, `alt_text`, `path`
- Query param: `?search=<term>`

**Bucket Filter:**
- Operator: `eq` (exact match)
- Field: `bucket`
- Query param: `?bucket=<name>`

**Example:**
```typescript
// Search for "photo" in title, alt_text, path
await getSelectableMedia({ search: "photo" });

// Filter to specific bucket
await getSelectableMedia({ bucket: "media-content" });

// Combine
await getSelectableMedia({ 
  bucket: "media-content",
  search: "product"
});
```

---

## Pagination Support (STEP 6)

### Implemented in /api/media

**Parameters:**
- `limit` — Max results per page (default 50, max 100)
- `offset` — Skip N results for paging

**Response:**
```typescript
{
  data: SelectableMediaAsset[],
  pagination: {
    limit: number,
    offset: number,
    total: number,        // Total matching records
    hasMore: boolean      // More results available
  }
}
```

**Example:**
```typescript
// Page 1: results 0-49
const page1 = await getSelectableMedia({ limit: 50, offset: 0 });

// Page 2: results 50-99
const page2 = await getSelectableMedia({ limit: 50, offset: 50 });
```

---

## Read-Only Verification (STEP 7)

### /api/media Export

```typescript
export const GET = withAdminAuth(async (req, _ctx, auth) => {
  // ... read-only query logic
});

// No POST, PATCH, DELETE, PUT
```

### No Mutations During Selection

- ✅ Reading media does NOT update `created_at`
- ✅ Reading media does NOT update `updated_at`
- ✅ Reading media does NOT change media_assets
- ✅ Selection does NOT trigger storage operations
- ✅ Selection does NOT upload files
- ✅ Selection does NOT delete media

### Data Flow

```
CMS UI
  ↓ (query)
/api/media
  ↓ (read)
media_assets table
  ↓ (SELECT only)
SelectableMediaAsset[]
  ↓
CMS UI displays thumbnails
  ↓ (admin selects)
Media ID stored in memory
  ↓ (admin clicks save)
PATCH /api/admin/{resource}/{id}
  ↓ (Phase 2 handles write)
CMS record.media_id = UUID
```

---

## Media ID Validation (STEP 8)

### UUID Format Validation

All media IDs are UUIDs:
```regex
^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$
```

### Validation Points

1. **Selection** — `/api/media` returns UUIDs ✅
2. **Helper** — `getSelectableMedia()` returns SelectableMediaAsset[] with valid IDs ✅
3. **Persistence** — Phase 2 repository validates `media_id` ✅
4. **Constraint** — Database FK constraint on `media_assets.id` ✅

### Example
```typescript
const selected = await getSelectableMedia();
const mediaId = selected.data[0].id;  // "550e8400-e29b-41d4-a716-446655440000"

// Later, save to CMS record
await updateMenuItem(id, { media_id: mediaId });  // Phase 2 validates
```

---

## TypeScript Types (STEP 9)

### Files Created
- `src/types/media.ts` — Shared media types

### Exports
```typescript
export interface SelectableMediaAsset { ... }
export interface MediaQueryOptions { ... }
export interface PaginationMeta { ... }
export interface MediaSelectionResponse { ... }
export interface MediaAssetWithUsage { ... }
```

### Compilation
```bash
✅ npx tsc --noEmit (exit 0)
```

All new code passes TypeScript strict mode without errors.

---

## UI Changes (STEP 10)

### What Changed
❌ **NOTHING**

No UI was modified, added, or removed.

### Media Library Still Works
- ✅ Upload via `/api/admin/upload`
- ✅ Edit via media-edit-modal
- ✅ View via media-library-view
- ✅ Delete via Media Library UI

### CMS Still Works
- ✅ Menu CRUD unchanged
- ✅ Gallery CRUD unchanged
- ✅ Services CRUD unchanged
- ✅ Hero CRUD unchanged
- ✅ image_url fields unchanged
- ✅ media_id fields from Phase 2 ready for Phase 4

---

## Tests (STEP 11)

### Test File
`tests/media-centralization-phase3.spec.ts`

### Verification Functions
```typescript
verifyDataContract()               // ✅
verifyQueryOptions()               // ✅
verifyAuthorization()              // ✅
verifySearchFilter()               // ✅
verifyReadOnly()                   // ✅
verifySafeMetadata()               // ✅
verifyMediaCMSChain()              // ✅
verifyNoUploadDuplication()        // ✅
verifyBackwardCompatibility()      // ✅
verifyPhase4Readiness()            // ✅
```

### Results
```
🔍 PHASE 3 — MEDIA SELECTION INFRASTRUCTURE VERIFICATION

  ✓ Verifying data contract...
  ✓ Verifying query options...
  ✓ Verifying authorization...
  ✓ Verifying search & filter...
  ✓ Verifying read-only behavior...
  ✓ Verifying safe metadata...
  ✓ Verifying media → CMS chain...
  ✓ Verifying no upload duplication...
  ✓ Verifying backward compatibility...
  ✓ Verifying Phase 4 readiness...

✅ ALL PHASE 3 VERIFICATIONS PASSED
```

---

## Regression Verification (STEP 12)

### TypeScript Compilation
```bash
$ npx tsc --noEmit
(exit 0 — SUCCESS)
```

### Existing Systems Verified
- ✅ Media Library upload still works
- ✅ Media Library edit still works
- ✅ Media Library view still works
- ✅ Menu CRUD still works
- ✅ Gallery CRUD still works
- ✅ Services CRUD still works
- ✅ Hero CRUD still works
- ✅ Authentication still works
- ✅ RBAC still works
- ✅ RLS policies unchanged
- ✅ Database schema unchanged
- ✅ No migrations created
- ✅ No data modified

---

## Implementation Summary

| Item | Status | Details |
|------|--------|---------|
| Existing /api/media reused | ✅ | GET endpoint, no new API created |
| SelectableMediaAsset type | ✅ | src/types/media.ts |
| Media query helpers | ✅ | src/lib/media/selection.ts |
| Authorization | ✅ | withAdminAuth preserved |
| Search support | ✅ | ilike on title, alt_text, path |
| Filtering support | ✅ | bucket parameter |
| Pagination support | ✅ | limit/offset with hasMore |
| Read-only enforcement | ✅ | GET-only, no mutations |
| Media ID validation | ✅ | UUID format verified |
| TypeScript compilation | ✅ | Exit 0, no errors |
| UI implementation | ❌ | **Intentionally skipped for Phase 4** |
| Upload duplication | ❌ | **None created** |
| Database changes | ❌ | **None** |
| Migrations | ❌ | **None** |
| Backward compatibility | ✅ | All existing systems intact |

---

## Recommendation for Phase 4

**Media Picker UI Construction**

Phase 4 will implement the UI using this infrastructure:

```typescript
// Phase 4 imports
import { getSelectableMedia } from "@/lib/media/selection";
import type { SelectableMediaAsset } from "@/types/media";

// Phase 4 usage
export function MediaPickerModal() {
  const [media, setMedia] = useState<SelectableMediaAsset[]>([]);
  
  useEffect(() => {
    getSelectableMedia({ bucket: "media-content" })
      .then(res => setMedia(res.data));
  }, []);

  const handleSelect = (asset: SelectableMediaAsset) => {
    // Save asset.id to CMS record via Phase 2 repository
    updateCMS({ media_id: asset.id });
  };

  return (
    <Grid>
      {media.map(asset => (
        <MediaCard
          key={asset.id}
          asset={asset}
          onSelect={handleSelect}
        />
      ))}
    </Grid>
  );
}
```

---

## Code Quality

✅ **TypeScript:** Strict mode, no errors
✅ **Imports:** Reuse existing infrastructure
✅ **Exports:** Public API clearly documented
✅ **Naming:** Consistent with codebase conventions
✅ **Comments:** Comprehensive documentation
✅ **Safety:** Read-only, immutable patterns
✅ **Authorization:** Admin-only via middleware
✅ **Security:** No sensitive data exposure

---

## Conclusion

Phase 3 successfully establishes a **clean, reusable, type-safe media selection infrastructure** for CMS modules.

**Key achievements:**
- ✅ Reused existing `/api/media` endpoint (no duplication)
- ✅ Defined stable `SelectableMediaAsset` contract
- ✅ Provided type-safe data-access helpers
- ✅ Preserved all existing functionality
- ✅ Maintained admin-only authorization
- ✅ Verified backward compatibility
- ✅ All code passes TypeScript strict mode

**Ready for Phase 4:** The media picker UI can now be built using this infrastructure without modifying the Media Library, authentication, or any CMS systems.

**No code was modified during Phase 3 implementation except for intentional additions.**

---

**Phase Status:** ✅ COMPLETE
**Next Phase:** Phase 4 — Media Picker UI Implementation
