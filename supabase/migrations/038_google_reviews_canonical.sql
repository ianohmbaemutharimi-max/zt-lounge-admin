-- ============================================================
-- Migration 038 — Google Business Profile reviews: canonical schema
-- (fix loop: CLEAN GBP API PATH)
--
-- Relationship to the legacy design:
--   The public tree contains `033_google_reviews_integration.sql` (untracked,
--   never verified as applied). It is NOT copied here. Corrections made:
--     1. NO `testimonials.status` column and no reference to it — moderation
--        uses the existing `approved` boolean (033's RLS referenced a `status`
--        column that nothing defines and would fail if applied verbatim).
--     2. NO dependency on a pre-existing `is_manager_or_above()` helper —
--        this migration ships its own SECURITY DEFINER helper under a
--        collision-safe name.
--     3. `google_connections.google_location_id` is NULLABLE — resolving the
--        location requires the first real GBP API call (a later loop). The
--        unique constraint still applies whenever the id is set.
--     4. `google_review_sync_runs` uses the counters required by the clean
--        path: reviews_seen / reviews_created / reviews_updated / reviews_failed.
--
-- Source-of-truth contract encoded here:
--   GOOGLE-OWNED (sync-managed, never client-writable):
--     source, external_id, external_url, author_photo_url, reviewed_at,
--     last_synced_at, customer_name, rating, comment
--   ZT-ADMIN-OWNED (moderation):
--     approved, is_featured, display_order, page_id
--
-- Idempotent, additive, non-destructive: every statement is IF NOT EXISTS /
-- OR REPLACE; no existing testimonials rows or columns are dropped or altered.
-- ============================================================

-- ------------------------------------------------------------
-- PART 1 — testimonials: Google-owned identity columns
-- ------------------------------------------------------------

ALTER TABLE testimonials
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual'
    CHECK (source IN ('manual', 'google')),
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS external_url text,
  ADD COLUMN IF NOT EXISTS author_photo_url text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

-- Idempotency: one row per Google review. Partial index (NULL external_id
-- rows — manual testimonials — are unconstrained).
CREATE UNIQUE INDEX IF NOT EXISTS idx_testimonials_source_external_id
  ON testimonials (source, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_testimonials_source_google
  ON testimonials (source) WHERE source = 'google';

CREATE INDEX IF NOT EXISTS idx_testimonials_last_synced
  ON testimonials (last_synced_at) WHERE source = 'google';

COMMENT ON COLUMN testimonials.source IS 'Origin of the testimonial: manual (created outside Google) or google (synced from Google Business Profile). Google-owned for google rows.';
COMMENT ON COLUMN testimonials.external_id IS 'Google reviewId — the stable external identity used for idempotent sync. Google-owned.';
COMMENT ON COLUMN testimonials.external_url IS 'Link to the original Google review resource. Google-owned.';
COMMENT ON COLUMN testimonials.author_photo_url IS 'Google reviewer profilePhotoUrl (remote Google asset; not copied into ZT storage). Google-owned.';
COMMENT ON COLUMN testimonials.reviewed_at IS 'Google review createTime (NOT the local created_at). Google-owned.';
COMMENT ON COLUMN testimonials.last_synced_at IS 'Last successful sync of this Google review into this row. ZT-owned bookkeeping.';

-- ------------------------------------------------------------
-- PART 2 — self-contained manager/above RLS helper
-- (SECURITY DEFINER so the role subquery is not subject to the
--  calling user''s RLS; collision-safe name — no dependency on
--  any pre-existing helper.)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION google_reviews_is_manager_or_above()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles p
    JOIN roles r ON r.id = p.role_id
    WHERE p.user_id = auth.uid()
      AND p.is_active = true
      AND r.name IN ('super_admin', 'admin', 'manager')
  );
$$;

