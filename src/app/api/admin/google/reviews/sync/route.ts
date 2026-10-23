/**
 * Google Business Profile reviews sync Ã¢â‚¬â€ admin-triggered (minimal path).
 *
 * POST /api/admin/google/reviews/sync
 *
 * Super-admin only. Reads the stored Google connection via the service-role
 * client, refreshes the access token using the EXISTING canonical OAuth
 * helper, pages through the GBP Reviews API via the EXISTING canonical
 * listReviews(), maps each review through googleReviewToTestimonialInsert()
 * (approved=false, no status/image_url writes), and upserts into
 * public.testimonials keyed on (source, external_id).
 *
 * No scheduled sync, no google_review_sync_runs table. Returns lightweight
 * counters only.
 *
 * NOTE: this is NOT the legacy src/integrations/google-business-profile tree.
 */

import { NextResponse } from "next/server";

// Type workaround: Supabase client types do not include google_connections
// (added by migration 039 which has not been applied). Define locally.
interface GoogleConnectionRow {
  refresh_token: string;
  sync_enabled: boolean;
  connected_at: string;
}

type GoogleConnectionSelect = {
  data: GoogleConnectionRow | null;
  error: { message: string } | null;
};

/**
 * The D-2 canonical migration adds google_account_id / google_location_id to
 * this table; the generated client types predate it, so `.select()` resolves the
 * row to `never`. Widen the local interface to the columns this route actually
 * reads. Runtime is unaffected.
 */
interface ActiveConnection {
  id?: string;
  refresh_token: string;
  sync_enabled: boolean;
  connected_at: string;
  google_account_id: string | null;
  google_location_id: string | null;
}

/** Narrow a `never`-typed row from an untyped table to the declared shape. */
function asActiveConnection(row: unknown): ActiveConnection | null {
  return (row ?? null) as ActiveConnection | null;
}

/**
 * `testimonials` is a real, typed Drizzle/PostgREST table, but its INSERT/UPDATE
 * payload here is assembled from Google fields (source, external_id,
 * author_photo_url, reviewed_at) that the generated client types predate, so the
 * builder resolves the argument to `never`. These casts are type-only: the shape
 * asserted is the shape the D-2 canonical migration creates.
 */
type GoogleTestimonialInsert = ReturnType<typeof googleReviewToTestimonialInsert>;

/** Row shape written by the Google sync upsert. */
type SyncUpsertRow = NonNullable<GoogleTestimonialInsert> & {
  is_featured: boolean;
  approved: boolean;
};

/**
 * Type-only escape hatch for the two `testimonials` write sites. The generated
 * client types predate the D-2 Google columns, so the builder resolves the
 * payload to `never`. The asserted shape is exactly what the D-2 canonical
 * migration creates. No runtime effect.
 */
function testimonialWriter(client: unknown) {
  return client as {
    upsert: (
      rows: SyncUpsertRow[],
      opts: { onConflict: string }
    ) => Promise<{ error: { message: string } | null }>;
    update: (
      values: { last_sync_at: string }
    ) => { eq: (col: string, val: string) => Promise<unknown> };
  };
}

import { withSuperAdminAuth } from "@/lib/auth/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  refreshAccessToken,
  isGoogleBPConfigured,
} from "@/lib/integrations/google-business-profile";
import {
  listReviews,
  googleReviewToTestimonialInsert,
  type GoogleBPApiError,
} from "@/lib/integrations/google-business-profile/reviews";

export const dynamic = "force-dynamic";

interface SyncCounts {
  seen: number;
  created: number;
  updated: number;
  skipped: number;
}

