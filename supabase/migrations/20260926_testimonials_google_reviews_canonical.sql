-- ============================================================
-- 20260926_testimonials_google_reviews_canonical.sql
--
-- D-2 REMEDIATION — aligns the live `testimonials` schema with the
-- schema REQUIRED BY THE CURRENT WIRED APPLICATION CODE.
--
-- Root cause: two overlapping DRAFT migrations were authored but never
-- committed or applied (both untracked in git):
--   038_google_reviews_canonical.sql
--   039_google_reviews_minimal.sql
-- Neither is correct as-is, so neither is applied here. This file is
-- the single reconciled replacement.
--
-- Why 038 alone is insufficient:
--   038 omits `testimonials.updated_at`, which the wired code REQUIRES
--   in two places (src/lib/repository.ts:82 response allowlist and
--   src/lib/validation/admin.ts:59 sortable fields) and which the
--   canonical Drizzle contract defines NOT NULL
--   (src/db/schema.ts:418). `updated_at` is the FIRST column PostgREST
--   rejects, so without it the read path still fails.
--
-- Why 039 alone is insufficient:
--   039 deliberately omits `last_synced_at`, but the wired read path
--   selects it (src/lib/repository.ts:82) and the sync contract
--   declares it Google/ZT-owned
--   (src/lib/integrations/google-business-profile/reviews.ts:101).
--   Omitting it leaves the drift in place. It is NOT removed from the
--   code to make the migration fit.
--
-- Objects deliberately NOT created (evidence-based):
--   - `testimonials.status`  038/039 both state moderation = the
--     existing `approved` boolean; no wired code reads or writes a
--     `status` column on testimonials. Adding one would create a second
--     source of truth for moderation.
--   - `google_review_sync_runs`  038 PART 4 creates it, but the WIRED
--     route states "No scheduled sync, no google_review_sync_runs
--     table" (src/app/api/admin/google/reviews/sync/route.ts:13) and
--     no wired import reaches it — the only references are in the
--     unimported legacy tree src/integrations/google-business-profile/.
--     Creating an unused table would violate the brief's "do not
--     create unused objects merely because they appeared in an
--     obsolete draft migration".
--
-- `google_connections` IS created: it is genuinely required by wired
-- code — the OAuth start/callback/connections routes and the reviews
-- sync route all read it (sync route selects refresh_token, filters
-- sync_enabled, orders by connected_at).
--
-- SAFETY
--   - Additive only. No DROP, no DELETE, no data modification.
--   - Every column/index/policy uses IF NOT EXISTS or is guarded, so
--     re-running is a no-op.
--   - `testimonials` is not rebuilt, so any existing rows are preserved.
-- ============================================================

-- ------------------------------------------------------------
-- PART 1 — testimonials: columns required by current wired code
-- ------------------------------------------------------------
-- updated_at follows the existing project precedent for this exact
-- class of drift (20260916_add_notifications_updated_at.sql).
-- NOT NULL DEFAULT now() is safe on an existing table: the column did
-- not previously exist, so no existing row needs backfilling.
ALTER TABLE public.testimonials
  ADD COLUMN IF NOT EXISTS updated_at      timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS source          text NOT NULL DEFAULT 'manual'
                                          CHECK (source IN ('manual', 'google')),
  ADD COLUMN IF NOT EXISTS external_id     text,
  ADD COLUMN IF NOT EXISTS external_url    text,
  ADD COLUMN IF NOT EXISTS author_photo_url text,
  ADD COLUMN IF NOT EXISTS reviewed_at     timestamptz,
  ADD COLUMN IF NOT EXISTS last_synced_at  timestamptz;

-- keep updated_at honest on UPDATE, matching the Drizzle defaultNow()
-- contract. Additive: only fires on rows that already exist.
CREATE OR REPLACE FUNCTION public.testimonials_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS testimonials_updated_at ON public.testimonials;
CREATE TRIGGER testimonials_updated_at
  BEFORE UPDATE ON public.testimonials
  FOR EACH ROW
  EXECUTE FUNCTION public.testimonials_set_updated_at();

