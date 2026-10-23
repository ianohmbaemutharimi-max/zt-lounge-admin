"use client";

/**
 * Google Business Profile — CONNECTION + CONFIGURATION surface.
 *
 * SCOPE: this page configures the Google connection only. It never lists, edits
 * or moderates reviews — /dashboard/testimonials remains the single
 * review-management UI. "Sync Reviews" triggers the same server-side route the
 * Testimonials page uses.
 *
 * The page is driven by real connection STATE (not-connected → connected →
 * location-required → configured), and every state renders its own error. An
 * unreachable Google API is NEVER rendered as an empty list.
 *
 * SECURITY: this component only ever receives token-free metadata from
 * GET /api/admin/google/connections (no refresh_token/access_token). Tokens
 * stay server-side; nothing here can request or display them.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MapPin,
  Check,
  RefreshCw,
  ExternalLink,
  TriangleAlert,
  Power,
  ChevronRight,
} from "lucide-react";
import { Card, PageHeader, Button, Badge, Spinner } from "@/components/ui";

interface Connection {
  id: string;
  google_account_id: string | null;
  google_location_id: string | null;
  google_location_name: string | null;
  connected_at: string | null;
  connected_by: string | null;
  last_sync_at: string | null;
  sync_enabled: boolean | null;
  token_expires_at: string | null;
}

interface GbpAccount {
  name: string;
  accountId: string;
  accountName: string;
}

interface GbpLocation {
  name: string;
  locationId: string;
  locationName: string;
  storeCode?: string;
  address?: string;
  languageCode?: string;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-edge py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="text-sm text-muted">{label}</span>
      <span className="wrap-anywhere text-sm text-stone-100">{value}</span>
    </div>
  );
}


export function GoogleBusinessProfileView() {
  const router = useRouter();

  const [conn, setConn] = useState<Connection | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<GbpAccount[] | null>(null);
  const [locations, setLocations] = useState<GbpLocation[] | null>(null);
  const [pickedAccount, setPickedAccount] = useState<string>("");
  const [pickedLocation, setPickedLocation] = useState<string>("");

  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/google/connections");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(body?.error ?? `Failed to load connection (HTTP ${res.status})`);
        setConn(null);
        return;
      }
      const rows: Connection[] = body?.data ?? [];
      setConn(rows[0] ?? null);
    } catch {
      setLoadError("Could not reach the server. Check your connection and try again.");
      setConn(null);
    }
  }, []);

  // Also re-reads on return from the OAuth redirect.
  useEffect(() => {
    void load();
  }, [load]);

  const discoverAccounts = async () => {
    setBusy("accounts");
    setNotice(null);
    setLocations(null);
    try {
      const res = await fetch("/api/admin/google/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ tone: "err", text: body?.error ?? `Discovery failed (HTTP ${res.status})` });
        return;
      }
      const list: GbpAccount[] = body?.accounts ?? [];
      setAccounts(list);
      if (list.length === 0) {
        setNotice({
          tone: "err",
          text: "Google returned no business accounts for this login. Grant Business Profile access to the account that owns ZT Lounge, then reconnect.",
        });
      }
    } catch {
      setNotice({ tone: "err", text: "Network error while listing Google accounts." });
    } finally {
      setBusy(null);
    }
  };

  const discoverLocations = async (accountId: string) => {
    setPickedAccount(accountId);
    setBusy("locations");
    setNotice(null);
    setLocations(null);
    try {
      const res = await fetch("/api/admin/google/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ tone: "err", text: body?.error ?? `Could not list locations (HTTP ${res.status})` });
        return;
      }
      const list: GbpLocation[] = body?.locations ?? [];
      setLocations(list);
      if (list.length === 0) {
        setNotice({
          tone: "err",
          text: "This account has no accessible locations. Check the Business Profile access grant in Google.",
        });
      }
    } catch {
      setNotice({ tone: "err", text: "Network error while listing locations." });
    } finally {
      setBusy(null);
    }
  };

  const saveLocation = async () => {
    if (!conn || !pickedAccount || !pickedLocation) return;
    const loc = locations?.find((l) => l.locationId === pickedLocation);
    setBusy("save");
    setNotice(null);
    try {
      const res = await fetch("/api/admin/google/connections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId: conn.id,
          accountId: pickedAccount,
          locationId: pickedLocation,
          locationName: loc?.locationName,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ tone: "err", text: body?.error ?? `Could not save the location (HTTP ${res.status})` });
        return;
      }
      setNotice({ tone: "ok", text: `Location set to ${loc?.locationName ?? pickedLocation}.` });
      await load();
    } catch {
      setNotice({ tone: "err", text: "Network error while saving the location." });
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    if (!window.confirm("Disconnect Google Business Profile? Stored tokens will be deleted.")) return;
    setBusy("disconnect");
    setNotice(null);
    try {
      const res = await fetch("/api/admin/google/connections", { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ tone: "err", text: body?.error ?? `Disconnect failed (HTTP ${res.status})` });
        return;
      }
      setConn(null);
      setAccounts(null);
      setLocations(null);
      setNotice({ tone: "ok", text: "Google Business Profile disconnected." });
    } catch {
      setNotice({ tone: "err", text: "Network error while disconnecting." });
    } finally {
      setBusy(null);
    }
  };

  const syncNow = async () => {
    setBusy("sync");
    setNotice(null);
    try {
      const res = await fetch("/api/admin/google/reviews/sync", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ tone: "err", text: body?.error ?? `Sync failed (HTTP ${res.status})` });
        return;
      }
      // A successful sync that imported zero reviews is NOT an error.
      setNotice({
        tone: "ok",
        text:
          body?.seen === 0
            ? "Sync completed — Google returned no reviews for this location."
            : `Sync complete: ${body?.created ?? 0} new, ${body?.updated ?? 0} updated, ${body?.skipped ?? 0} unchanged.`,
      });
      await load();
    } catch {
      setNotice({ tone: "err", text: "Network error during sync." });
    } finally {
      setBusy(null);
    }
  };

  if (conn === undefined) return <Spinner label="Loading Google connection…" />;

  const connected = conn !== null;
  const locationChosen = Boolean(conn?.google_location_id && conn?.google_account_id);



  return (
    <div>
      <PageHeader
        title="Google Business Profile"
        subtitle="Connect the Google Business Profile that owns ZT Lounge so customer reviews can be imported into Testimonials."
        actions={
          connected ? (
            <>
              <Button
                variant="outline"
                onClick={syncNow}
                disabled={busy !== null || !locationChosen}
                title={locationChosen ? undefined : "Select a location first"}
              >
                <RefreshCw className={`h-4 w-4 ${busy === "sync" ? "animate-spin" : ""}`} />
                Sync Reviews
              </Button>
              <Button variant="danger" onClick={disconnect} disabled={busy !== null}>
                <Power className="h-4 w-4" />
                Disconnect
              </Button>
            </>
          ) : undefined
        }
      />

      {notice && (
        <div
          role="status"
          className={`mb-5 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
            notice.tone === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-rose-500/30 bg-rose-500/10 text-rose-200"
          }`}
        >
          {notice.tone === "ok" ? (
            <Check className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span className="wrap-anywhere">{notice.text}</span>
        </div>
      )}

      {loadError && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="wrap-anywhere">{loadError}</p>
            <button onClick={load} className="mt-1 underline underline-offset-2">
              Retry
            </button>
            <p className="mt-2 text-xs text-muted">
              If this reports a missing table, the Google schema has not been deployed yet. The D-2
              canonical migration must be applied to this Supabase project first.
            </p>
          </div>
        </div>
      )}

      {!connected ? (
        <Card className="p-6">
          <div className="flex flex-col items-start gap-3">
            <Badge status="inactive">Not connected</Badge>
            <h2 className="text-lg font-semibold text-white">Authorize Google Business Profile</h2>
            <p className="max-w-prose text-sm text-muted">
              Connecting uses Google OAuth 2.0 authorization — an API key alone cannot grant access to
              Business Profile data. You will be sent to Google to grant access, then returned here to
              choose the ZT Lounge location.
            </p>
            <Button
              onClick={() => {
                window.location.href = "/api/admin/google/oauth/start";
              }}
              disabled={busy !== null}
            >
              <MapPin className="h-4 w-4" />
              Connect Google Business Profile
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-5">
          <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge status={locationChosen ? "active" : "inactive"}>
                {locationChosen ? "Connected" : "Connected — location required"}
              </Badge>
              {conn?.token_expires_at && new Date(conn.token_expires_at).getTime() < Date.now() && (
                <Badge status="inactive">Token expired</Badge>
              )}
            </div>

            <Row label="Google account ID" value={conn?.google_account_id ?? "— not selected —"} />
            <Row label="Business Profile location" value={conn?.google_location_name ?? "— not selected —"} />
            <Row label="Location ID" value={conn?.google_location_id ?? "— not selected —"} />
            <Row label="Connected" value={timeAgo(conn?.connected_at ?? null)} />
            <Row label="Last successful sync" value={timeAgo(conn?.last_sync_at ?? null)} />
            <Row
              label="Sync status"
              value={locationChosen ? "Ready" : "Select a location to enable review sync"}
            />
          </Card>

          <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-white">Location</h2>
              {accounts === null ? (
                <Button variant="outline" onClick={discoverAccounts} disabled={busy !== null}>
                  <RefreshCw className={`h-4 w-4 ${busy === "accounts" ? "animate-spin" : ""}`} />
                  Find my locations
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => {
                    setAccounts(null);
                    setLocations(null);
                    setPickedAccount("");
                    setPickedLocation("");
                  }}
                  disabled={busy !== null}
                >
                  Change location
                </Button>
              )}
            </div>

            {accounts === null ? (
              <p className="text-sm text-muted">
                Google may expose several business profiles for this login. Choose the one that is the
                actual ZT Lounge location — the first result is not assumed to be correct.
              </p>
            ) : (
              <div className="space-y-4">
                {accounts.length === 0 && (
                  <p className="text-sm text-muted">No accessible Google business accounts were returned.</p>
                )}

                {accounts.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-stone-200">1. Google account</p>
                    {accounts.map((a) => (
                      <button
                        key={a.accountId}
                        type="button"
                        onClick={() => void discoverLocations(a.accountId)}
                        disabled={busy !== null}
                        className={`flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition disabled:opacity-50 ${
                          pickedAccount === a.accountId
                            ? "border-gold/60 bg-gold/5"
                            : "border-edge hover:border-stone-600"
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block text-sm text-white">{a.accountName || a.name}</span>
                          <span className="block text-xs text-muted wrap-anywhere">{a.accountId}</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
                      </button>
                    ))}
                  </div>
                )}

                {locations !== null && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-stone-200">2. Business Profile location</p>
                    {locations.length === 0 && (
                      <p className="text-sm text-muted">This account returned no locations.</p>
                    )}
                    {locations.map((l) => (
                      <label
                        key={l.locationId}
                        className={`flex cursor-pointer flex-wrap items-start gap-3 rounded-xl border px-4 py-3 transition ${
                          pickedLocation === l.locationId
                            ? "border-gold/60 bg-gold/5"
                            : "border-edge hover:border-stone-600"
                        }`}
                      >
                        <input
                          type="radio"
                          name="gbp-location"
                          value={l.locationId}
                          checked={pickedLocation === l.locationId}
                          onChange={() => setPickedLocation(l.locationId)}
                          className="mt-1 accent-[#d4af37]"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm text-white">{l.locationName || l.name}</span>
                          {l.address && <span className="block text-xs text-muted">{l.address}</span>}
                          <span className="block text-xs text-muted wrap-anywhere">{l.locationId}</span>
                        </span>
                      </label>
                    ))}
                    <Button
                      onClick={saveLocation}
                      disabled={busy !== null || !pickedAccount || !pickedLocation}
                    >
                      {busy === "save" ? "Saving…" : "Use this location"}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-2 text-base font-semibold text-white">Reviews</h2>
            <p className="text-sm text-muted">
              Imported reviews are managed on the Testimonials page, where they can be approved, featured
              or hidden. Google-owned fields (reviewer name, text, rating, date, source) are written by
              Google and are not editable here.
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => router.push("/dashboard/testimonials")}
            >
              <ExternalLink className="h-4 w-4" />
              Go to Testimonials
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
}
