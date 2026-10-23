/**
 * Google Business Profile connections — admin connection-state surface.
 *
 * GET    /api/admin/google/connections   → token-free status list
 * POST   /api/admin/google/connections   → discover accounts/locations
 * PATCH  /api/admin/google/connections   → select the ZT Lounge location
 * DELETE /api/admin/google/connections   → disconnect
 *
 * Super-admin gated. Returns connection STATUS only.
 *
 * SECURITY CONTRACT: refresh_token and access_token are NEVER selected into
 * any response. The GET projection below is the single place that defines the
 * token-free column list; any new field must be reviewed against it. Tokens are
 * read ONLY through the service-role client, inside the server, and are used
 * solely to call Google — they are never returned, logged, or echoed.
 *
 * State model (drives the GBP page):
 *   not connected            → GET returns []
 *   connected, no location   → row with null google_location_id
 *   connected + configured   → row with google_account_id/location_id set
 */

import { NextRequest, NextResponse } from "next/server";
import { withSuperAdminAuth } from "@/lib/auth/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  refreshAccessToken,
  listAccounts,
  listLocations,
  GoogleBPApiError,
} from "@/lib/integrations/google-business-profile";

/**
 * Type shim: the generated Supabase client types do not include
 * google_connections (created by the D-2 canonical migration), so the builder
 * resolves the row to `never`. Declare the row shape locally — this is the
 * established pattern in reviews/sync/route.ts. Runtime is unaffected; this only
 * restores type safety for property access.
 */
interface GoogleConnectionRow {
  id: string;
  refresh_token: string;
  google_account_id: string | null;
  google_location_id: string | null;
}

/** Narrow a `never`-typed row from `.select(...)` to the declared shape. */
function asConnectionRow(row: unknown): GoogleConnectionRow | null {
  return (row ?? null) as GoogleConnectionRow | null;
}

/** Deliberately token-free projection — do NOT add refresh_token/access_token. */
const TOKEN_FREE_COLUMNS =
  "id, google_account_id, google_location_id, google_location_name, connected_at, connected_by, last_sync_at, sync_enabled, token_expires_at";

export const dynamic = "force-dynamic";

export const GET = withSuperAdminAuth(async (_req, _ctx, auth) => {
  const { data, error } = await auth.supabase
    .from("google_connections")
    .select(TOKEN_FREE_COLUMNS)
    .order("connected_at", { ascending: false });

  if (error) {
    console.error("[GBP-CONNECTIONS] list failed:", error.message);
    return NextResponse.json(
      { error: "Failed to load Google connections" },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: data ?? [] });
});

/**
 * Resolve a usable access token for the most recent enabled connection.
 * Server-only; the token never leaves this function's return value.
 */
async function activeAccessToken(): Promise<
  { token: string } | { error: NextResponse }
> {
  const admin = getSupabaseAdmin();
  const { data: raw, error: connErr } = await admin
    .from("google_connections")
    .select("refresh_token")
    .eq("sync_enabled", true)
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const conn = asConnectionRow(raw);
  if (connErr || !conn?.refresh_token) {
    return {
      error: NextResponse.json(
        { error: "Not connected to Google Business Profile" },
        { status: 409 }
      ),
    };
  }

  try {
    const token = await refreshAccessToken(conn.refresh_token);
    return { token: token.access_token };
  } catch (e) {
    console.error(
      "[GBP-CONNECTIONS] token refresh failed:",
      e instanceof Error ? e.message : String(e)
    );
    return {
      error: NextResponse.json(
        { error: "Google authorization expired — reconnect the account" },
        { status: 401 }
      ),
    };
  }
}

/** POST → list accessible accounts, or the locations under one account. */
export const POST = withSuperAdminAuth(async (req: NextRequest, _ctx, _auth) => {
  const body = await req.json().catch(() => ({} as any));
  const accountId: string | undefined = body?.accountId;

  const auth = await activeAccessToken();
  if ("error" in auth) return auth.error;

  try {
    if (!accountId) {
      // [] is a legitimate state (no business access granted), not a failure.
      const accounts = await listAccounts(auth.token);
      return NextResponse.json({ accounts, locations: null });
    }
    if (!/^[^/]+$/.test(accountId)) {
      return NextResponse.json({ error: "Invalid account id" }, { status: 400 });
    }
    const locations = await listLocations(auth.token, accountId);
    return NextResponse.json({ accounts: null, locations });
  } catch (e) {
    if (e instanceof GoogleBPApiError) {
      console.error("[GBP-CONNECTIONS] discovery failed:", e.message);
      return NextResponse.json(
        { error: "Could not read Google Business Profile data" },
        { status: 502 }
      );
    }
    throw e;
  }
});

/** PATCH → persist the admin's chosen account + location. */
export const PATCH = withSuperAdminAuth(async (req: NextRequest, _ctx, auth) => {
  const body = await req.json().catch(() => ({} as any));
  const connectionId: string | undefined = body?.connectionId;
  const accountId: string | undefined = body?.accountId;
  const locationId: string | undefined = body?.locationId;
  const locationName: string | undefined = body?.locationName;

  if (!connectionId || !accountId || !locationId) {
    return NextResponse.json(
      { error: "connectionId, accountId and locationId are required" },
      { status: 400 }
    );
  }

  // Bare ids only — guards against resource-name injection into the row.
  if (!/^[^/]+$/.test(accountId) || !/^[^/]+$/.test(locationId)) {
    return NextResponse.json({ error: "Invalid identifiers" }, { status: 400 });
  }

  const { error } = await auth.supabase
    .from("google_connections")
    .update({
      google_account_id: accountId,
      google_location_id: locationId,
      google_location_name: locationName?.slice(0, 200) ?? null,
    })
    .eq("id", connectionId);

  if (error) {
    console.error("[GBP-CONNECTIONS] location save failed:", error.message);
    return NextResponse.json(
      { error: "Failed to save the selected location" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
});

/** DELETE → disconnect. Destroys the stored tokens. */
export const DELETE = withSuperAdminAuth(async (_req, _ctx, auth) => {
  const { error } = await auth.supabase.from("google_connections").delete();

  if (error) {
    console.error("[GBP-CONNECTIONS] disconnect failed:", error.message);
    return NextResponse.json(
      { error: "Failed to disconnect Google Business Profile" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
});