-- ------------------------------------------------------------
-- PART 3 — google_connections (server-side OAuth storage)
-- Tokens are stored here ONLY; they are never selected by any
-- admin API response (the route layer projects token-free
-- columns explicitly).
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS google_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- OAuth tokens (server-only; never exposed to the browser)
  refresh_token text NOT NULL,
  access_token text,
  token_expires_at timestamptz,

  -- Google Business Profile identifiers (resolved by the location
  -- confirmation step in a later loop; NULL until then)
  google_account_id text,
  google_location_id text,
  google_location_name text,

  -- Connection metadata
  connected_at timestamptz DEFAULT now(),
  connected_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  last_sync_at timestamptz,
  sync_enabled boolean DEFAULT true,

  -- Audit
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- One connection per Google location once resolved
  CONSTRAINT unique_google_location UNIQUE (google_location_id)
);

ALTER TABLE google_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "google_connections_manager_manage" ON google_connections;
CREATE POLICY "google_connections_manager_manage"
  ON google_connections
  FOR ALL
  USING (google_reviews_is_manager_or_above())
  WITH CHECK (google_reviews_is_manager_or_above());

CREATE INDEX IF NOT EXISTS idx_google_connections_location_id
  ON google_connections (google_location_id);
CREATE INDEX IF NOT EXISTS idx_google_connections_sync_enabled
  ON google_connections (sync_enabled) WHERE sync_enabled = true;
CREATE INDEX IF NOT EXISTS idx_google_connections_last_sync
  ON google_connections (last_sync_at DESC);

COMMENT ON TABLE google_connections IS 'Google Business Profile OAuth connections (server-side only). Tokens are NEVER returned through admin API responses. Distinct from Supabase Auth Google login.';
COMMENT ON COLUMN google_connections.refresh_token IS 'OAuth refresh token (offline access). Server-side only; never client-readable.';
COMMENT ON COLUMN google_connections.google_location_id IS 'GBP location resource id (e.g. locations/12345). Nullable until resolved by the location-confirmation step.';

-- updated_at trigger
CREATE OR REPLACE FUNCTION google_connections_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS google_connections_updated_at ON google_connections;
CREATE TRIGGER google_connections_updated_at
  BEFORE UPDATE ON google_connections
  FOR EACH ROW
  EXECUTE FUNCTION google_connections_set_updated_at();

-- ------------------------------------------------------------
-- PART 4 — google_review_sync_runs (auditable sync foundation)
-- A simple record per sync execution; no job queue.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS google_review_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES google_connections (id) ON DELETE CASCADE,

  -- Execution metadata
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),

  -- Counters (clean-path naming)
  reviews_seen integer DEFAULT 0,    -- total reviews returned by the GBP API
  reviews_created integer DEFAULT 0, -- new testimonials inserted (always approved = false)
  reviews_updated integer DEFAULT 0, -- existing Google testimonials refreshed
  reviews_failed integer DEFAULT 0,  -- per-review processing failures

  -- Error tracking (never includes tokens or secrets)
  error_message text,
  error_details jsonb,

  -- Audit
  triggered_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE google_review_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "google_sync_runs_manager_read" ON google_review_sync_runs;
CREATE POLICY "google_sync_runs_manager_read"
  ON google_review_sync_runs
  FOR SELECT
  USING (google_reviews_is_manager_or_above());

CREATE INDEX IF NOT EXISTS idx_sync_runs_connection_id
  ON google_review_sync_runs (connection_id);
CREATE INDEX IF NOT EXISTS idx_sync_runs_status
  ON google_review_sync_runs (status);
CREATE INDEX IF NOT EXISTS idx_sync_runs_started_at
  ON google_review_sync_runs (started_at DESC);

COMMENT ON TABLE google_review_sync_runs IS 'Audit trail for Google review sync runs. One row per execution; counters diagnose seen/created/updated/failed.';
COMMENT ON COLUMN google_review_sync_runs.reviews_created IS 'New testimonials inserted — always approved = false (moderation required).';

-- ------------------------------------------------------------
-- MIGRATION COMPLETE — no data modified, no columns dropped.
-- Deliberately ABSENT (corrections vs the legacy 033 design):
--   - no `testimonials.status` column or reference (moderation = `approved`)
--   - no `media_id` / `status` assumptions on testimonials
--   - no RLS changes on testimonials (existing live policies untouched)
-- ============================================================

