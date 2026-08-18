# ZT LOUNGE — RUNTIME ACCEPTANCE TEST SUITE
## PHASE 2: GENUINE RUNTIME VERIFICATION IMPLEMENTATION PLAN

**Date:** August 18, 2026  
**Status:** Phase 1 (Framework) Complete. Phase 2 (Real Runtime Testing) Planned.  
**Scope:** Convert Playwright framework into genuine runtime acceptance suite with actual test execution evidence.

---

## CURRENT STATE

✅ **Phase 1 Complete:**
- Playwright infrastructure created
- ESM configuration fixed (removed require.resolve)
- Auth fixtures scaffolded
- Test structure defined
- TypeScript check passes

❌ **Phase 2 Required:**
- Real authentication with actual Supabase credentials
- Comprehensive API testing (CRUD operations)
- Database verification helpers
- RBAC authorization testing
- Media lifecycle testing
- Pagination and search testing
- Error contract validation
- Performance measurement
- Browser E2E workflows
- Cleanup and teardown logic
- Production readiness reporting

---

## PHASE 2 IMPLEMENTATION ROADMAP

### A. AUTHENTICATION & SESSION MANAGEMENT

**Objective:** Real Supabase authentication with role-based test users

**Implementation:**
1. Create test user management helper (`tests/e2e/helpers/test-users.ts`)
   - Create/verify test users for each role: super_admin, admin, manager, receptionist, staff
   - Return real Supabase auth tokens
   - Handle credential rotation and cleanup

2. Implement robust auth fixture (`tests/e2e/fixtures/auth.ts` - REBUILD)
   - Real Supabase client initialization
   - Obtain JWT tokens for each role
   - Cache tokens within test session
   - Refresh tokens on expiration

3. Environment variable requirements:
   ```bash
   # REQUIRED for full runtime testing
   E2E_SUPER_ADMIN_EMAIL=test-super-admin@supabase.local
   E2E_SUPER_ADMIN_PASSWORD=secure_password_1
   E2E_ADMIN_EMAIL=test-admin@supabase.local
   E2E_ADMIN_PASSWORD=secure_password_2
   E2E_MANAGER_EMAIL=test-manager@supabase.local
   E2E_MANAGER_PASSWORD=secure_password_3
   E2E_RECEPTIONIST_EMAIL=test-receptionist@supabase.local
   E2E_RECEPTIONIST_PASSWORD=secure_password_4
   E2E_STAFF_EMAIL=test-staff@supabase.local
   E2E_STAFF_PASSWORD=secure_password_5
   
   # Already set
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   ```

**Deliverables:**
- `tests/e2e/helpers/auth.ts` - Real authentication logic
- `tests/e2e/helpers/test-data.ts` - Test data generators
- Credential validation in global setup

**Status:** BLOCKED until E2E credentials created in Supabase

---

### B. API CLIENT & HELPERS

**Objective:** Authenticated HTTP client for API testing

**Implementation:**
1. Create API client helper (`tests/e2e/helpers/api-client.ts`)
   - Fetch wrapper with real Supabase JWT tokens
   - Automatic Bearer token injection
   - Error parsing and response validation
   - Request/response logging for debugging
   - Performance metrics capture (latency)

2. Database verification helpers (`tests/e2e/helpers/db-verify.ts`)
   - Supabase client for direct database queries
   - Verify record creation after POST
   - Verify field updates after PATCH
   - Verify deletion after DELETE
   - Check foreign key relationships
   - Validate timestamps and metadata
   - Transaction rollback on test cleanup

3. Test data tagging (`tests/e2e/helpers/test-identifiers.ts`)
   - Generate unique test IDs: `ZT_E2E_<timestamp>_<resource>_<randomId>`
   - Track all created records for cleanup
   - Bulk deletion helpers

**Deliverables:**
- `tests/e2e/helpers/api-client.ts` (200 LOC)
- `tests/e2e/helpers/db-verify.ts` (150 LOC)
- `tests/e2e/helpers/test-identifiers.ts` (100 LOC)

---

### C. CORE API RESOURCE TESTING

