# ZT LOUNGE MEDIA ARCHITECTURE PROPOSAL

**Date:** 2026-08-13  
**Type:** READ-ONLY PRE-IMPLEMENTATION ARCHITECTURE AUDIT  
**Status:** PROPOSAL FOR REVIEW

---

## 1. EXECUTIVE SUMMARY

### Current State
- **Database:** All images stored as full Supabase Storage URLs in text fields
- **Admin UX:** Manual URL paste workflow (copy from Storage, paste into form)
- **Storage:** 36 images across 7 buckets, properly organized
- **Public Website:** Reads image URLs directly from database
- **Architecture Status:** ✅ Functional but UX needs improvement

### Business Requirement
Enable admin to upload/replace images from desktop/mobile without copying URLs.

### Recommended Solution
**OPTION D: Hybrid Architecture** - Simplest path that satisfies requirements.

### Implementation Effort
- Phase 1 (Core Upload): 8-12 hours
- Phase 2 (Media Library): 16-24 hours (optional)
- Total: 1-2 weeks with testing

---

## 2. CURRENT ARCHITECTURE (VERIFIED)

### 2.1 Database Schema

**Image-Bearing Tables:**

| Table | Image Column | Type | Nullable | Current Content |
|-------|--------------|------|----------|-----------------|
| `menu_items` | `image_url` | text | ✓ default('') | 13 Supabase URLs |
| `services` | `image_url` | text | ✓ | 6 Supabase URLs |
| `gallery` | `image_url` | text | ✗ | 14 Supabase URLs |
| `hero_slides` | `image_url` | text | ✓ default('') | 2 Supabase URLs |
| `testimonials` | `image_url` | text | ✓ | 0 records |
| `business_settings` | `logo_url` | text | ✓ | 1 Supabase URL |
| `business_settings` | `favicon_url` | text | ✓ | 1 local path |
| `promotions` | `banner_image` | text | ✓ | 1 record |
| `staff` | `photo_url` | text | ✓ | Staff photos |
| `profiles` | `avatar_url` | text | ✓ | User avatars |

**Key Findings:**
- ✅ ALL fields store complete public URLs (not paths)
- ✅ 100% Supabase Storage URLs (except favicon)
- ✅ No mixed formats (migration completed Aug 11, 2026)
- ✅ Fields are nullable/default empty (flexible)
- ❌ No FK relationships (URLs are strings, not asset IDs)
- ❌ No metadata (dimensions, file size, MIME type)

### 2.2 Supabase Storage

**Buckets (All Public):**

| Bucket | Files | Purpose | Example Path |
|--------|-------|---------|--------------|
| `menu-images` | 13 | Menu item photos | `beef-burger-deluxe.webp` |
| `service-images` | 6 | Service photos | `vip-cabin-interior.webp` |
| `gallery-images` | 14 | Gallery photos | `lounge-ambiance-01.webp` |
| `hero-images` | 2 | Hero slides | `hero-dining-01.webp` |
| `testimonial-photos` | 0 | Testimonial images | (empty) |
| `logos` | 1 | Logo files | `logo.webp` |
| `public-assets` | 1 | Misc assets | `placeholder.webp` |

**URL Format:**
```
https://jczwilrysvnhcjzjztbi.supabase.co/storage/v1/object/public/{bucket}/{filename}
```

**Security:** All buckets public (correct for website images)

### 2.3 Admin Dashboard

**Current Upload UX:**

```
1. Admin opens form (Menu, Services, Gallery, etc.)
2. Admin sees text input labeled "Image URL"
3. Admin must:
   a) Upload file to Supabase Storage dashboard separately
   b) Copy public URL
   c) Paste into admin form
   d) Save
```

**Components Using Manual URL Entry:**
- `catalog-manager.tsx` (Menu & Services)
- `gallery-view.tsx` (Gallery)
- `website-cms.tsx` (Hero Slides)
- Business Settings forms

**Validation:** URL format validation via Zod schemas

**NO file upload component exists.**

### 2.4 Public Website

**Image Rendering:**

All repositories read `image_url` from Supabase:
- `MenuRepository.js` → `menu_items.image_url`
- `ServicesRepository.js` → `services.image_url`
- `GalleryRepository.js` → `gallery.image_url`
- `HeroRepository.js` → `hero_slides.image_url`

**Fallback Strategy:**
- Static `services.config.js` contains hardcoded Supabase URLs as fallback
- Used only if database query fails
- Fallback URLs point to same Storage buckets

**NO local image files in public website** (verified)

---

## 3. DATA FLOW ANALYSIS

### 3.1 Current Image Lifecycle

