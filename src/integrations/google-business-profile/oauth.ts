/**
 * Google Business Profile OAuth 2.0 Module
 * 
 * Implements Authorization Code Flow (NOT client_credentials).
 * All credentials from environment variables (NO hard-coding).
 * Tokens stored in database (server-side only, encrypted at rest).
 */

import { createClient } from '@supabase/supabase-js';
import {
  GoogleOAuthConfig,
  GoogleOAuthTokenResponse,
  GoogleOAuthError,
  GoogleConnection,
  GoogleAccount,
  GoogleLocation,
  GoogleIntegrationError,
  GoogleErrorCode,
  isValidEnvironmentConfig,
} from './types';

// ============================================================
// Environment Configuration (NO hard-coded credentials)
// ============================================================

/**
 * Get OAuth configuration from environment variables
 * Validates all required variables are present
 * @throws {GoogleIntegrationError} if configuration is invalid
 */
export function getOAuthConfig(): GoogleOAuthConfig {
  const config = {
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
    googleRedirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  if (!isValidEnvironmentConfig(config)) {
    throw new GoogleIntegrationError(
      'Missing required environment variables for Google OAuth',
      GoogleErrorCode.INVALID_CONFIGURATION,
      {
        missing: Object.entries(config)
          .filter(([_, value]) => !value)
          .map(([key]) => key),
      }
    );
  }

  return {
    clientId: config.googleClientId,
    clientSecret: config.googleClientSecret,
    redirectUri: config.googleRedirectUri,
  };
}

/**
 * Get Supabase service role client for server-side operations
 * NEVER expose service_role key to browser
 */
export function getSupabaseServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new GoogleIntegrationError(
      'Supabase configuration missing',
      GoogleErrorCode.INVALID_CONFIGURATION
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// ============================================================
// OAuth 2.0 Authorization Code Flow
// ============================================================

const GOOGLE_OAUTH_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_BUSINESS_PROFILE_SCOPE = 'https://www.googleapis.com/auth/business.manage';

/**
 * Generate OAuth authorization URL to redirect user to Google consent screen
 * @param state CSRF protection token (should be stored in session)
 * @returns Authorization URL for user redirection
 */
export function generateAuthorizationUrl(state: string): string {
  const config = getOAuthConfig();

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: GOOGLE_BUSINESS_PROFILE_SCOPE,
    access_type: 'offline', // Request refresh token
    prompt: 'consent', // Force consent screen to get refresh token
    state: state, // CSRF protection
  });

  return `${GOOGLE_OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for OAuth tokens
 * @param code Authorization code from Google callback
 * @returns OAuth tokens (access_token and refresh_token)
 * @throws {GoogleIntegrationError} if token exchange fails
 */
export async function exchangeCodeForTokens(
  code: string
): Promise<GoogleOAuthTokenResponse> {
  const config = getOAuthConfig();

  const body = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: 'authorization_code',
  });

  try {
    const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      const error = data as GoogleOAuthError;
      throw new GoogleIntegrationError(
        `OAuth token exchange failed: ${error.error_description || error.error}`,
        GoogleErrorCode.OAUTH_FAILED,
        { response: data }
      );
    }

    const tokenResponse = data as GoogleOAuthTokenResponse;

    // Validate we got a refresh token (required for long-term access)
    if (!tokenResponse.refresh_token) {
      throw new GoogleIntegrationError(
        'No refresh token received. User may need to revoke previous access and reconnect.',
        GoogleErrorCode.OAUTH_FAILED,
        { response: tokenResponse }
      );
    }

    return tokenResponse;
  } catch (error) {
    if (error instanceof GoogleIntegrationError) {
      throw error;
    }
    throw new GoogleIntegrationError(
      `Failed to exchange authorization code: ${error instanceof Error ? error.message : 'Unknown error'}`,
      GoogleErrorCode.OAUTH_FAILED,
      { originalError: error }
    );
  }
}

/**
 * Refresh access token using refresh token
 * @param refreshToken Refresh token from database
 * @returns New access token and expiration
 * @throws {GoogleIntegrationError} if refresh fails
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<Pick<GoogleOAuthTokenResponse, 'access_token' | 'expires_in'>> {
  const config = getOAuthConfig();

  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'refresh_token',
  });

  try {
    const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      const error = data as GoogleOAuthError;
      throw new GoogleIntegrationError(
        `Token refresh failed: ${error.error_description || error.error}`,
        GoogleErrorCode.TOKEN_REFRESH_FAILED,
        { response: data }
      );
    }

    return {
      access_token: data.access_token,
      expires_in: data.expires_in,
    };
  } catch (error) {
    if (error instanceof GoogleIntegrationError) {
      throw error;
    }
    throw new GoogleIntegrationError(
      `Failed to refresh access token: ${error instanceof Error ? error.message : 'Unknown error'}`,
      GoogleErrorCode.TOKEN_REFRESH_FAILED,
      { originalError: error }
    );
  }
}

// ============================================================
// Google Business Profile Account/Location Discovery
// (Resolved dynamically after OAuth, NOT hard-coded)
// ============================================================

/**
 * Fetch user's Google Business Profile accounts
 * @param accessToken OAuth access token
 * @returns Array of Google accounts
 */
export async function fetchGoogleAccounts(
  accessToken: string
): Promise<GoogleAccount[]> {
  try {
    const response = await fetch(
      'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch accounts: ${response.statusText}`);
    }

    const data = await response.json();
    return data.accounts || [];
  } catch (error) {
    throw new GoogleIntegrationError(
      `Failed to fetch Google accounts: ${error instanceof Error ? error.message : 'Unknown error'}`,
      GoogleErrorCode.API_REQUEST_FAILED,
      { originalError: error }
    );
  }
}