**Objective:** Full CRUD testing for 5 core resources

**Resources to Test:**
1. `menu-items` (with media_id support)
2. `services` (with media_id support)
3. `gallery` (with media_id support)
4. `hero-slides` (with media_id support)
5. `promotions`

**Test Template for Each Resource:**

```typescript
describe('Resource: {resource}', () => {
  describe('POST /api/admin/{resource}', () => {
    test('Create record with valid payload → 200 + database persist', async () => {
      // 1. Prepare test data with unique identifier
      // 2. Call POST API with auth token
      // 3. Verify 200 response + returned ID
      // 4. Query database to verify persistence
      // 5. Track ID for cleanup
    });
    
    test('Create without auth → 401', async () => {
      // Verify unauthenticated access fails
    });
    
    test('Create as lower-privilege role → 403', async () => {
      // Test privilege escalation prevention
    });
  });
  
  describe('GET /api/admin/{resource}', () => {
    test('List all (10 records) → 200 with pagination', async () => {
      // Create 10 test records
      // Query with limit=10 offset=0
      // Verify count, ordering, no duplicates
      // Measure latency (target: <500ms)
    });
    
    test('Pagination boundary: limit=50 with 50 records', async () => {
      // Create 50 test records
      // Test offset=0,10,20,30,40
      // Verify no missing records
    });
    
    test('Invalid pagination (limit=-1) → 400', async () => {
      // Verify error handling
    });
  });
  
  describe('GET /api/admin/{resource}/{id}', () => {
    test('Retrieve single record → 200 with full details', async () => {
      // Create test record
      // Query by ID
      // Verify all fields present
      // Verify media relationships resolved
    });
    
    test('Retrieve nonexistent ID → 404', async () => {
      // Query with fake UUID
      // Verify 404 response
    });
    
    test('Retrieve with invalid UUID format → 400', async () => {
      // Query with non-UUID string
      // Verify 400 response
    });
  });
  
  describe('PATCH /api/admin/{resource}/{id}', () => {
    test('Update single field → 200 + database update', async () => {
      // Create record
      // PATCH single field (e.g., name)
      // Verify 200 response + updated field
      // Query database to verify persistence
      // Verify other fields unchanged
    });
    
    test('Update media_id → 200 + relationship verified', async () => {
      // Create record
      // PATCH media_id to new value
      // Verify media_assets relationship
      // Verify resolved image URLs
    });
    
    test('Update with readonly field → 400 or ignored', async () => {
      // Attempt to modify created_at or id
      // Verify rejection or field ignored
    });
  });
  
  describe('DELETE /api/admin/{resource}/{id}', () => {
    test('Delete record → 200 + database removal', async () => {
      // Create record
      // DELETE by ID
      // Verify 200 response
      // Query database - record should not exist
    });
    
    test('Delete nonexistent → 404', async () => {
      // DELETE fake UUID
      // Verify 404 response
    });
  });
  
  describe('Search/Filter', () => {
    test('Search by name → correct results', async () => {
      // Create 3 records with distinct names
      // Query with search parameter
      // Verify only matching records returned
      // Measure latency
    });
  });
});
```

**Performance Targets:**
- GET collection (10 records): < 500ms
- GET collection (50 records): < 1000ms
- POST: < 1000ms
- PATCH: < 1000ms
- DELETE: < 500ms

**Measurement Output:**
```json
{
  "resource": "menu-items",
  "method": "GET",
  "endpoint": "/api/admin/menu-items?limit=10",
  "recordCount": 10,
  "measurements": {
    "min": 120,
    "max": 450,
    "avg": 250,
    "p50": 240,
    "p95": 400,
    "p99": 450
  }
}
```

**Deliverables:**
- `tests/e2e/api/menu-items.spec.ts` (300+ LOC)
- `tests/e2e/api/services.spec.ts` (300+ LOC)
- `tests/e2e/api/gallery.spec.ts` (300+ LOC)
- `tests/e2e/api/hero-slides.spec.ts` (300+ LOC)
- `tests/e2e/api/promotions.spec.ts` (300+ LOC)

---