**UPLOAD (Manual):**
```
Admin
  → Supabase Dashboard (manual upload)
  → Copy URL
  → Admin form (paste URL)
  → API POST /api/admin/{resource}
  → repository.create()
  → Supabase PostgreSQL
```

**DISPLAY (Automatic):**
```
Public Website
  → BaseRepository.query()
  → Supabase PostgreSQL
  → Returns {image_url: "https://..."}
  → <img src={image_url} />
  → Browser fetches from Supabase CDN
```

**REPLACE (Manual):**
```
Admin uploads new file → gets new URL → pastes into form → saves
Old URL remains in Storage (orphaned, no cleanup)
```

**DELETE (Partial):**
```
Admin deletes record → database record removed → image disappears from site
Storage object remains (orphan)
```

### 3.2 Problems Identified

| Problem | Impact | Severity |
|---------|--------|----------|
| Manual URL paste | Poor UX, error-prone | HIGH |
| No upload widget | Admin must know Storage dashboard | HIGH |
| Orphaned files | Storage bloat over time | MEDIUM |
| No metadata | Can't show dimensions/file size | LOW |
| No media library | Can't reuse existing images | LOW |
| Mixed workflows | Different UX per content type | MEDIUM |

---

## 4. ARCHITECTURE OPTIONS

### OPTION A: Keep Current (URL Strings)

**Minimal Change: Add upload endpoint only**

```typescript
// New: /api/admin/upload
POST /api/admin/upload
  → receives File
  → uploads to appropriate bucket
  → returns {url: "https://..."}
  → admin form auto-populates field
```

**Pros:**
- ✅ Minimal code changes
- ✅ No database schema changes
- ✅ No migration required
- ✅ Backward compatible
- ✅ Fastest implementation (8-12 hours)

**Cons:**
- ❌ Still stores raw URLs
- ❌ No metadata tracking
- ❌ No orphan cleanup
- ❌ No media reuse

**Verdict:** **Simplest solution that meets requirements**

### OPTION B: Storage Paths Only

**Store paths instead of full URLs**

```typescript
// Database stores:
image_url: "menu-images/beef-burger.webp"

// Application generates URL:
const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${path}`
```

**Pros:**
- ✅ Portable (can change Storage URL)
- ✅ Smaller database footprint

**Cons:**
- ❌ Requires migration of 36 existing records
- ❌ Requires app changes to generate URLs
- ❌ Public website must be updated
- ❌ Still no metadata
- ❌ Still no orphan cleanup

**Verdict:** **More work for minimal benefit**

### OPTION C: Normalized Media Assets Table

**Create centralized media_assets table**

```sql
CREATE TABLE media_assets (
  id uuid PRIMARY KEY,
  bucket text NOT NULL,
  object_path text NOT NULL,
  filename text,
  mime_type text,
  file_size integer,
  width integer,
  height integer,
  alt_text text,
  uploaded_by uuid,
  created_at timestamp,
  UNIQUE(bucket, object_path)
);

-- Change content tables:
ALTER TABLE menu_items 
  DROP COLUMN image_url,
  ADD COLUMN image_id uuid REFERENCES media_assets(id);
```

**Pros:**
- ✅ Proper normalization
- ✅ Rich metadata
- ✅ Reference counting (can detect orphans)
- ✅ Reusable assets
- ✅ Can implement CASCADE deletion

**Cons:**
- ❌ Complex migration (36+ records × 9 tables)
- ❌ Breaking change
- ❌ Public website must join tables
- ❌ Requires 40+ hours implementation
- ❌ High risk for existing system

**Verdict:** **Over-engineered for current needs**

### OPTION D: Hybrid (RECOMMENDED)

**Phase 1: Add upload + keep URLs**
**Phase 2: Optionally add media_assets for tracking**

```typescript
// Phase 1: Immediate UX fix
POST /api/admin/upload → returns URL → form uses URL

// Phase 2 (optional): Track uploads
CREATE TABLE file_uploads (
  id uuid PRIMARY KEY,
  bucket text,
  path text,
  original_name text,
  mime_type text,
  file_size integer,
  uploaded_by uuid,
  created_at timestamp
);