/**
 * Fetch locations for a Google Business Profile account
 * @param accessToken OAuth access token
 * @param accountId Google account ID (e.g., "accounts/123456")
 * @returns Array of locations
 */
export async function fetchGoogleLocations(
  accessToken: string,
  accountId: string
): Promise<GoogleLocation[]> {
  try {
    const response = await fetch(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${accountId}/locations`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch locations: ${response.statusText}`);
    }

    const data = await response.json();
    return data.locations || [];
  } catch (error) {
    throw new GoogleIntegrationError(
      `Failed to fetch Google locations: ${error instanceof Error ? error.message : 'Unknown error'}`,
      GoogleErrorCode.API_REQUEST_FAILED,
      { originalError: error }
    );
  }
}

/**
 * Resolve Google account and location after OAuth
 * Automatically selects first account and location if only one exists
 * @param accessToken OAuth access token
 * @returns Resolved account and location IDs
 */
export async function resolveAccountAndLocation(
  accessToken: string
): Promise<{
  accountId: string;
  locationId: string;
  locationName?: string;
}> {
  // Fetch accounts
  const accounts = await fetchGoogleAccounts(accessToken);

  if (accounts.length === 0) {
    throw new GoogleIntegrationError(
      'No Google Business Profile accounts found for this user',
      GoogleErrorCode.NO_CONNECTION
    );
  }

  // Use first account (in single-business deployment, should only be one)
  const account = accounts[0];
  const accountId = account.name; // e.g., "accounts/123456"

  // Fetch locations for this account
  const locations = await fetchGoogleLocations(accessToken, accountId);

  if (locations.length === 0) {
    throw new GoogleIntegrationError(
      'No locations found for this Google Business Profile account',
      GoogleErrorCode.NO_CONNECTION
    );
  }

  // Use first location (in single-business deployment, should only be one)
  const location = locations[0];
  const locationId = location.name; // e.g., "locations/987654"

  return {
    accountId,
    locationId,
    locationName: location.title || location.locationName,
  };
}

// ============================================================
// Database Operations (Connection Management)
// ============================================================

/**
 * Store Google connection in database
 * @param tokens OAuth tokens from Google
 * @param userId User ID who connected
 * @returns Created connection record
 */