### D. RBAC AUTHORIZATION TESTING

**Objective:** Verify role-based access control enforcement

**Authorization Matrix:**
```
Resource      | super_admin | admin | manager | receptionist | staff | customer
menu-items    | CRUD        | CRUD  | R       | R            | -     | R (public)
services      | CRUD        | CRUD  | R       | R            | -     | R (public)
gallery       | CRUD        | CRUD  | CRU     | R            | -     | R (public)
hero-slides   | CRUD        | CRUD  | -       | R            | -     | R (public)
promotions    | CRUD        | CRUD  | -       | -            | -     | R (public)
```

**Test Cases for Each Resource:**

```typescript
describe('RBAC: Authorization Matrix', () => {
  describe('Resource: menu-items', () => {
    test('super_admin: GET collection → 200', async () => {});
    test('super_admin: POST → 200', async () => {});
    test('super_admin: PATCH → 200', async () => {});
    test('super_admin: DELETE → 200', async () => {});
    
    test('admin: GET collection → 200', async () => {});
    test('admin: POST → 200', async () => {});
    test('admin: PATCH → 200', async () => {});
    test('admin: DELETE → 200', async () => {});
    
    test('manager: GET collection → 200', async () => {});
    test('manager: POST → 403 (forbidden)', async () => {});
    test('manager: DELETE → 403 (forbidden)', async () => {});
    
    test('unauthenticated: GET collection → 401', async () => {});
    test('unauthenticated: POST → 401', async () => {});
  });
});
```

**Privilege Escalation Tests:**
```typescript
describe('Security: Privilege Escalation Prevention', () => {
  test('staff role cannot POST menu-items', async () => {
    // Attempt create with staff token
    // Expect 403 Forbidden
  });
  
  test('receptionist cannot DELETE gallery', async () => {
    // Attempt delete with receptionist token
    // Expect 403 Forbidden
  });
  
  test('manager cannot modify hero-slides', async () => {
    // Attempt PATCH with manager token
    // Expect 403 Forbidden
  });
});
```

**Deliverables:**
- `tests/e2e/rbac/authorization-matrix.spec.ts` (400+ LOC)
- `tests/e2e/rbac/privilege-escalation.spec.ts` (200+ LOC)

---

### E. MEDIA LIFECYCLE TESTING

**Objective:** Verify complete media upload, assignment, and resolution flow

**Test Fixtures:**
- Create `tests/e2e/fixtures/assets/test-image-1x1.png` (1KB deterministic image)
- Create `tests/e2e/fixtures/assets/test-image-2x2.png` (2KB deterministic image)

**Media Lifecycle Test Suite:**

```typescript
describe('Media Lifecycle', () => {
  test('Upload image → storage + media_assets row + accessible URL', async () => {
    // 1. Prepare 1x1 image fixture
    // 2. POST /api/admin/upload with FormData + image file
    // 3. Verify 200 response with media_id
    // 4. Query media_assets table → record exists
    // 5. Verify file exists in R2/storage
    // 6. Verify resolved_image_url is accessible (GET returns 200)
  });
  
  test('Assign media_id to menu-item → relationship persisted', async () => {
    // 1. Upload image (get media_id)
    // 2. POST /api/admin/menu-items with media_id
    // 3. Verify menu_item.media_id == media_id
    // 4. Query response - verify image URL included
    // 5. GET /api/admin/menu-items/{id} - media relationship resolved
  });
  
  test('Replace media in menu-item → old media reusable', async () => {
    // 1. Upload image A (media_id_a)
    // 2. Create menu-item with media_id_a
    // 3. Upload image B (media_id_b)
    // 4. PATCH menu-item with media_id_b
    // 5. Verify menu-item.media_id == media_id_b
    // 6. Verify media_id_a still exists (can be used elsewhere)
  });
  
  test('Delete media → CMS records remain valid', async () => {
    // 1. Upload image (media_id)
    // 2. Assign to menu-item
    // 3. DELETE /api/admin/media/{id}
    // 4. Verify media_assets row deleted from storage
    // 5. Query menu-item - verify it still exists (media_id NULL or cascade handled)
    // 6. Verify no orphaned references
  });
  
  test('Media resolve for 50 items → verify N+1 detection', async () => {
    // 1. Create 50 menu-items with varying media_id values (some NULL, some same ID)
    // 2. GET /api/admin/menu-items (all 50)
    // 3. Profile database queries - should be batch/1, NOT 50 individual media queries
    // 4. Log evidence of query pattern
  });
  
  test('Public rendering: /api/media endpoint works', async () => {
    // 1. Upload image (unauthenticated, if allowed)
    // 2. GET /api/media?id=<media_id> → returns image or metadata
    // 3. Verify public accessibility
  });
});
```