// Content tables still use image_url (backward compatible)
// No FK constraints (flexible)
// Orphan detection via LEFT JOIN
```

**Pros:**
- ✅ Immediate UX improvement
- ✅ Zero breaking changes
- ✅ Optional metadata tracking
- ✅ Can implement incrementally
- ✅ Backward compatible
- ✅ Low risk

**Cons:**
- ❌ Not "pure" normalized design
- ❌ URLs still in content tables

**Verdict:** **RECOMMENDED - Pragmatic balance**

---

## 5. RECOMMENDED ARCHITECTURE (OPTION D)

### 5.1 Database Schema (Proposed)

**NO changes to existing tables.**

**New table (optional, Phase 2):**

```sql
-- Schema already exists as file_uploads (line 325-337 in schema.ts)
-- Just needs to be actively used
```

### 5.2 Upload Workflow (Proposed)

**Phase 1: Basic Upload**

```
1. Admin clicks form field
2. Click triggers file picker (mobile/desktop compatible)
3. File selected
4. Upload component:
   - Shows loading state
   - Validates file (type, size)
   - POSTs to /api/admin/upload
5. API:
   - Receives file
   - Determines bucket from context
   - Generates unique filename
   - Uploads to Supabase Storage
   - Returns {url, success}
6. Form field auto-populated with URL
7. Admin can preview
8. Admin saves form
9. Database stores complete URL (no change to current model)
```

**Phase 2: Track Uploads (Optional)**

```
- API also creates file_uploads record
- Stores metadata (size, mime, dimensions)
- Links to uploaded_by user
- Enables orphan detection later
```

### 5.3 Replace Workflow

```
1. Admin clicks "Change Image"
2. Upload new file
3. New URL replaces old URL in form
4. Admin saves
5. Old URL becomes orphan (acceptable - cleanup can be batched)
```

### 5.4 Delete Workflow

```
Current: Delete record → orphan created
Proposed: Same (orphan cleanup is separate concern)