export async function storeConnection(
  tokens: GoogleOAuthTokenResponse,
  userId: string
): Promise<GoogleConnection> {
  const supabase = getSupabaseServiceClient();

  // Resolve account and location dynamically (NOT hard-coded)
  const { accountId, locationId, locationName } =
    await resolveAccountAndLocation(tokens.access_token);

  // Calculate token expiration
  const expiresAt = new Date();
  expiresAt.setSeconds(expiresAt.getSeconds() + tokens.expires_in);

  // Store connection in database (tokens encrypted at rest by Supabase)
  const connectionData = {
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token,
    token_expires_at: expiresAt.toISOString(),
    google_account_id: accountId,
    google_location_id: locationId,
    google_location_name: locationName,
    connected_by: userId,
    sync_enabled: true,
  };

  const { data, error } = await supabase
    .from('google_connections')
    .insert(connectionData)
    .select()
    .single();

  if (error) {
    throw new GoogleIntegrationError(
      `Failed to store connection: ${error.message}`,
      GoogleErrorCode.DATABASE_ERROR,
      { error }
    );
  }

  return data as GoogleConnection;
}

/**
 * Get active Google connection from database
 * @returns Active connection or null
 */
export async function getActiveConnection(): Promise<GoogleConnection | null> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from('google_connections')
    .select('*')
    .eq('sync_enabled', true)
    .order('connected_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new GoogleIntegrationError(
      `Failed to fetch connection: ${error.message}`,
      GoogleErrorCode.DATABASE_ERROR,
      { error }
    );
  }

  return data as GoogleConnection | null;
}

/**
 * Get valid access token (refreshes if expired)
 * @param connection Google connection record
 * @returns Valid access token
 */
export async function getValidAccessToken(
  connection: GoogleConnection
): Promise<string> {
  const now = new Date();
  const expiresAt = connection.token_expires_at
    ? new Date(connection.token_expires_at)
    : null;

  // Check if token is expired or will expire in next 5 minutes
  const needsRefresh =
    !expiresAt || expiresAt.getTime() - now.getTime() < 5 * 60 * 1000;

  if (!needsRefresh && connection.access_token) {
    return connection.access_token;
  }

  // Refresh token
  const refreshed = await refreshAccessToken(connection.refresh_token);

  // Update connection in database
  const supabase = getSupabaseServiceClient();
  const newExpiresAt = new Date();
  newExpiresAt.setSeconds(newExpiresAt.getSeconds() + refreshed.expires_in);

  const { error } = await supabase
    .from('google_connections')
    .update({
      access_token: refreshed.access_token,
      token_expires_at: newExpiresAt.toISOString(),
    })
    .eq('id', connection.id);

  if (error) {
    throw new GoogleIntegrationError(
      `Failed to update connection: ${error.message}`,
      GoogleErrorCode.DATABASE_ERROR,
      { error }
    );
  }

  return refreshed.access_token;
}

/**
 * Disconnect Google connection (disable sync, optionally delete)
 * @param connectionId Connection ID to disconnect
 * @param deleteConnection Whether to delete the connection record
 */
export async function disconnectConnection(
  connectionId: string,
  deleteConnection: boolean = false
): Promise<void> {
  const supabase = getSupabaseServiceClient();

  if (deleteConnection) {
    const { error } = await supabase
      .from('google_connections')
      .delete()
      .eq('id', connectionId);

    if (error) {
      throw new GoogleIntegrationError(
        `Failed to delete connection: ${error.message}`,
        GoogleErrorCode.DATABASE_ERROR,
        { error }
      );
    }
  } else {
    const { error } = await supabase
      .from('google_connections')
      .update({ sync_enabled: false })
      .eq('id', connectionId);

    if (error) {
      throw new GoogleIntegrationError(
        `Failed to disable connection: ${error.message}`,
        GoogleErrorCode.DATABASE_ERROR,
        { error }
      );
    }
  }
}
