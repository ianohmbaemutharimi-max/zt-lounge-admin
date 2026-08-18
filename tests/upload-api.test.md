# Phase 3 Upload API - Test Specification

## Overview

This document specifies the test cases for the Phase 3 Secure Image Upload API (`POST /api/admin/upload`).

## Test Categories

### 1. Authentication Tests

#### 1.1 Unauthenticated Request
- **Test:** Upload without session cookie
- **Expected:** HTTP 401
- **Response:** `{ "success": false, "error": "Authentication required" }`

#### 1.2 Invalid/Expired Session
- **Test:** Upload with invalid or expired session token
- **Expected:** HTTP 401
- **Response:** `{ "success": false, "error": "Authentication required" }`

### 2. Authorization (RBAC) Tests

#### 2.1 Customer Role
- **Test:** Upload as authenticated customer
- **Expected:** HTTP 403
- **Response:** `{ "success": false, "error": "Insufficient permissions..." }`

#### 2.2 Staff Role
- **Test:** Upload as authenticated staff
- **Expected:** HTTP 403
- **Response:** `{ "success": false, "error": "Insufficient permissions..." }`

#### 2.3 Receptionist Role
- **Test:** Upload as authenticated receptionist
- **Expected:** HTTP 403
- **Response:** `{ "success": false, "error": "Insufficient permissions..." }`

#### 2.4 Manager Role (Allowed)
- **Test:** Upload as authenticated manager
- **Expected:** HTTP 201
- **Response:** Success with upload data

#### 2.5 Admin Role (Allowed)
- **Test:** Upload as authenticated admin
- **Expected:** HTTP 201
- **Response:** Success with upload data

#### 2.6 Super Admin Role (Allowed)
- **Test:** Upload as authenticated super_admin
- **Expected:** HTTP 201
- **Response:** Success with upload data

### 3. Request Validation Tests

#### 3.1 Missing File
- **Test:** POST with category but no file
- **Expected:** HTTP 400
- **Response:** `{ "success": false, "error": "File is required" }`

#### 3.2 Missing Category
- **Test:** POST with file but no category
- **Expected:** HTTP 400
- **Response:** `{ "success": false, "error": "Category is required" }`

#### 3.3 Invalid Category
- **Test:** POST with file and `category=invalid`
- **Expected:** HTTP 400
- **Response:** `{ "success": false, "error": "Invalid category: invalid. Allowed: ..." }`

#### 3.4 Path Traversal in Category
- **Test:** POST with `category=../etc`
- **Expected:** HTTP 400
- **Response:** `{ "success": false, "error": "Invalid category: path traversal detected" }`

#### 3.5 Category with Slashes
- **Test:** POST with `category=gallery/subdir`
- **Expected:** HTTP 400
- **Response:** `{ "success": false, "error": "Invalid category: cannot contain slashes" }`

### 4. File Size Validation

#### 4.1 Valid Size (< 10MB)
- **Test:** Upload 5MB JPEG
- **Expected:** HTTP 201
- **Response:** Success

#### 4.2 Exactly 10MB
- **Test:** Upload exactly 10MB image
- **Expected:** HTTP 201
- **Response:** Success

#### 4.3 Over 10MB
- **Test:** Upload 11MB image
- **Expected:** HTTP 413
- **Response:** `{ "success": false, "error": "File too large: 11.00 MB. Maximum: 10 MB" }`

### 5. MIME Type Validation

#### 5.1 Valid JPEG
- **Test:** Upload valid JPEG (image/jpeg)
- **Expected:** HTTP 201
- **Response:** Success with WebP output

#### 5.2 Valid PNG
- **Test:** Upload valid PNG (image/png)
- **Expected:** HTTP 201
- **Response:** Success with WebP output

#### 5.3 Valid WebP
- **Test:** Upload valid WebP (image/webp)
- **Expected:** HTTP 201
- **Response:** Success with WebP output

#### 5.4 Invalid: GIF
- **Test:** Upload GIF (image/gif)
- **Expected:** HTTP 415
- **Response:** `{ "success": false, "error": "Unsupported image format: image/gif..." }`

#### 5.5 Invalid: SVG
- **Test:** Upload SVG (image/svg+xml)
- **Expected:** HTTP 415
- **Response:** `{ "success": false, "error": "Unsupported image format: image/svg+xml..." }`

#### 5.6 Invalid: PDF
- **Test:** Upload PDF renamed to .jpg
- **Expected:** HTTP 415
- **Response:** `{ "success": false, "error": "Invalid image format detected..." }`

