/**
 * Google Review → Testimonial Mapper
 */
import {
  GoogleReview,
  GoogleStarRating,
  GoogleReviewMapperInput,
  MappedTestimonial,
  GoogleIntegrationError,
  GoogleErrorCode,
} from './types';

export function convertStarRating(s: GoogleStarRating): number {
  const m: Record<GoogleStarRating, number> = {
    [GoogleStarRating.ONE]: 1,
    [GoogleStarRating.TWO]: 2,
    [GoogleStarRating.THREE]: 3,
    [GoogleStarRating.FOUR]: 4,
    [GoogleStarRating.FIVE]: 5,
  };
  return m[s];
}

export function extractReviewId(name: string): string {
  return name.split('/').pop() || name;
}

export function generateReviewUrl(name: string): string {
  return `https://www.google.com/maps/search/?api=1&review_id=${encodeURIComponent(name)}`;
}

export function mapGoogleReviewToTestimonial(input: GoogleReviewMapperInput): MappedTestimonial {
  const { review } = input;
  const rating = convertStarRating(review.starRating);

  if (rating < 1 || rating > 5) {
    throw new GoogleIntegrationError(
      `Invalid Google star rating: ${review.starRating}`,
      GoogleErrorCode.MAPPING_FAILED
    );
  }

  const authorPhotoUrl = review.reviewer.profilePhotoUrl || undefined;

  return {
    customer_name: review.reviewer.displayName,
    comment: review.comment || '',
    rating,
    image_url: authorPhotoUrl,
    source: 'google',
    external_id: extractReviewId(review.name),
    external_url: generateReviewUrl(review.name),
    author_photo_url: authorPhotoUrl,
    reviewed_at: review.createTime || new Date().toISOString(),
    last_synced_at: new Date().toISOString(),
    status: 'pending',
    is_featured: false,
    approved: false,
  };
}

export function mapGoogleReviewsToTestimonials(reviews: GoogleReview[], connectionId: string): MappedTestimonial[] {
  return reviews.map((review) => mapGoogleReviewToTestimonial({ review, connectionId }));
}

export function validateMappedTestimonial(t: Partial<MappedTestimonial>): boolean {
  if (t.status !== 'pending') {
    throw new GoogleIntegrationError('Google reviews must have status=pending', GoogleErrorCode.MAPPING_FAILED);
  }
  if (t.is_featured !== false) {
    throw new GoogleIntegrationError('Google reviews must have is_featured=false', GoogleErrorCode.MAPPING_FAILED);
  }
  return true;
}
