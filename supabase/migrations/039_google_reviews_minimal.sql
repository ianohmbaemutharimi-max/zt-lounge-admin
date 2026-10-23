-- ============================================================
-- Migration 039 — Google Business Profile reviews: minimal schema
-- (minimal path: admin-triggered sync, no run table)
--
-- This migration provides the absolute minimum DB prerequisites for the
-- Google-only testimonial ingestion path:
--   * the canonical sync-only columns on testimonials
--   * the idempotency index keyed on (source, external_id)
--   * the google_connections table required by the EXISTING canonical
--     OAuth code (start -> callback -> connections routes)
--
-- Deliberately ABSENT (per the MINIMAL PATH audit):
--   - no google_review_sync_runs table  (no scheduled sync / no audit trail)
--   - no last_synced_at column on testimonials
--   - no status column / reference (moderation = approved)
--   - no RLS on testimonials (existing live policies untouched)
--   - no changes to image_url (Google photos stay as author_photo_url)
--
-- Idempotent, additive, non-destructive: every statement is IF NOT EXISTS.
-- ============================================================

-- ------------------------------------------------------------
-- PART 1 — testimonials: canonical sync-only columns
-- ------------------------------------------------------------
ALTER TABLE testimonials
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'google')),
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS external_url text,
  ADD COLUMN IF NOT EXISTS author_photo_url text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

-- Idempotency: one row per Google review. Partial index (NULL external_id
-- rows — manual testimonials — are unconstrained, so manual creation still
-- works).
CREATE UNIQUE INDEX IF NOT EXISTS idx_testimonials_source_external_id
  ON testimonials (source, external_id)
  WHERE external_id IS NOT NULL;

COMMENT ON COLUMN testimonials.source IS 'Origin of the testimonial: manual (created outside Google) or google (synced from Google Business Profile). Google-owned for google rows.';
COMMENT ON COLUMN testimonials.external_id IS 'Google reviewId — the stable external identity used for idempotent sync. Google-owned.';
COMMENT ON COLUMN testimonials.external_url IS 'Link to the original Google review resource. Google-owned.';
COMMENT ON COLUMN testimonials.author_photo_url IS 'Google reviewer profilePhotoUrl (remote Google asset; never copied into ZT storage). Google-owned.';
COMMENT ON COLUMN testimonials.reviewed_at IS 'Google review createTime (NOT the local created_at). Google-owned.';

-- ------------------------------------------------------------
-- PART 2 — google_connections (SERVER-SIDE ONLY)
-- Matches the EXISTING canonical OAuth code exactly:
--   callback inserts: refresh_token, access_token, token_expires_at,
--                     connected_by, sync_enabled
--   connections reads:  id, google_account_id, google_location_id,
--                       google_location_name, connected_at, connected_by,
--                       last_sync_at, sync_enabled, token_expires_at
-- google_account_id / google_location_id are NULLABLE until the
-- location-confirmation step (a later loop) resolves them.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS google_connections (
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

ALTER TABLE google_connections ENABLE ROW LEVEL SECURITY;

-- SECURITY INVARIANT: tokens are never readable by anon/public clients.
-- Reuses the canonical RBAC pattern (see 038/20260824120001):
-- roles.name IN ('super_admin','admin','manager'). The sync route and the
-- connections route both run server-side via the service-role client
-- (getSupabaseAdmin, auth.uid() = the calling admin) so the policy applies
-- to the route's RLS session.
DROP POLICY IF EXISTS "google_connections_read_safe" ON google_connections;
CREATE POLICY "google_connections_read_safe"
  ON google_connections
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON r.id = p.role_id
      WHERE p.user_id = auth.uid()
        AND p.is_active = true
        AND r.name IN ('super_admin', 'admin', 'manager')
    )
  );

-- Managers can INSERT a connection (the OAuth callback stores tokens).
DROP POLICY IF EXISTS "google_connections_insert" ON google_connections;
CREATE POLICY "google_connections_insert"
  ON google_connections
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON r.id = p.role_id
      WHERE p.user_id = auth.uid()
        AND p.is_active = true
        AND r.name IN ('super_admin', 'admin', 'manager')
    )
  );

-- Defense in depth: anon can never reach this table.
REVOKE ALL ON google_connections FROM anon;

COMMENT ON TABLE google_connections IS 'Google Business Profile OAuth connections (server-side only). Tokens are NEVER returned through admin API responses. Distinct from Supabase Auth Google login.';
COMMENT ON COLUMN google_connections.refresh_token IS 'OAuth refresh token (offline access). Server-side only; never client-readable.';
COMMENT ON COLUMN google_connections.access_token IS 'OAuth access token. Server-side only; never client-readable.';

-- MIGRATION COMPLETE — no data modified, no columns dropped.
-- ============================================================
