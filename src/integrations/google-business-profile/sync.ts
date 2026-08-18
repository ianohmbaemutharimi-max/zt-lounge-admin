/**
 * Google Review Sync Orchestrator
 * 
 * Idempotent synchronization of Google reviews to testimonials.
 * Every imported review gets status='pending' and is_featured=false.
 */

import { createClient } from '@supabase/supabase-js';
import {
  GoogleConnection,
  GoogleReviewSyncRun,
  MappedTestimonial,
  SyncResult,
  ReviewSyncResult,
  GoogleIntegrationError,
  GoogleErrorCode,
} from './types';
import { fetchGoogleReviewsPage } from './client';
import { mapGoogleReviewToTestimonial, validateMappedTestimonial } from './mapper';
import { getValidAccessToken, getSupabaseServiceClient } from './oauth';

const syncRunCreateFields = 'connection_id,status,started_at,triggered_by';
const testimonialUpsertFields = 'customer_name,comment,rating,image_url,source,external_id,external_url,author_photo_url,reviewed_at,last_synced_at,status,is_featured,approved';

/** Collect every page of reviews for a location into a single array. */
async function fetchAllGoogleReviews(
  accessToken: string,
  locationId: string,
  maxReviews?: number
) {
  const allReviews = [];
  let pageToken: string | undefined;
  do {
    const page = await fetchGoogleReviewsPage(accessToken, locationId, pageToken);
    allReviews.push(...(page.reviews ?? []));
    pageToken = page.nextPageToken;
    if (maxReviews && allReviews.length >= maxReviews) break;
  } while (pageToken);
  return maxReviews ? allReviews.slice(0, maxReviews) : allReviews;
}

export async function createSyncRun(connectionId: string, triggeredBy?: string): Promise<GoogleReviewSyncRun> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('google_review_sync_runs')
    .insert({ connection_id: connectionId, triggered_by: triggeredBy, status: 'running' })
    .select('id,connection_id,status,started_at')
    .single();
  if (error) throw new GoogleIntegrationError('Failed to create sync run', GoogleErrorCode.DATABASE_ERROR, { error });
  return data as GoogleReviewSyncRun;
}

export async function updateSyncRun(runId: string, updates: Partial<GoogleReviewSyncRun>): Promise<void> {
  const supabase = getSupabaseServiceClient();
  const { error } = await supabase.from('google_review_sync_runs').update(updates).eq('id', runId);
  if (error) throw new GoogleIntegrationError('Failed to update sync run', GoogleErrorCode.DATABASE_ERROR, { error });
}

export async function syncGoogleReviews(connection: GoogleConnection, userId?: string, maxReviews?: number): Promise<SyncResult> {
  const run = await createSyncRun(connection.id, userId);
  const accessToken = await getValidAccessToken(connection);
  const reviews = await fetchAllGoogleReviews(accessToken, connection.google_location_id, maxReviews);

  let created = 0, updated = 0, skipped = 0;
  const results: ReviewSyncResult[] = [];
  const supabase = getSupabaseServiceClient();

  for (const review of reviews) {
    const extId = review.name.split('/').pop() || review.name;
    try {
      const mapped = mapGoogleReviewToTestimonial({ review, connectionId: connection.id });
      validateMappedTestimonial(mapped);

      const { data: existing } = await supabase
        .from('testimonials')
        .select('id')
        .eq('source', 'google')
        .eq('external_id', extId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase.from('testimonials').update({
          customer_name: mapped.customer_name, comment: mapped.comment, rating: mapped.rating,
          image_url: mapped.image_url, external_url: mapped.external_url,
          author_photo_url: mapped.author_photo_url, reviewed_at: mapped.reviewed_at,
          last_synced_at: mapped.last_synced_at,
        }).eq('id', existing.id);
        if (error) throw error;
        updated++;
        results.push({ reviewId: extId, action: 'updated' });
      } else {
        const { error } = await supabase.from('testimonials').insert(mapped).select('id').single();
        if (error) throw error;
        created++;
        results.push({ reviewId: extId, action: 'created' });
      }
    } catch (e) {
      skipped++;
      results.push({ reviewId: extId, action: 'skipped', error: e instanceof Error ? e.message : 'Unknown' });
    }
  }

  await supabase.from('google_connections').update({ last_sync_at: new Date().toISOString() }).eq('id', connection.id);

  await updateSyncRun(run.id, {
    completed_at: new Date().toISOString(), status: 'completed',
    reviews_fetched: reviews.length, reviews_created: created,
    reviews_updated: updated, reviews_skipped: skipped,
  });

  return { success: true, syncRunId: run.id, totalFetched: reviews.length, results, error: undefined };
}