**Deliverables:**
- `tests/e2e/fixtures/assets/test-image-1x1.png`
- `tests/e2e/fixtures/assets/test-image-2x2.png`
- `tests/e2e/media/lifecycle.spec.ts` (350+ LOC)

---

### F. ERROR CONTRACT VALIDATION

**Objective:** Verify consistent error responses

**Error Scenarios:**

```typescript
describe('Error Contracts', () => {
  describe('401 Unauthenticated', () => {
    test('Missing auth header → 401 + "Unauthorized" error', async () => {});
    test('Invalid JWT → 401 + "Unauthorized" error', async () => {});
    test('Expired JWT → 401 + "Unauthorized" error', async () => {});
  });
  
  describe('403 Forbidden', () => {
    test('Insufficient role → 403 + "Forbidden" error', async () => {});
    test('No verify: Check error message is safe (no secrets exposed)', async () => {});
  });
  
  describe('404 Not Found', () => {
    test('Nonexistent resource ID → 404 + error message', async () => {});
    test('Verify no stack traces exposed', async () => {});
  });
  
  describe('400 Bad Request', () => {
    test('Invalid UUID format → 400 + validation error', async () => {});
    test('Missing required field → 400 + field name', async () => {});
    test('Invalid enum value → 400 + allowed values', async () => {});
    test('Readonly field mutation attempt → 400 or ignored', async () => {});
  });
  
  describe('500 Internal Server Error', () => {
    test('Database unavailable → 500 + safe message (no DB internals)', async () => {});
  });
});
```

**Verify Error Response Structure:**
```json
{
  "error": "string (no stack trace)",
  "status": "number (HTTP status)",
  "message": "string (user-friendly, no secrets)"
}
```

**Deliverables:**
- `tests/e2e/errors/error-contract.spec.ts` (200+ LOC)

---

### G. PAGINATION & SEARCH

**Objective:** Verify correct pagination and search behavior

```typescript
describe('Pagination & Search', () => {
  before(() => {
    // Create exactly 50 test menu-items with predictable data
  });
  
  describe('Pagination', () => {
    test('limit=10 offset=0 → first 10 records', async () => {
      // Verify IDs 1-10 returned (deterministic order)
    });
    
    test('limit=10 offset=10 → next 10 records', async () => {
      // Verify IDs 11-20 returned
      // Verify no overlap with previous page
    });
    
    test('limit=10 offset=40 → last 10 records', async () => {
      // Verify IDs 41-50 returned
    });
    
    test('limit=0 → 400 (invalid limit)', async () => {});
    test('limit=-1 → 400 (invalid limit)', async () => {});
    test('offset=-1 → 400 (invalid offset)', async () => {});
  });
  
  describe('Search', () => {
    test('search="test-name-5" → only matching record', async () => {
      // Create items: "test-name-1", "test-name-2", ..., "test-name-50"
      // Query search="test-name-5"
      // Verify only 1 result
    });
  });
  
  describe('Deterministic Ordering', () => {
    test('Multiple queries → same order', async () => {
      // Query 3 times with same params
      // Verify identical ordering each time
    });
  });
});
```

**Deliverables:**
- `tests/e2e/queries/pagination-search.spec.ts` (250+ LOC)

---

### H. BROWSER E2E WORKFLOWS

**Objective:** Test real browser interactions (login, CRUD UI, image upload)