export const POST = withSuperAdminAuth(async (req, { params }, auth) => {
  if (!isGoogleBPConfigured()) {
    return NextResponse.json(
      {
        success: false,
        error: "Google Business Profile integration is not configured",
      },
      { status: 503 }
    );
  }

  const admin = getSupabaseAdmin();

  // 1. Load the stored connection (tokens) via the service-role client so the
  //    RLS policy on google_connections is evaluated against the calling admin.
  //    The LOCATION comes from the stored row — the admin's explicit choice on
  //    the Google Business Profile page. Env vars are NOT used as the location
  //    source: they would silently override the selection and make "change
  //    location" a no-op.
  const { data: rawConn, error: connErr } = await admin
    .from("google_connections")
    .select("id, refresh_token, google_account_id, google_location_id")
    .eq("sync_enabled", true)
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const conn = asActiveConnection(rawConn);
  if (connErr || !conn?.refresh_token) {
    console.error("[GBP-SYNC] no connection:", connErr?.message ?? "refresh_token missing");
    return NextResponse.json(
      { success: false, error: "No Google connection configured" },
      { status: 409 }
    );
  }

  // The OAuth callback deliberately stores NULL location ids until the admin
  // confirms which location is ZT Lounge. Sync must refuse rather than guess.
  if (!conn.google_account_id || !conn.google_location_id) {
    return NextResponse.json(
      {
        success: false,
        error:
          "No Google Business Profile location selected — choose the ZT Lounge location first",
        code: "location_required",
      },
      { status: 409 }
    );
  }

  const accountId = conn.google_account_id;
  const locationId = conn.google_location_id;

  // 2. Exchange refresh token for an access token (canonical OAuth helper).
  let token: { access_token: string };
  try {
    token = await refreshAccessToken(conn.refresh_token);
  } catch (e) {
    console.error(
      "[GBP-SYNC] token refresh failed:",
      e instanceof Error ? e.message : String(e)
    );
    return NextResponse.json(
      { success: false, error: "Google authentication failed - reconnect the account" },
      { status: 401 }
    );
  }

  // 3. Page through the GBP Reviews API until nextPageToken is empty.
  const parent = `accounts/${accountId}/locations/${locationId}`;
  const counts: SyncCounts = { seen: 0, created: 0, updated: 0, skipped: 0 };
  let pageToken: string | undefined = undefined;

  try {
    for (;;) {
      const page = await listReviews(token.access_token, parent, pageToken);
      const reviews = page.reviews ?? [];
      counts.seen += reviews.length;

      const toUpsert = reviews
        .map((r) => googleReviewToTestimonialInsert(r))
        .filter((t): t is NonNullable<typeof t> => t !== null);
      counts.skipped += reviews.length - toUpsert.length;

      // Upsert Google rows keyed on (source, external_id). New rows land
      // approved=false; existing rows are refreshed without touching
      // ZT-owned moderation state (onConflict update is content-only).
      const { error: upsertErr } = await testimonialWriter(
        admin.from("testimonials")
      ).upsert(
        toUpsert.map((t) => ({
          ...t,
          is_featured: false,
          approved: false,
        })) as SyncUpsertRow[],
        { onConflict: "source,external_id" }
      );
      if (upsertErr) {
        throw upsertErr;
      }
      counts.created += toUpsert.length; // upsert path; no per-row create/update split

      if (!page.nextPageToken) break;
      pageToken = page.nextPageToken;
    }
  } catch (e) {
    const apiErr = e as GoogleBPApiError | Error;
    console.error(
      "[GBP-SYNC] failed:",
      apiErr instanceof Error ? `${apiErr.name}: ${apiErr.message}` : String(e)
    );
    return NextResponse.json(
      { success: false, error: "Google reviews sync failed", detail: apiErr.message },
      { status: 502 }
    );
  }

  // Record sync health for the GBP page (best-effort; never fails the sync).
  await testimonialWriter(admin.from("google_connections"))
    .update({ last_sync_at: new Date().toISOString() })
    .eq("id", conn?.id ?? "")
    .then(() => undefined, () => undefined);

  return NextResponse.json({
    success: true,
    ...counts,
  });
});


