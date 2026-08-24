"use client";

import { useState, useEffect, useCallback, Suspense, useRef } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabaseRef = useRef(
    createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  );
  const supabase = supabaseRef.current;

  // Derive error from search params instead of setState in effect
  const initialError = searchParams.get("error") === "profile_not_found"
    ? "User profile not found. Please contact support."
    : null;
  const [error, setError] = useState<string | null>(initialError);

  const logLoginAttempt = useCallback(async (success: boolean, failureReason?: string) => {
    try {
      await fetch("/api/auth/login-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success,
          email: success ? undefined : email,
          failure_reason: failureReason,
        }),
      });
    } catch {
      // Audit logging must never break the login flow
    }
  }, [email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        await logLoginAttempt(false, error.message);
        setLoading(false);
        return;
      }

      if (data.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role_id, roles(name)")
          .eq("id", data.user.id)
          .single();

        const userRole = profile?.roles && Array.isArray(profile.roles)
          ? profile.roles[0]?.name
          : (profile as any)?.roles?.name;

        if (!userRole || !["super_admin", "admin", "manager"].includes(userRole)) {
          await supabase.auth.signOut();
          setError("Access denied. Admin privileges required.");
          await logLoginAttempt(false, "Access denied - insufficient role");
          setLoading(false);
          return;
        }
      }

      await logLoginAttempt(true);
      router.refresh();
      router.push("/dashboard");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Login failed";
      setError(msg);
      await logLoginAttempt(false, msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <img
            src="/images/logo/zt-lounge-logo.svg"
            alt="ZT Lounge"
            width={160}
            height={40}
            className="mx-auto mb-4 rounded ring-2 ring-gold/40"
          />
          <h1 className="text-3xl font-bold text-white">Admin Login</h1>
          <p className="mt-2 text-sm text-muted">ZT Lounge Meru — Control Center</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-edge bg-panel p-8">
          {error && (
            <div className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-400" role="alert">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-stone-200">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-xl border border-edge bg-ink px-4 py-2.5 text-white placeholder:text-stone-500 focus:border-gold focus:outline-none"
                placeholder="admin@ztlounge.com"
                autoComplete="email"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-stone-200">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-xl border border-edge bg-ink px-4 py-2.5 text-white placeholder:text-stone-500 focus:border-gold focus:outline-none"
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-gold py-2.5 font-semibold text-black hover:bg-gold/90 disabled:opacity-50"
                aria-busy={loading}
              >
                {loading ? "Signing in…" : "Sign In"}
              </button>
          </div>
        </form>

        <p className="mt-6 text-center text-xs text-muted">
          <Link href="/" className="hover:text-gold">
            ← Back to website
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-4 text-center text-muted">Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}