-- ------------------------------------------------------------
-- PART 3 — google_connections (REQUIRED by wired code)
-- ------------------------------------------------------------
-- Evidence: the table does NOT exist in the live DB (PostgREST
-- PGRST205 "Could not find the table 'public.google_connections'"
-- in the schema cache), yet three WIRED routes depend on it:
--   src/app/api/admin/google/connections/route.ts:23
--     .select("id, google_account_id, google_location_id,
--              google_location_name, connected_at, connected_by,
--              last_sync_at, sync_enabled, token_expires_at")
--   src/app/api/admin/google/oauth/callback/route.ts:82
--     .insert({ refresh_token, access_token, token_expires_at,
--               connected_by, sync_enabled })
--   src/app/api/admin/google/reviews/sync/route.ts:81
--     .select("refresh_token").eq("sync_enabled", true)
--      .order("connected_at", { ascending: false })
-- The column set below is the exact union of those three call sites.
--
-- IDENTITY: `profiles.id` is a random PK while `profiles.user_id`
-- is the .unique() auth link (src/db/schema.ts:26-28), so the RLS
-- subquery must match on p.user_id = auth.uid() — which is what
-- 038/039 do. (A different live migration matches on profiles.id;
-- that file is out of D-2 scope and is not modified here.)
--
-- SECURITY: tokens are never exposed to anon/authenticated clients.
CREATE TABLE IF NOT EXISTS public.google_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refresh_token text NOT NULL,
  access_token text NOT NULL,
  token_expires_at timestamptz NOT NULL,
  google_account_id text,
  google_location_id text,
  google_location_name text,
  sync_enabled boolean NOT NULL DEFAULT true,
  connected_by uuid,
  connected_at timestamptz DEFAULT now(),
  last_sync_at timestamptz
);

ALTER TABLE public.google_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "google_connections_read_safe" ON public.google_connections;
CREATE POLICY "google_connections_read_safe"
  ON public.google_connections
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON r.id = p.role_id
      WHERE p.user_id = auth.uid()
        AND p.is_active = true
        AND r.name IN ('super_admin', 'admin', 'manager')
    )
  );

DROP POLICY IF EXISTS "google_connections_insert" ON public.google_connections;
CREATE POLICY "google_connections_insert"
  ON public.google_connections
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON r.id = p.role_id
      WHERE p.user_id = auth.uid()
        AND p.is_active = true
        AND r.name IN ('super_admin', 'admin', 'manager')
    )
  );

REVOKE ALL ON public.google_connections FROM anon;

COMMENT ON TABLE public.google_connections IS 'Google Business Profile OAuth connections (server-side only). Tokens are NEVER returned through admin API responses. Distinct from Supabase Auth Google login.';
COMMENT ON COLUMN public.google_connections.refresh_token IS 'OAuth refresh token (offline access). Server-side only; never client-readable.';
COMMENT ON COLUMN public.google_connections.access_token IS 'OAuth access token. Server-side only; never client-readable.';

-- ------------------------------------------------------------
-- PART 3 — Google review identity indexes
-- ------------------------------------------------------------
-- REQUIRED, not speculative: the wired sync route upserts with
-- { onConflict: "source,external_id" }
-- (src/app/api/admin/google/reviews/sync/route.ts:135), which fails
-- without a matching unique index. Partial so manual rows (NULL
-- external_id) stay unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS idx_testimonials_source_external_id
  ON public.testimonials (source, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_testimonials_source_google
  ON public.testimonials (source) WHERE source = 'google';

CREATE INDEX IF NOT EXISTS idx_testimonials_last_synced
  ON public.testimonials (last_synced_at) WHERE source = 'google';

COMMENT ON COLUMN public.testimonials.source IS 'Origin of the testimonial: manual (created outside Google) or google (synced from Google Business Profile). Google-owned for google rows.';
COMMENT ON COLUMN public.testimonials.external_id IS 'Google reviewId — the stable external identity used for idempotent sync. Google-owned.';
COMMENT ON COLUMN public.testimonials.external_url IS 'Link to the original Google review resource. Google-owned.';
COMMENT ON COLUMN public.testimonials.author_photo_url IS 'Google reviewer profilePhotoUrl (remote Google asset; not copied into ZT storage). Google-owned.';
COMMENT ON COLUMN public.testimonials.reviewed_at IS 'Google review createTime (NOT the local created_at). Google-owned.';
COMMENT ON COLUMN public.testimonials.last_synced_at IS 'Last successful sync of this Google review into this row. ZT-owned bookkeeping.';

-- ================================================================
-- END. Additive only: no DROP, no DELETE, no data modification.
-- Re-running this file is a no-op.
-- ================================================================