```typescript
describe('Browser E2E: Dashboard Workflows', () => {
  describe('Authentication Flow', () => {
    test('Login with valid credentials → redirects to /dashboard', async ({ page }) => {
      // Navigate to /dashboard
      // Should redirect to login
      // Enter email + password
      // Click submit
      // Verify redirect to /dashboard
      // Verify no console errors
    });
    
    test('Login with invalid credentials → error message', async ({ page }) => {});
    test('Logout → returns to public site', async ({ page }) => {});
  });
  
  describe('Menu CRUD via UI', () => {
    test('Create menu item via dialog → appears in list', async ({ page }) => {
      // Navigate to /dashboard/menu
      // Click "Add Menu Item" button
      // Fill form with unique name
      // Upload image
      // Click save
      // Verify item appears in table
      // Verify no console errors
    });
    
    test('Edit menu item → changes persisted', async ({ page }) => {
      // Navigate to existing item
      // Click edit
      // Change name
      // Click save
      // Verify change appears
    });
    
    test('Delete menu item → removed from list', async ({ page }) => {
      // Click delete on existing item
      // Confirm deletion
      // Verify removed from table
    });
  });
  
  describe('Image Upload via UI', () => {
    test('Upload image via media picker → appears in list', async ({ page }) => {
      // Open media library
      // Click upload
      // Select test image
      // Verify upload progress
      // Verify image appears in gallery
    });
    
    test('Replace image in menu item', async ({ page }) => {
      // Open menu item with image
      // Click change image
      // Select new image
      // Verify new image displayed
    });
  });
});
```

**Deliverables:**
- `tests/e2e/workflows/auth.spec.ts` (200+ LOC)
- `tests/e2e/workflows/menu-crud.spec.ts` (300+ LOC)
- `tests/e2e/workflows/image-upload.spec.ts` (250+ LOC)

---

### I. CLEANUP & TEARDOWN

**Objective:** Verify all test data is removed

```typescript
// tests/e2e/setup/cleanup.ts

export async function cleanupAllTestData(supabase: SupabaseClient) {
  const results = {
    menu_items_deleted: 0,
    services_deleted: 0,
    gallery_deleted: 0,
    hero_slides_deleted: 0,
    promotions_deleted: 0,
    media_assets_deleted: 0,
    errors: [] as string[],
  };
  
  try {
    // Delete all records with ZT_E2E_ identifier
    const tables = ['menu_items', 'services', 'gallery', 'hero_slides', 'promotions'];
    
    for (const table of tables) {
      const { count, error } = await supabase
        .from(table)
        .delete()
        .ilike('name', 'ZT_E2E_%');
      
      if (error) results.errors.push(`${table}: ${error.message}`);
      else results[`${table}_deleted`] = count;
    }
    
    // Delete orphaned media_assets
    const { count: mediaCount, error: mediaError } = await supabase
      .from('media_assets')
      .delete()
      .ilike('filename', 'ZT_E2E_%');
    
    if (mediaError) results.errors.push(`media_assets: ${mediaError.message}`);
    else results.media_assets_deleted = mediaCount;
    
  } catch (e) {
    results.errors.push(`Cleanup failed: ${e.message}`);
  }
  
  return results;
}
```

**Verification Test:**
```typescript
test('Cleanup: Verify no ZT_E2E records remain', async () => {
  const { count: remainingCount, error } = await supabase
    .from('menu_items')
    .select('*', { count: 'exact' })
    .ilike('name', 'ZT_E2E_%');
  
  expect(remainingCount).toBe(0);
});
```

**Deliverables:**
- `tests/e2e/setup/cleanup.ts` (150+ LOC)
- `tests/e2e/setup/global-teardown.ts` (UPDATED with cleanup)

---

### J. PRODUCTION READINESS REPORTING

**Objective:** Generate comprehensive test report

**Report Structure:**
```typescript
interface TestResult {
  testName: string;
  phase: string;
  resource: string;
  role: string;
  method: string;
  endpoint: string;
  expectedStatus: number;
  actualStatus: number;
  duration: number;
  status: 'PASS' | 'FAIL' | 'BLOCKED';
  evidence: {
    request: object;
    response: object;
    databaseState?: object;
  };
  error?: string;
}

interface ProductionReadinessReport {
  timestamp: string;
  results: TestResult[];
  summary: {
    pass: number;
    fail: number;
    blocked: number;
  };
  gate: 'GREEN' | 'YELLOW' | 'RED';
  recommendations: string[];
}
```

