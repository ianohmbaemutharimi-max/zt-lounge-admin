/**
 * GET/POST /api/admin/google-reviews
 *
 * Single endpoint for Google Reviews management:
 * - GET: returns config + pending reviews + approved featured reviews
 * - POST: saves config + triggers sync
 *
 * Standard admin auth (not super-admin only).
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  fetchGoogleMapsReviews,
  extractPlaceId,
  GoogleMapsApiError,
} from '@/lib/integrations/google-maps-reviews';

// ─── GET: Config + Queue + Preview ─────────────────────────────────────

export const GET = withAdminAuth(async (request: NextRequest) => {
  const admin = getSupabaseAdmin();

  // 1. Fetch config from business_settings
  const { data: settings, error: settingsError } = await admin
    .from('business_settings')
    .select('google_maps_reviews_url, google_reviews_api_key')
    .limit(1)
    .maybeSingle();

  if (settingsError) {
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }

  // 2. Fetch pending Google reviews (approved=false, source='google')
  const { data: pending, error: pendingError } = await admin
    .from('testimonials')
    .select('*')
    .eq('source', 'google')
    .eq('approved', false)
    .order('created_at', { ascending: false });

  if (pendingError) {
    return NextResponse.json(
      { error: 'Failed to fetch pending reviews' },
      { status: 500 }
    );
  }

  // 3. Fetch approved featured reviews (for preview)
  const { data: featured, error: featuredError } = await admin
    .from('testimonials')
    .select('*')
    .eq('source', 'google')
    .eq('approved', true)
    .eq('is_featured', true)
    .order('created_at', { ascending: false })
    .limit(10);

  if (featuredError) {
    return NextResponse.json(
      { error: 'Failed to fetch featured reviews' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    config: {
      google_maps_reviews_url: settings?.google_maps_reviews_url ?? '',
      google_reviews_api_key: settings?.google_reviews_api_key ?? '',
      place_id: extractPlaceId(settings?.google_maps_reviews_url ?? '') ?? '',
    },
    pending: pending ?? [],
    featured: featured ?? [],
    stats: {
      pending_count: pending?.length ?? 0,
      featured_count: featured?.length ?? 0,
    },
  });
});

// ─── POST: Save Config + Sync ──────────────────────────────────────────

export const POST = withAdminAuth(async (request: NextRequest) => {
  const admin = getSupabaseAdmin();

  try {
    const body = await request.json();
    const { google_maps_reviews_url, google_reviews_api_key } = body;

    if (!google_maps_reviews_url || !google_reviews_api_key) {
      return NextResponse.json(
        { error: 'google_maps_reviews_url and google_reviews_api_key are required' },
        { status: 400 }
      );
    }

    // Extract Place ID from URL
    const placeId = extractPlaceId(google_maps_reviews_url);
    if (!placeId) {
      return NextResponse.json(
        { error: 'Invalid Google Maps URL - could not extract Place ID' },
        { status: 400 }
      );
    }

    // 1. Save config to business_settings
    const { error: updateError } = await admin
      .from('business_settings')
      .update({
        google_maps_reviews_url,
        google_reviews_api_key,
        updated_at: new Date().toISOString(),
      })
      .eq('id', body.id ?? '00000000-0000-0000-0000-000000000001'); // Assume single row

    if (updateError) {
      console.error('[google-reviews] Failed to save settings:', updateError);
      return NextResponse.json(
        { error: 'Failed to save settings' },
        { status: 500 }
      );
    }

    // 2. Trigger sync (fetch reviews from Google)
    let syncResult = {
      seen: 0,
      created: 0,
      updated: 0,
      skipped: 0,
    };

    try {
      const reviews = await fetchGoogleMapsReviews(placeId, google_reviews_api_key);
      syncResult.seen = reviews.length;

      // Upsert reviews into testimonials
      if (reviews.length > 0) {
        const { error: upsertError } = await admin
          .from('testimonials')
          .upsert(
            reviews.map((r) => ({
              ...r,
              last_synced_at: new Date().toISOString(),
            })),
            {
              onConflict: 'source,external_id',
              ignoreDuplicates: false,
            }
          );

        if (upsertError) {
          console.error('[google-reviews] Upsert failed:', upsertError);
          return NextResponse.json(
            { error: 'Failed to save reviews to database' },
            { status: 500 }
          );
        }

        syncResult.created = reviews.length; // Approximation (upsert doesn't return per-row status)
      }
    } catch (syncError) {
      if (syncError instanceof GoogleMapsApiError) {
        return NextResponse.json(
          { error: `Google Maps API error: ${syncError.message}` },
          { status: 502 }
        );
      }
      throw syncError;
    }

    return NextResponse.json({
      success: true,
      message: 'Settings saved and reviews synced',
      sync: syncResult,
    });
  } catch (error) {
    console.error('[google-reviews] POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