#### 5.7 Invalid: HTML
- **Test:** Upload HTML renamed to .png
- **Expected:** HTTP 415
- **Response:** `{ "success": false, "error": "Invalid image format detected..." }`

### 6. Sharp Format Verification

#### 6.1 Fake Image (Renamed Text File)
- **Test:** Rename text.txt to image.jpg, upload as image/jpeg
- **Expected:** HTTP 415
- **Response:** `{ "success": false, "error": "Invalid or corrupted image file..." }`

#### 6.2 Corrupted Image
- **Test:** Upload truncated/corrupted JPEG
- **Expected:** HTTP 415 or 400
- **Response:** `{ "success": false, "error": "Invalid or corrupted image file..." }`

#### 6.3 Zero-byte File
- **Test:** Upload 0-byte file as image/jpeg
- **Expected:** HTTP 400 or 415
- **Response:** Error indicating invalid file

### 7. Image Processing Tests

#### 7.1 JPEG → WebP Conversion
- **Test:** Upload JPEG
- **Expected:** Output is WebP format
- **Verification:** Response `format: "webp"`, storage object has .webp extension

#### 7.2 PNG → WebP Conversion
- **Test:** Upload PNG with transparency
- **Expected:** Output is WebP format
- **Verification:** Response `format: "webp"`, storage object has .webp extension

#### 7.3 WebP → WebP (Re-encoding)
- **Test:** Upload WebP
- **Expected:** Output is reprocessed WebP at quality 80
- **Verification:** Response `format: "webp"`

#### 7.4 Quality Setting
- **Test:** Upload large high-quality JPEG
- **Expected:** Output WebP at quality 80
- **Verification:** File size reduced, acceptable quality

#### 7.5 Aspect Ratio Preservation
- **Test:** Upload 800x600 image
- **Expected:** Aspect ratio 4:3 preserved after resize
- **Verification:** `width/height` ratio remains 4:3

#### 7.6 No Enlargement
- **Test:** Upload 300x200 image to hero category (max 1920px)
- **Expected:** Image remains 300x200 (not enlarged)
- **Verification:** Response `width: 300, height: 200`

#### 7.7 Category-Specific Resizing: Hero
- **Test:** Upload 3000x2000 image to hero category
- **Expected:** Resized to max 1920px width
- **Verification:** `width <= 1920`, aspect ratio preserved

#### 7.8 Category-Specific Resizing: Gallery
- **Test:** Upload 2400x1600 image to gallery category
- **Expected:** Resized to max 1200px width
- **Verification:** `width <= 1200`, aspect ratio preserved

#### 7.9 Category-Specific Resizing: Menu
- **Test:** Upload 1200x900 image to menu category
- **Expected:** Resized to max 800px width
- **Verification:** `width <= 800`, aspect ratio preserved

#### 7.10 Category-Specific Resizing: Testimonials
- **Test:** Upload 800x800 image to testimonials category
- **Expected:** Resized to max 400px width
- **Verification:** `width <= 400`, aspect ratio preserved

### 8. Storage Path Security

#### 8.1 UUID Filename Generation
- **Test:** Upload image
- **Expected:** Storage path uses UUID filename
- **Verification:** Path matches `assets/images/{category}/{uuid}.webp`

#### 8.2 No Client Path Control
- **Test:** Attempt to control storage path via request
- **Expected:** Client input ignored, UUID path used
- **Verification:** Storage path is UUID-based

#### 8.3 No Overwrite (upsert: false)
- **Test:** Upload would create duplicate path (unlikely with UUID)
- **Expected:** Upload fails rather than overwriting
- **Verification:** `upsert: false` is set in storage upload

#### 8.4 Correct Bucket
- **Test:** Upload image
- **Expected:** Uploaded to `public-assets` bucket
- **Verification:** Response `bucket: "public-assets"`

#### 8.5 Correct Path Format
- **Test:** Upload to each category
- **Expected:** Path follows `assets/images/{category}/{uuid}.webp`
- **Verification:** Path structure validated

### 9. Database Tracking (file_uploads)

#### 9.1 Record Created
- **Test:** Successful upload
- **Expected:** Record created in `file_uploads` table
- **Verification:** Query database for record by `id` from response

#### 9.2 Correct bucket
- **Test:** Check created record
- **Expected:** `bucket = "public-assets"`

#### 9.3 Correct path
- **Test:** Check created record
- **Expected:** `path = "assets/images/{category}/{uuid}.webp"`