**Report Output Locations:**
- `test-results/results.json` (structured data)
- `test-results/html/` (Playwright HTML report)
- `RUNTIME_ACCEPTANCE_REPORT.md` (markdown summary)

**Deliverables:**
- `tests/e2e/helpers/reporter.ts` (200+ LOC)
- RUNTIME_ACCEPTANCE_REPORT.md (auto-generated)

---

## IMPLEMENTATION TIMELINE

| Phase | Task | Est. LOC | Effort | Owner |
|-------|------|---------|--------|-------|
| A | Auth & Session Management | 250 | 2 days | QA/Dev |
| B | API Client & Helpers | 450 | 2 days | Dev |
| C | Core API Testing | 1500 | 5 days | QA |
| D | RBAC Authorization | 600 | 2 days | QA |
| E | Media Lifecycle | 350 | 2 days | QA |
| F | Error Contracts | 200 | 1 day | QA |
| G | Pagination & Search | 250 | 1 day | QA |
| H | Browser E2E | 750 | 3 days | QA |
| I | Cleanup & Teardown | 150 | 1 day | Dev |
| J | Reporting | 200 | 1 day | Dev |
| **TOTAL** | | **~4700** | **~20 days** | |

---

## BLOCKERS & PREREQUISITES

### BLOCKED: E2E Test Credentials Not Configured

The following test accounts must be created in Supabase Auth:

1. **super_admin@supabase.local** → super_admin role
2. **admin@supabase.local** → admin role
3. **manager@supabase.local** → manager role (IF role exists)
4. **receptionist@supabase.local** → receptionist role (IF role exists)
5. **staff@supabase.local** → staff role (IF role exists)

**Current Status:** No manager, receptionist, or staff profiles exist in database.

**Action Required:**
- Determine whether these roles are intended to be created
- If NOT: Update authorization matrix and mark those tests BLOCKED
- If YES: Create test users and assign roles via Supabase

**Impact:** Cannot proceed with RBAC testing until credentials available.

---

## FINAL PRODUCTION READINESS GATE

### GREEN ✅ (Production Ready)
- [ ] All core API tests PASS
- [ ] RBAC authorization enforcement verified
- [ ] Media lifecycle complete
- [ ] Pagination/search verified
- [ ] Error contracts validated
- [ ] Browser E2E workflows pass
- [ ] Cleanup verification PASS
- [ ] No security issues detected
- [ ] Performance targets met (P95 < 1000ms)
- [ ] Build passes
- [ ] TypeScript check passes

### YELLOW ⚠️ (Conditional)
- [ ] Tests pass but one or more BLOCKED (missing credentials)
- [ ] Some performance targets not met but acceptable
- [ ] Minor non-critical issues documented

### RED 🔴 (Not Production Ready)
- [ ] Critical test failures
- [ ] RBAC bypass detected
- [ ] Authentication bypass
- [ ] Data corruption
- [ ] Cleanup failure
- [ ] Build failure

---

## NEXT STEPS

1. **Immediate:** Create E2E test user accounts in Supabase
2. **Week 1:** Implement Phases A-B (Auth, API Helpers)
3. **Week 2-3:** Implement Phases C-H (Core testing)
4. **Week 3:** Implement Phases I-J (Cleanup, Reporting)
5. **Week 4:** Execute full suite, capture evidence, generate report

---

## SUCCESS CRITERIA

✅ Runtime acceptance test suite executes without code inspection  
✅ Real Supabase authentication used (no fake tokens)  
✅ Actual database queries verify persistence  
✅ RBAC enforcement verified at runtime  
✅ Complete media lifecycle tested  
✅ All test data cleaned up  
✅ Production readiness gate evaluated  
✅ Defects documented with evidence  
✅ Recommendations provided for any failures  


