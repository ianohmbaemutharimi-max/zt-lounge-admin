/**
 * Google Business Profile Reviews Integration - TypeScript Types
 * 
 * All types for Google OAuth, API responses, and database models.
 * NO hard-coded credentials or business identifiers.
 */

// ============================================================
// Google OAuth Types
// ============================================================

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface GoogleOAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number; // Seconds until expiration (typically 3600)
  scope: string;
  token_type: 'Bearer';
}

export interface GoogleOAuthError {
  error: string;
  error_description?: string;
}

// ============================================================
// Google Business Profile API Types
// ============================================================

/**
 * Star rating enum from Google Business Profile API
 * Maps to 1-5 integer in our testimonials table
 */
export enum GoogleStarRating {
  ONE = 'ONE',
  TWO = 'TWO',
  THREE = 'THREE',
  FOUR = 'FOUR',
  FIVE = 'FIVE',
}

/**
 * Google reviewer information
 */
export interface GoogleReviewer {
  profilePhotoUrl?: string;
  displayName: string;
  isAnonymous: boolean;
}

/**
 * Review reply from business owner (optional)
 */
export interface GoogleReviewReply {
  comment: string;
  updateTime: string; // ISO 8601 timestamp
}

/**
 * Complete Google review structure from API response
 * Resource name format: "accounts/{accountId}/locations/{locationId}/reviews/{reviewId}"
 */
export interface GoogleReview {
  name: string; // Full resource name
  reviewId: string;
  reviewer: GoogleReviewer;
  starRating: GoogleStarRating;
  comment?: string;
  createTime: string; // ISO 8601 timestamp
  updateTime: string; // ISO 8601 timestamp
  reviewReply?: GoogleReviewReply;
}

/**
 * Google API list response for reviews
 */
export interface GoogleReviewsListResponse {
  reviews?: GoogleReview[];
  nextPageToken?: string;
  totalSize?: number;
}

/**
 * Google Business Profile location information
 * Retrieved after OAuth to resolve location IDs dynamically
 */
export interface GoogleLocation {
  name: string; // Resource name: "locations/{locationId}"
  locationName?: string; // Human-readable name
  title?: string;
  phoneNumbers?: {
    primaryPhone?: string;
  };
  websiteUri?: string;
}

/**
 * Google account information
 */
export interface GoogleAccount {
  name: string; // Resource name: "accounts/{accountId}"
  accountName?: string;
  type?: string;
  role?: string;
}

// ============================================================
// Database Model Types (Supabase)
// ============================================================

/**
 * Google connection record stored in database
 * Contains OAuth tokens and business-specific Google identifiers
 * NO hard-coded credentials - all runtime data
 */
export interface GoogleConnection {
  id: string;
  refresh_token: string; // Encrypted at rest, server-side only
  access_token?: string; // Short-lived, refreshed automatically
  token_expires_at?: string; // ISO 8601 timestamp
  google_account_id?: string; // Resolved after OAuth, NOT hard-coded
  google_location_id: string; // Resolved after OAuth, NOT hard-coded
  google_location_name?: string; // Human-readable location name
  connected_at: string;
  connected_by?: string; // User ID who connected
  last_sync_at?: string;
  sync_enabled: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Sync run record for observability
 * Tracks each sync execution with statistics and errors
 */
export interface GoogleReviewSyncRun {
  id: string;
  connection_id: string;
  started_at: string;
  completed_at?: string;
  status: 'running' | 'completed' | 'failed';
  reviews_fetched: number;
  reviews_created: number;
  reviews_updated: number;
  reviews_skipped: number;
  error_message?: string;
  error_details?: Record<string, unknown>;
  triggered_by?: string; // User ID who triggered sync
  created_at: string;
}

/**
 * Enhanced testimonial type with Google integration fields
 * Extends existing testimonials table schema
 */
export interface Testimonial {
  id: string;
  customer_name: string;
  comment: string;
  rating: number; // 1-5
  image_url?: string;
  occupation?: string;
  is_featured: boolean;
  approved?: boolean; // Legacy field
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  display_order: number;
  page_id?: string;
  
  // Google integration fields (new in migration 033)
  source: 'manual' | 'google';
  external_id?: string; // Google review ID
  external_url?: string; // Link to Google review
  author_photo_url?: string; // Google reviewer avatar
  reviewed_at?: string; // Original Google review timestamp
  last_synced_at?: string; // Last sync timestamp
  
