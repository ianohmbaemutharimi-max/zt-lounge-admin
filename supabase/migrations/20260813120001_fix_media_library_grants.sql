-- ============================================================================
-- FIX: Add missing PostgREST grants for media library tables
-- Migration: 20260813_fix_media_library_grants
-- Issue: PGRST205 - Tables not accessible via REST API
-- Root Cause: Missing authenticator role grants
-- ============================================================================

-- PostgREST requires tables to be granted to the `authenticator` role
-- The authenticator role then switches to anon/authenticated based on JWT

-- Grant table access to authenticator (required for PostgREST)
GRANT USAGE ON SCHEMA public TO authenticator;
GRANT ALL ON TABLE public.media_assets TO authenticator;
GRANT ALL ON TABLE public.media_usage TO authenticator;

-- Grant appropriate access to API roles (follows existing ZT Lounge pattern)
GRANT SELECT ON TABLE public.media_assets TO anon;
GRANT SELECT ON TABLE public.media_assets TO authenticated;
GRANT ALL ON TABLE public.media_assets TO service_role;

GRANT SELECT ON TABLE public.media_usage TO authenticated;
GRANT ALL ON TABLE public.media_usage TO service_role;

-- Grant sequence access (for INSERT operations)
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticator;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Check grants were applied
SELECT 
  grantee,
  table_name,
  privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name IN ('media_assets', 'media_usage')
  AND grantee IN ('authenticator', 'anon', 'authenticated', 'service_role')
ORDER BY table_name, grantee, privilege_type;
