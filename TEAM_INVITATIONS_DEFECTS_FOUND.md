# TEAM INVITATIONS — PRODUCTION DEFECTS FOUND

## CRITICAL SECURITY VULNERABILITIES

### 1. RLS POLICY — PUBLIC ENUMERATION ATTACK (CRITICAL)
**File**: `supabase/migrations/20260818_add_team_invitations.sql` (Line 103-106)

**Issue**: The RLS policy allows ANYONE (authenticated or not) to enumerate all pending invitations:
```sql
CREATE POLICY "Anyone can read pending invitations by token for acceptance"
  ON invitations
  FOR SELECT
  USING (status = 'pending');
```

**Attack**: An attacker can query all pending invitations without authentication:
- Enumerate all pending invitations
- Get email addresses of pending team members
- Potentially correlate with role information

**Fix**: Remove this permissive policy. Token validation must be done in application layer only.

---

### 2. LIBRARY CODE — NONSENSICAL QUERIES (HIGH)
**File**: `src/lib/team/invitations.ts` (Lines 56-78)

**Function**: `emailExists()`
```typescript
export async function emailExists(
  supabase: SupabaseClient,
  email: string
): Promise<boolean> {
  const normalizedEmail = normalizeEmail(email);
  
  // DEFECT: This query doesn't check email at all
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", supabase.auth.getUser().then(u => u.data?.user?.id))  // Wrong: comparing user_id to a Promise
    .limit(1);

  if (error) throw new Error(`Failed to check email: ${error.message}`);
  
  // DEFECT: This second query also makes no sense
  const { data: authData } = await supabase
    .from("profiles")
    .select("id")
    .like("user_id", `${normalizedEmail}%`)  // Wrong: treating user_id as like a URL
    .limit(1);

  return data && data.length > 0 ? true : false;
}
```

**Problems**:
1. First query: `supabase.auth.getUser().then()` returns a Promise, can't be used in EQ filter
2. Second query: Using LIKE on user_id with email pattern makes no sense
3. Function never actually checks if email exists
4. Unused `authData` variable
5. Function would always return false or throw

**Impact**: Email uniqueness checks don't work. Duplicate invitations possible.

---

### 3. LIBRARY CODE — BROKEN RESEND TOKEN GENERATION (HIGH)
**File**: `src/lib/team/invitations.ts` (Lines 262-276)

**Function**: `logInvitationResent()`
```typescript
export async function logInvitationResent(
  supabase: SupabaseClient,
  invitationId: string,
  profileId: string,
  ipAddress?: string
): Promise<void> {
  // DEFECT: Writing to wrong table
  await supabase.from("activity_logs").insert({  // Should be "activity_log" (singular)
    profile_id: profileId,
    action: "team_invitation_resent",
    table_name: "invitations",
    record_id: invitationId,
    ip_address: ipAddress,
    created_at: new Date().toISOString(),
  });
}
```

**Issues**:
1. Table name is wrong - likely "activity_log" not "activity_logs"
2. This silently fails, no error handling
3. Activity logs for resend never recorded

**Impact**: Resend operations not audited.

---

### 4. LIBRARY CODE — OTHER ACTIVITY LOG TABLE NAMES (MEDIUM)
**File**: `src/lib/team/invitations.ts` (Lines 268, 289, 313, 332)

Same table name issue in:
- `logInvitationCreated()` - line 289
- `logInvitationAccepted()` - line 313
- `logInvitationRevoked()` - line 332

All use `"activity_logs"` which is likely wrong.

---

### 5. API ENDPOINT — MISSING EMAIL CHECK (MEDIUM)
**File**: `src/app/api/admin/team-invitations/route.ts` (POST handler)

**Issue**: The endpoint never checks if the email already belongs to an active account.

**Current flow**:
1. Check pending invitation exists ✓
2. Check role permission ✓
3. Create invitation

**Missing**:
- Check if email already has active profile
- User could invite someone already in the system

**Result**: Duplicate team members possible.

---

### 6. LIBRARY CODE — PROFILE QUERY BROKEN (HIGH)
**File**: `src/lib/team/invitations.ts` (Lines 56-66)

The `emailExists()` function is broken. It should:
1. Check if email exists in invitations OR profiles
2. Not use nonsensical promises and LIKE patterns
3. Actually validate the email parameter

---

### 7. ACCEPTANCE ENDPOINT — SILENT FAILURES (MEDIUM)
**File**: `src/app/api/invitations/accept/route.ts`

**Issue**: Line 56 - the profile query uses `id` but should use `user_id`:
```typescript
let { data: profile, error: profileError } = await supabase
  .from("profiles")
  .select("id")
  .eq("id", user.id)  // DEFECT: Should check user_id, not id
  .single();
```

**Impact**: Profile lookup fails, falls through to create new profile.

---

## SUMMARY OF DEFECTS

| Priority | Category | Severity | Description |
|----------|----------|----------|-------------|
| 1 | Security | CRITICAL | RLS allows public invitation enumeration |
| 2 | Functionality | HIGH | emailExists() completely broken |
| 3 | Functionality | HIGH | Profile lookup broken in accept endpoint |
| 4 | Data | HIGH | Activity logging table name wrong (plural vs singular) |
| 5 | Functionality | MEDIUM | No check for existing accounts before invite |
| 6 | Audit | MEDIUM | Resend not logged to activity log |

---

## FIXES REQUIRED

1. Remove permissive RLS policy
2. Fix `emailExists()` function
3. Fix `logInvitationResent()`, `logInvitationCreated()`, `logInvitationAccepted()`, `logInvitationRevoked()` - check actual table name
4. Add email existence check to create endpoint
5. Fix profile lookup in accept endpoint
6. Build and test all endpoints
7. Verify email notifications actually work