Optional Enhancement:
- Periodic orphan detection job
- Lists Storage objects
- Checks if any database record references URL
- Flags unreferenced objects for review
- Admin manually confirms deletion
```

---

## 6. IMPLEMENTATION PLAN

### Phase 1: Core Upload Component (8-12 hours)

**Step 1.1: Create Upload API** (3 hours)
```typescript
// src/app/api/admin/upload/route.ts
POST /api/admin/upload
  - Accept multipart/form-data
  - Validate file type (image/*)
  - Validate size (<10MB)
  - Determine bucket from ?bucket= param
  - Generate unique filename (uuid + ext)
  - Upload via supabaseAdmin.storage.from(bucket).upload()
  - Return {url, filename}
```

**Step 1.2: Create Upload Component** (4 hours)
```typescript
// src/components/media-upload.tsx
<MediaUpload
  value={currentUrl}
  onChange={(url) => form.setValue("imageUrl", url)}
  bucket="menu-images"
  accept="image/*"
/>

Features:
- File input (hidden)
- Preview current image
- Upload button
- Loading state
- Error handling
- Progress indicator
- Mobile-friendly
```

**Step 1.3: Integrate into Forms** (2 hours)
- Replace Input with MediaUpload in:
  - catalog-manager.tsx
  - gallery-view.tsx
  - website-cms.tsx
  - settings forms

**Step 1.4: Testing** (3 hours)
- Desktop Chrome upload
- iPhone Safari upload
- Android Chrome upload
- File validation
- Preview display
- Form submission

### Phase 2: Media Library (16-24 hours) - OPTIONAL

**Step 2.1: Track Uploads** (4 hours)
- Update upload API to insert file_uploads record
- Store metadata

**Step 2.2: Media Library UI** (8 hours)
- Grid view of all uploaded images
- Thumbnail previews
- Search/filter
- Click to select
- Shows filename, size, date
- Modal/drawer component

**Step 2.3: Integration** (4 hours)
- Add "Choose Existing" button to MediaUpload
- Opens media library
- Selected image populates field

**Step 2.4: Orphan Detection** (8 hours)
- Background job or manual tool
- Query all image URLs from all tables
- List Storage objects
- Compare and report orphans
- Admin review interface

---

## 7. SECURITY MODEL

### 7.1 Current Security (Verified)

- ✅ All admin APIs protected by `requireAdmin()`
- ✅ Service role key server-side only
- ✅ RLS policies on database
- ✅ Storage buckets public (correct for images)

### 7.2 Upload Security (Proposed)

**Authorization:**
```typescript
export async function POST(req: Request) {
  const user = await requireAdmin(); // Existing middleware
  if (!user) return new Response("Unauthorized", {status: 401});
  
  // ... upload logic
}
```

**File Validation:**
```typescript
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

if (!ALLOWED_TYPES.includes(file.type)) {
  return {error: "Invalid file type"};
}
if (file.size > MAX_SIZE) {
  return {error: "File too large"};
}
```

**Filename Sanitization:**
```typescript
import { randomUUID } from 'crypto';
const ext = file.name.split('.').pop();
const filename = `${randomUUID()}.${ext}`;
```

**Path Traversal Protection:**
```typescript
const ALLOWED_BUCKETS = [
  'menu-images',
  'service-images',
  'gallery-images',
  'hero-images',
  'testimonial-photos',
  'logos'
];

if (!ALLOWED_BUCKETS.includes(bucket)) {
  return {error: "Invalid bucket"};
}
```

### 7.3 Storage Policies

**Current:** All buckets public (correct)  
**No changes needed.**

---

## 8. MOBILE COMPATIBILITY

### 8.1 File Picker

**HTML5 Input (Recommended):**
```tsx
<input
  type="file"
  accept="image/*"
  capture="environment"  // Opens camera on mobile
  onChange={handleUpload}
/>
```

**Compatibility:**
- ✅ iOS Safari (14+)
- ✅ Android Chrome
- ✅ Desktop browsers
- ✅ Progressive Web App compatible

### 8.2 Upload Performance

**Recommendations:**
- Show upload progress
- Client-side image compression (optional)
- Resize large images before upload
- Use WebP format when possible

---

## 9. CONSISTENCY STRATEGY

### 9.1 Database ↔ Storage

**Current Issue:** Orphaned files  
**Proposed Solution:** Acceptable orphans + periodic cleanup

**Rationale:**
- Deleting Storage files synchronously is risky (errors, race conditions)
- Disk space is cheap
- Manual review prevents accidental deletion

**Cleanup Process:**
```javascript
// Periodic script (manual or cron)
1. List all URLs in database
2. List all Storage objects
3. Find objects not referenced
4. Generate report
5. Admin reviews and confirms deletion
```

### 9.2 URL Format

**Keep current format:** Full public URLs  
**Why:** Already works, public website expects it, no migration needed

---

## 10. TESTING STRATEGY

### 10.1 Unit Tests
- Upload API file validation
- Filename sanitization
- Bucket validation
- Error handling

### 10.2 Integration Tests
- Upload → returns URL
- Form submission with uploaded image
- Image displayed in admin dashboard
- Image displayed on public website

### 10.3 E2E Tests
- Desktop upload workflow
- Mobile upload workflow
- Replace image workflow
- Validate file restrictions

### 10.4 Manual Testing
- iPhone Safari upload
- Android Chrome upload
- Large file handling
- Network error handling
- Preview functionality

---

## 11. MIGRATION STRATEGY

### 11.1 Current State
✅ **No migration needed** - existing data is already correct

### 11.2 Rollout
1. Deploy upload API
2. Deploy MediaUpload component
3. Admins can use new upload OR paste URLs
4. Both workflows coexist
5. Eventually remove URL input (optional)

---

## 12. ROLLBACK STRATEGY

**If upload feature fails:**
1. Remove MediaUpload component
2. Restore plain Input fields
3. Admin can still paste URLs
4. Zero data loss
5. Existing images unaffected

**Risk:** **VERY LOW** - additive change only

---

## 13. ACCEPTANCE CRITERIA

### Phase 1 (Core Upload)
- [ ] Admin can click field to upload image
- [ ] Works on desktop Chrome
- [ ] Works on iPhone Safari
- [ ] Works on Android Chrome
- [ ] File validation enforced
- [ ] Preview shows selected image
- [ ] Upload progress visible
- [ ] Error messages clear
- [ ] Form saves correctly
- [ ] Image displays on public website
- [ ] No breaking changes to existing data
- [ ] Existing URL paste still works

### Phase 2 (Media Library) - Optional
- [ ] Media library shows all uploaded images
- [ ] Can select existing image
- [ ] Search/filter works
- [ ] Shows image metadata
- [ ] Orphan detection tool exists

---

## 14. RISKS & MITIGATIONS

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Upload API errors | High | Low | Thorough error handling + logging |
| Mobile compatibility | High | Low | Test on real devices |
| Storage quota exceeded | Medium | Low | Monitor usage + alert |
| Orphaned files | Low | High | Acceptable + cleanup tool |
| Breaking existing forms | High | Very Low | Additive changes only |
| Performance on slow networks | Medium | Medium | Show progress + compression |

---

## 15. FINAL ARCHITECTURE DIAGRAM

```
┌─────────────────────────────────────────────────────────────┐
│                    ADMIN DASHBOARD                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  MediaUpload Component                               │  │
│  │  • File picker                                       │  │
│  │  • Preview                                           │  │
│  │  • Upload progress                                   │  │
│  └────────────┬─────────────────────────────────────────┘  │
│               │                                             │
│               ▼                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  POST /api/admin/upload                              │  │
│  │  • Validate file                                     │  │
│  │  • Generate filename                                 │  │
│  │  • Upload to Storage                                 │  │
│  │  • Return URL                                        │  │
│  └────────────┬─────────────────────────────────────────┘  │
└───────────────┼─────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────┐
│                   SUPABASE PLATFORM                         │
│  ┌────────────────────────┐  ┌──────────────────────────┐  │
│  │   PostgreSQL DB        │  │   Storage Buckets        │  │
│  │                        │  │                          │  │
│  │  menu_items:           │  │  menu-images/            │  │
│  │    image_url (text)───────┼──► file1.webp           │  │
│  │                        │  │    file2.webp            │  │
│  │  services:             │  │                          │  │
│  │    image_url (text)───────┼──► service-images/       │  │
│  │                        │  │    file3.webp            │  │
│  │  gallery:              │  │                          │  │
│  │    image_url (text)───────┼──► gallery-images/       │  │
│  │                        │  │    file4.webp            │  │
│  │                        │  │                          │  │
│  │  [Complete URLs stored]│  │  [Binary files]          │  │
│  └────────────┬───────────┘  └──────────┬───────────────┘  │
└───────────────┼──────────────────────────┼──────────────────┘
                │                          │
                │                          │
                ▼                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    PUBLIC WEBSITE                           │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  MenuRepository.js                                   │  │
│  │  ↓ queries Supabase                                  │  │
│  │  {image_url: "https://supabase.co/storage/.../..."}│  │
│  │  ↓                                                    │  │
│  │  <img src={image_url} />                             │  │
│  │  ↓                                                    │  │
│  │  Browser fetches from Supabase CDN                   │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘

KEY:
─────► Data stored as complete public URL
       Storage objects accessed via URL
       No FK relationships, no JOINs required
```

---

## 16. RECOMMENDATION SUMMARY

### What to Implement

**PHASE 1 (REQUIRED):**
✅ Upload API endpoint  
✅ MediaUpload React component  
✅ Integration into existing forms  
✅ Mobile testing

**Effort:** 8-12 hours  
**Risk:** Very Low  
**User Impact:** High (solves UX problem)

**PHASE 2 (OPTIONAL):**
⚠️ Media library UI  
⚠️ Orphan detection tool  
⚠️ file_uploads tracking

**Effort:** 16-24 hours  
**Risk:** Low  
**User Impact:** Medium (convenience feature)

### What NOT to Implement

❌ **Normalized media_assets table** - Over-engineered  
❌ **Storage path format** - Unnecessary migration  
❌ **Automated orphan deletion** - Too risky  
❌ **Image CDN caching layer** - Supabase Storage already has CDN

### Architecture Decision

**USE OPTION D (HYBRID):**
- Keep existing URL-based architecture
- Add upload component for UX
- Optionally track metadata
- No breaking changes
- Incremental implementation
- Backward compatible

---

## 17. NEXT STEPS

1. **Review this proposal** with stakeholders
2. **Approve Phase 1** implementation
3. **Create upload API** (`/api/admin/upload`)
4. **Create MediaUpload component** (`src/components/media-upload.tsx`)
5. **Integrate into forms** (catalog-manager, gallery-view, etc.)
6. **Test on mobile devices** (iOS/Android)
7. **Deploy to production**
8. **Evaluate Phase 2** need after 2-4 weeks

---

## 18. APPENDICES

### A. Current Image Inventory (Aug 13, 2026)

```
Total Images: 36
├── menu-images: 13 files
├── service-images: 6 files
├── gallery-images: 14 files
├── hero-images: 2 files
├── logos: 1 file
└── testimonial-photos: 0 files

All URLs: Supabase Storage format
Format: 100% consistent
Orphans: Unknown (no tracking)
```

### B. Admin Components Affected

```
src/features/services/catalog-manager.tsx (Menu & Services)
src/features/gallery/gallery-view.tsx (Gallery)
src/features/cms/website-cms.tsx (Hero Slides)
src/app/dashboard/settings/page.tsx (Logo/Favicon)
```

### C. Public Website Repositories

```
../zt-lounge/assets/js/repositories/MenuRepository.js
../zt-lounge/assets/js/repositories/ServicesRepository.js
../zt-lounge/assets/js/repositories/GalleryRepository.js
../zt-lounge/assets/js/repositories/HeroRepository.js
```

---

**END OF PROPOSAL**

**Status:** Ready for implementation decision  
**Recommendation:** Approve Phase 1 (core upload)  
**Timeline:** 1 week development + 1 week testing  
**Go-Live:** 2 weeks from approval