#### 9.4 Original Name Stored
- **Test:** Upload `test-image.jpg`
- **Expected:** `original_name = "test-image.jpg"`

#### 9.5 MIME Type Stored
- **Test:** Upload JPEG
- **Expected:** `mime_type = "image/jpeg"` (original, not converted)

#### 9.6 File Size Stored
- **Test:** Check record
- **Expected:** `file_size` matches processed WebP size

#### 9.7 uploaded_by Correct
- **Test:** Upload as specific user
- **Expected:** `uploaded_by` matches authenticated user's profile ID

#### 9.8 created_at Automatic
- **Test:** Check record
- **Expected:** `created_at` is timestamptz, set automatically

### 10. Response Format

#### 10.1 Success Response Structure
- **Test:** Successful upload
- **Expected:**
  ```json
  {
    "success": true,
    "data": {
      "id": "uuid",
      "bucket": "public-assets",
      "path": "assets/images/gallery/uuid.webp",
      "relativePath": "assets/images/gallery/uuid.webp",
      "publicUrl": "https://...supabase.co/storage/v1/object/public/public-assets/assets/images/gallery/uuid.webp",
      "originalName": "test.jpg",
      "mimeType": "image/jpeg",
      "fileSize": 123456,
      "width": 800,
      "height": 600
    }
  }
  ```

#### 10.2 Public URL Accessibility
- **Test:** Upload image, GET publicUrl
- **Expected:** HTTP 200, image accessible
- **Verification:** `curl {publicUrl}` returns WebP image

#### 10.3 relativePath Compatibility
- **Test:** Check response
- **Expected:** `relativePath` matches `path`, suitable for AssetUrl.resolve()

### 11. Failure Cleanup

#### 11.1 Database Failure → Storage Cleanup
- **Test:** Simulate database insert failure (e.g., disconnect after upload)
- **Expected:** Storage object is deleted
- **Verification:** Storage path does not exist after failure

#### 11.2 Storage Failure → No Database Record
- **Test:** Simulate storage upload failure (e.g., invalid bucket)
- **Expected:** No database record created
- **Verification:** Query database shows no record

#### 11.3 Processing Failure → No Artifacts
- **Test:** Upload invalid image that fails Sharp processing
- **Expected:** No storage object, no database record
- **Verification:** Nothing created in storage or database

#### 11.4 Orphan Prevention
- **Test:** Various failure scenarios
- **Expected:** Never create orphaned storage objects or database records
- **Verification:** Storage and database remain consistent

### 12. Security Tests

#### 12.1 No Service-Role Exposure
- **Test:** Inspect all responses and logs
- **Expected:** Service-role key never appears
- **Verification:** No `SUPABASE_SERVICE_ROLE_KEY` in any output

#### 12.2 No Secrets in Error Messages
- **Test:** Trigger various errors
- **Expected:** No secrets, tokens, or credentials in error responses
- **Verification:** Review all error messages

#### 12.3 No Stack Traces to Client
- **Test:** Trigger internal errors
- **Expected:** Generic error message, no stack trace
- **Verification:** Response contains `"Internal server error"`, not stack trace

#### 12.4 Safe Logging
- **Test:** Review server logs
- **Expected:** No tokens, keys, or credentials logged
- **Verification:** Only safe metadata logged (path, size, etc.)

### 13. Valid Categories

Test each allowed category:

- `category=hero` → Success
- `category=gallery` → Success
- `category=menu` → Success
- `category=services` → Success
- `category=testimonials` → Success
- `category=branding` → Success

## Test Execution

### Manual Testing

Use tools like:
- Postman
- curl
- Insomnia
- Custom test script

### Automated Testing

Implement with:
- Vitest (if project uses)
- Jest
- Playwright (for integration tests)

### Example curl Command

```bash
curl -X POST http://localhost:3000/api/admin/upload \
  -H "Cookie: sb-access-token=...; sb-refresh-token=..." \
  -F "file=@test-image.jpg" \
  -F "category=gallery"
```

## Success Criteria

- All authentication tests pass
- All RBAC tests pass
- All validation tests pass
- All processing tests pass
- All security tests pass
- All database tracking tests pass
- All cleanup tests pass
- TypeScript compiles
- Build succeeds
- No runtime errors

## Notes

- Tests should use actual Supabase credentials (not mocked) for runtime verification
- Storage bucket must exist and be configured correctly
- Database table must exist with correct schema
- Test cleanup: delete test uploads after verification
