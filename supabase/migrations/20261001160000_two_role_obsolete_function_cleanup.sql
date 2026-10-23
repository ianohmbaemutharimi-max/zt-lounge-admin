-- ZT Lounge — Two-Role Authorization Model: obsolete-role function cleanup
-- Target: jczwilrysvnhcjzjztbi (canonical). Applied via:
--   supabase db query --linked --project-ref jczwilrysvnhcjzjztbi --file <this file>
-- Never via `supabase db push`.
--
-- Rationale (see PHASE_ROLE_MODEL_CLEANUP_AUDIT.md §C, §G):
--   is_staff()                  -> returns obsolete role 'staff'; 0 dependents
--   demote_admin_to_staff(uuid) -> writes obsolete 'staff' role; self-service escape hatch
--   promote_staff_to_admin(uuid)-> client-reachable role-assignment primitive; 0 app callers
-- All three are orphaned (no policy, trigger, or application caller references them).
-- This removes the only runtime means of re-assigning an obsolete role.
--
-- Explicitly NOT touched: roles rows, user_role enum labels, the 2 manager profiles,
-- the customer role/domain, enforce_profile_role_changes, all 71 RLS policies,
-- is_admin_or_above / is_employee / is_manager_or_above, and all data.

BEGIN;

DROP FUNCTION IF EXISTS public.is_staff();
DROP FUNCTION IF EXISTS public.demote_admin_to_staff(uuid);
DROP FUNCTION IF EXISTS public.promote_staff_to_admin(uuid);

COMMIT;