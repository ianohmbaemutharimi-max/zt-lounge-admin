# ZT LOUNGE — RUNTIME PRODUCTION ACCEPTANCE IMPLEMENTATION PLAN

## Current State Analysis

### Infrastructure Discovered
- ✅ Playwright available (@playwright/test ^1.62.1)
- ✅ Real Supabase authentication via SSR client
- ✅ Auth architecture: profiles → roles (with role_id FK)
- ✅ RBAC roles: super_admin, admin, manager, receptionist, staff
- ✅ Generic admin API using Repository pattern
- ✅ force-dynamic for fresh data fetching
- ✅ Content manager RBAC for gallery/testimonials
- ✅ Admin-only RBAC for other resources

### Resources to Test
1. menu-items
2. services
3. gallery
4. hero-slides
5. promotions

### Existing Test Infrastructure
- Tests directory exists but empty for auth/E2E
- No existing Playwright config found yet
- Previous scripts use fake `TEST_TOKEN`

## Implementation Strategy

### PHASE 1: Setup Real Authentication (Step 1)
- [ ] Create Playwright config file
- [ ] Create E2E test fixtures directory
- [ ] Implement real Supabase auth helper using credentials:
  - E2E_SUPER_ADMIN_EMAIL
  - E2E_SUPER_ADMIN_PASSWORD
  - E2E_ADMIN_EMAIL (if different)
  - Additional role accounts as needed
- [ ] Create auth utility that logs in real users
- [ ] Create database helper for independent schema verification

### PHASE 2: Create Test Infrastructure (Step 2-3)
- [ ] Create test data factory with unique identifiers (ZT_E2E_<timestamp>_<resource>)
- [ ] Create global setup/teardown for E2E environment
- [ ] Create database verification helpers (direct Supabase queries)
- [ ] Create API client wrapper with timing/assertion helpers
- [ ] Create report generation utilities

### PHASE 3: Implement Full CRUD Tests (Step 4-6)
For each resource (menu-items, services, gallery, hero-slides, promotions):
- [ ] POST → 201 assertion + DB verification
- [ ] GET collection → 200 + record presence
- [ ] GET individual → 200 + correct record
- [ ] PATCH → 200 + DB state change
- [ ] DELETE → 200/204 + record gone from DB

### PHASE 4: RBAC Testing (Step 7-9)
- [ ] Create test users for each role (super_admin, admin, manager, receptionist, staff)
- [ ] Test unauthorized access (401/403)
- [ ] Test authorized access for each role
- [ ] Test privilege escalation attempts
- [ ] Verify actual role matrix from implementation

### PHASE 5: Media Lifecycle (Step 10-12)
- [ ] Create small test image fixture
- [ ] Test upload endpoint
- [ ] Test media_id assignment to resources
- [ ] Test image URL resolution
- [ ] Test media replacement workflow
- [ ] Test media deletion behavior

### PHASE 6: Pagination & Search (Step 13-15)
- [ ] Seed 50+ test records to dedicated E2E database
- [ ] Test limit/offset combinations
- [ ] Test search functionality
- [ ] Test filtering
- [ ] Test ordering
- [ ] Verify no N+1 queries

### PHASE 7: Error Contract (Step 16-17)
- [ ] Test 401 for unauthenticated
- [ ] Test 403 for forbidden
- [ ] Test 404 for nonexistent
- [ ] Test 400 for malformed UUID
- [ ] Test 400 for invalid payload
- [ ] Verify no stack traces exposed

### PHASE 8: Performance (Step 18-19)
- [ ] Measure GET collection with 10/50 records
- [ ] Measure POST/PATCH/DELETE
- [ ] Measure search/filter
- [ ] Calculate P50/P95/P99
- [ ] Identify N+1 patterns

### PHASE 9: Browser E2E (Step 20-21)
- [ ] Test login flow
- [ ] Test dashboard access
- [ ] Test menu CRUD UI
- [ ] Test navigation
- [ ] Capture console errors

### PHASE 10: Cleanup & Reporting (Step 22-24)
- [ ] Delete all E2E test records (mandatory)
- [ ] Verify production data untouched
- [ ] Generate JSON report
- [ ] Generate Markdown report
- [ ] Calculate production readiness gate

## File Structure
```
tests/
├── e2e/
│   ├── fixtures/
│   │   ├── auth.ts              # Real Supabase auth helpers
│   │   ├── api.ts               # API client with timing/assertion
│   │   ├── db.ts                # Database verification helpers
│   │   └── test-data.ts         # Test data factories
│   ├── setup/
│   │   ├── global-setup.ts      # Global E2E environment
│   │   └── global-teardown.ts   # Cleanup after all tests
│   ├── crud.spec.ts             # Full CRUD for 5 resources
│   ├── rbac.spec.ts             # RBAC testing
│   ├── media.spec.ts            # Media lifecycle
│   ├── pagination.spec.ts       # Pagination/search
│   ├── error-contract.spec.ts   # Error codes
│   ├── performance.spec.ts      # Timing measurements
│   └── browser.spec.ts          # UI E2E
├── playwright.config.ts          # Playwright configuration
└── runtime-acceptance-report.md  # Final report template
```

## Production Gate Criteria

### GREEN (Production Ready)
- Zero test failures
- All authentication tests pass
- All RBAC tests pass
- All CRUD tests pass
- Media lifecycle verified
- Pagination verified
- Error contract verified
- Build passes (typecheck + build)
- No critical security issues

### YELLOW (Production Conditional)
- No critical failures BUT
- One or more test suites BLOCKED
- Missing environment variables
- Missing test infrastructure

### RED (Not Ready)
- Any critical test failure
- Authentication bypass
- RBAC bypass
- Data loss/corruption
- Build failure
- Unresolved cleanup failures

## Blockers & Solutions

### Missing Test Credentials
**Blocker:** E2E_*_EMAIL/PASSWORD env vars not set
**Solution:** Mark RBAC tests as BLOCKED, document required setup

### No Dedicated E2E Database
**Blocker:** Tests would modify production data
**Solution:** Use Supabase branch environments or staging URL via env var

### Media Upload Complexity
**Blocker:** Requires multipart/form-data handling
**Solution:** Use Playwright's built-in file upload, not raw HTTP

## Next Steps
1. Check for existing Playwright config
2. Check .env.local for test credentials
3. Create E2E fixtures
4. Implement CRUD tests
5. Execute and report