  // Generated columns (for UI compatibility)
  customername?: string;
  content?: string;
  isfeatured?: boolean;
  createdat?: string;
  is_approved?: boolean;
}

// ============================================================
// Mapper Types (Google → Testimonial transformation)
// ============================================================

/**
 * Input for mapping Google review to testimonial
 */
export interface GoogleReviewMapperInput {
  review: GoogleReview;
  connectionId: string;
}

/**
 * Output from mapper - ready to insert/update in testimonials table
 * Always includes status='pending' and is_featured=false
 */
export interface MappedTestimonial {
  customer_name: string;
  comment: string;
  rating: number; // Converted from GoogleStarRating to 1-5
  image_url?: string;
  source: 'google';
  external_id: string;
  external_url: string;
  author_photo_url?: string;
  reviewed_at: string;
  last_synced_at: string;
  status: 'pending'; // ALWAYS pending, never auto-approve
  is_featured: false; // ALWAYS false initially
  approved: false; // Legacy field
}

// ============================================================
// API Route Types
// ============================================================

/**
 * Request body for initiating OAuth connection
 */
export interface ConnectGoogleRequest {
  // No body needed - generates OAuth URL
}

/**
 * Response from /connect endpoint
 */
export interface ConnectGoogleResponse {
  authUrl: string;
  state: string; // CSRF protection token
}

/**
 * Query parameters from Google OAuth callback
 */
export interface GoogleCallbackQuery {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}

/**
 * Response from /callback endpoint (success)
 */
export interface GoogleCallbackSuccessResponse {
  success: true;
  connectionId: string;
  locationId: string;
  locationName?: string;
}

/**
 * Response from /callback endpoint (error)
 */
export interface GoogleCallbackErrorResponse {
  success: false;
  error: string;
  error_description?: string;
}

/**
 * Request body for triggering sync
 */
export interface SyncGoogleReviewsRequest {
  connectionId?: string; // Optional - defaults to active connection
}

/**
 * Response from /sync endpoint
 */
export interface SyncGoogleReviewsResponse {
  success: boolean;
  syncRunId: string;
  reviews_fetched: number;
  reviews_created: number;
  reviews_updated: number;
  reviews_skipped: number;
  error?: string;
}

/**
 * Response from /status endpoint
 */
export interface GoogleConnectionStatusResponse {
  connected: boolean;
  connection?: {
    id: string;
    location_id: string;
    location_name?: string;
    connected_at: string;
    last_sync_at?: string;
    sync_enabled: boolean;
  };
  lastSyncRun?: {
    id: string;
    status: 'running' | 'completed' | 'failed';
    started_at: string;
    completed_at?: string;
    reviews_fetched: number;
    reviews_created: number;
    reviews_updated: number;
    error_message?: string;
  };
}

// ============================================================
// Error Types
// ============================================================

/**
 * Custom error for Google integration operations
 */
export class GoogleIntegrationError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'GoogleIntegrationError';
  }
}

/**
 * Error codes for Google integration
 */
export enum GoogleErrorCode {
  OAUTH_FAILED = 'OAUTH_FAILED',
  TOKEN_REFRESH_FAILED = 'TOKEN_REFRESH_FAILED',
  API_REQUEST_FAILED = 'API_REQUEST_FAILED',
  INVALID_CONFIGURATION = 'INVALID_CONFIGURATION',
  NO_CONNECTION = 'NO_CONNECTION',
  SYNC_FAILED = 'SYNC_FAILED',
  MAPPING_FAILED = 'MAPPING_FAILED',
  DATABASE_ERROR = 'DATABASE_ERROR',
}

// ============================================================
// Configuration Validation Types
// ============================================================

/**
 * Validates that all required environment variables are present
 */
export interface EnvironmentConfig {
  googleClientId: string;
  googleClientSecret: string;
  googleRedirectUri: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
}

/**
 * Type guard to check if environment config is valid
 */
export function isValidEnvironmentConfig(
  config: Partial<EnvironmentConfig>
): config is EnvironmentConfig {
  return !!(
    config.googleClientId &&
    config.googleClientSecret &&
    config.googleRedirectUri &&
    config.supabaseUrl &&
    config.supabaseServiceRoleKey
  );
}

// ============================================================
// Sync Options
// ============================================================

/**
 * Options for sync operation
 */
export interface SyncOptions {
  maxReviews?: number; // Limit number of reviews to fetch (for testing)
  skipPagination?: boolean; // Fetch only first page
  forceRefresh?: boolean; // Ignore cached tokens
}

/**
 * Result of individual review sync
 */
export interface ReviewSyncResult {
  reviewId: string;
  action: 'created' | 'updated' | 'skipped';
  error?: string;
}

/**
 * Detailed sync result
 */
export interface SyncResult {
  success: boolean;
  syncRunId: string;
  totalFetched: number;
  results: ReviewSyncResult[];
  error?: string;
}
