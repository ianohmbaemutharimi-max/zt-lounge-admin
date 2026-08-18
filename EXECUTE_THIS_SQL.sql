-- ============================================================
-- SUPABASE SQL EDITOR: Execute this to reload PostgREST cache
-- ============================================================
-- 
-- INSTRUCTIONS:
-- 1. Go to: https://supabase.com/dashboard
-- 2. Select: ZT Lounge project (jczwilrysvnhcjzjztbi)
-- 3. Open: SQL Editor
-- 4. Paste this entire file
-- 5. Click: Run
-- 6. Wait: 10-30 seconds
-- 7. Return here and confirm
--
-- Source: https://supabase.com/docs/guides/troubleshooting/refresh-postgrest-schema
-- ============================================================

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- Verify tables exist
SELECT 
  table_name,
  table_type
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('media_assets', 'media_usage')
ORDER BY table_name;

-- Check table grants
SELECT 
  grantee,
  table_name,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('media_assets', 'media_usage')
ORDER BY table_name, grantee;
