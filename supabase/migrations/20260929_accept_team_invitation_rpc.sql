-- ============================================================================
-- Phase 2 closure: accept_team_invitation RPC
-- ----------------------------------------------------------------------------
-- Purpose
--   src/app/api/invitations/accept/route.ts already calls
--   accept_team_invitation(...), but the function does not exist in the live
--   database (verified: PostgREST returns PGRST202 "function does not exist").
--   It is also absent from every migration in supabase/migrations. This
--   migration creates it.
--
-- Scope
--   Single object: one function. No table, column, constraint, index, enum,
--   trigger, policy, or seed change. No role rows added or removed.
--
-- Security model
--   * SECURITY DEFINER - required, because the caller is an anonymous invitee
--     who is NOT yet an authenticated user and therefore cannot write
--     profiles/invitations under RLS.
--   * Role is NEVER taken from client input. There is no p_role parameter. The
--     role is read from the invitation row (inv.role_id) and the resolved role
--     name must be exactly 'admin'. Anything else is rejected. This is the
--     invariant that makes escalation impossible.
--   * Email matching is enforced in-database, so the RPC cannot be used to
--     accept somebody else's invitation.
--   * Single use: only status='pending' AND accepted_at IS NULL is eligible.
--     A second attempt raises and changes nothing.
--   * Atomicity: profile upsert + invitation status update are in one function
--     body, i.e. one transaction. Both land or neither.
--   * EXECUTE is revoked from PUBLIC/anon/authenticated and granted only to
--     service_role, so it is not a general-purpose role-assignment RPC.
--
-- Dependencies (verified against supabase/migrations):
--   profiles(id, user_id, full_name, role_id, is_active, created_at, updated_at)
--   invitations(id, email, role_id, token_hash, status, full_name,
--                expires_at, accepted_at)
--   roles(id, name)
--
-- CREATE OR REPLACE makes the migration re-runnable without error.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.accept_team_invitation(
    p_token_hash   text,
    p_auth_user_id uuid,
    p_email        text,
    p_full_name    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invitation  public.invitations%ROWTYPE;
    v_role_name   text;
    v_role_id     uuid;
    v_profile_id  uuid;
BEGIN
    ------------------------------------------------------------------
    -- 1. Argument validation
    ------------------------------------------------------------------
    IF p_token_hash IS NULL OR btrim(p_token_hash) = '' THEN
        RAISE EXCEPTION 'invalid_request: token_hash is required'
            USING ERRCODE = '22023';
    END IF;

    IF p_auth_user_id IS NULL THEN
        RAISE EXCEPTION 'invalid_request: auth_user_id is required'
            USING ERRCODE = '22023';
    END IF;

    IF p_email IS NULL OR btrim(p_email) = '' THEN
        RAISE EXCEPTION 'invalid_request: email is required'
            USING ERRCODE = '22023';
    END IF;

    ------------------------------------------------------------------
    -- 2. Locate invitation by token hash. FOR UPDATE serialises
    --    concurrent accept attempts on the same row.
    ------------------------------------------------------------------
    SELECT * INTO v_invitation
    FROM public.invitations
    WHERE token_hash = p_token_hash
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'invitation_not_found' USING ERRCODE = 'P0002';
    END IF;

    ------------------------------------------------------------------
    -- 3. State check - single use
    ------------------------------------------------------------------
    IF v_invitation.status IS DISTINCT FROM 'pending'
       OR v_invitation.accepted_at IS NOT NULL THEN
        RAISE EXCEPTION 'invitation_already_accepted' USING ERRCODE = 'P0001';
    END IF;

    ------------------------------------------------------------------
    -- 4. Expiry check (NULL expires_at = non-expiring)
    ------------------------------------------------------------------
    IF v_invitation.expires_at IS NOT NULL
       AND v_invitation.expires_at <= now() THEN
        RAISE EXCEPTION 'invitation_expired' USING ERRCODE = 'P0001';
    END IF;

    ------------------------------------------------------------------
    -- 5. Email must match the invitation
    ------------------------------------------------------------------
    IF lower(btrim(v_invitation.email)) IS DISTINCT FROM lower(btrim(p_email)) THEN
        RAISE EXCEPTION 'invitation_email_mismatch' USING ERRCODE = 'P0001';
    END IF;

    ------------------------------------------------------------------
    -- 6. Resolve the role FROM THE INVITATION, never from the client.
    --    The invitee is always 'admin'. super_admin / manager /
    --    receptionist / staff / customer are refused.
    ------------------------------------------------------------------
    SELECT r.id, r.name INTO v_role_id, v_role_name
    FROM public.roles r
    WHERE r.id = v_invitation.role_id;

    IF v_role_id IS NULL THEN
        RAISE EXCEPTION 'invitation_role_invalid' USING ERRCODE = 'P0001';
    END IF;

    IF v_role_name IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'invitation_role_not_permitted: %', v_role_name
            USING ERRCODE = 'P0001';
    END IF;

    ------------------------------------------------------------------
    -- 7. Create / update the profile in the same transaction.
    --    role_id comes from the invitation; is_active is forced true.
    --    The client cannot influence either.
    ------------------------------------------------------------------
    INSERT INTO public.profiles (id, user_id, full_name, role_id, is_active)
    VALUES (
        p_auth_user_id,
        p_auth_user_id,
        COALESCE(NULLIF(btrim(p_full_name), ''), btrim(p_email)),
        v_role_id,
        true
    )
    ON CONFLICT (id) DO UPDATE
        SET full_name = COALESCE(NULLIF(btrim(p_full_name), ''), EXCLUDED.full_name),
            role_id    = v_role_id,
            is_active  = true,
            updated_at = now()
    RETURNING id INTO v_profile_id;

    ------------------------------------------------------------------
    -- 8. Mark the invitation accepted (same transaction as step 7)
    ------------------------------------------------------------------
    UPDATE public.invitations
    SET status      = 'accepted',
        accepted_at = now()
    WHERE id = v_invitation.id;

    ------------------------------------------------------------------
    -- 9. Return a minimal, non-privileged result
    ------------------------------------------------------------------
    RETURN jsonb_build_object(
        'ok',         true,
        'profile_id', v_profile_id,
        'role_id',    v_role_id,
        'role',       v_role_name
    );
END;
$$;

COMMENT ON FUNCTION public.accept_team_invitation(text, uuid, text, text)
    IS 'Accepts a pending staff invitation and creates/updates the matching profile. SECURITY DEFINER: the caller is an unauthenticated invitee. The assigned role is read from the invitation row and must be ''admin''; no client-supplied role is honoured. Idempotence is enforced by the pending/accepted_at state check under FOR UPDATE.';

-- ---------------------------------------------------------------------------
-- Privileges: do not leave a general-purpose role-assignment RPC callable by
-- PUBLIC / anon / authenticated. Only the service role the API route uses.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.accept_team_invitation(text, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_team_invitation(text, uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.accept_team_invitation(text, uuid, text, text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.accept_team_invitation(text, uuid, text, text) TO service_role;
