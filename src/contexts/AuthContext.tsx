"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase/client";

type User = {
  id: string;
  email?: string | null;
  role: string;
};

type Profile = {
  id: string;
  full_name: string;
  role_id: string | null;
  role_name: string;
};

type AuthContextValue = {
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // SSR-safe singleton: `useRef` is used instead of `useMemo` because React
  // preserves the memoized value from SSR during hydration — if `useMemo`
  // returned `null` on the server, it would stay `null` forever on the client.
  //
  // With a ref we mutate `.current` during the render body only when
  // `window` exists (client), so the real singleton is created once and
  // survives every re-render. The `onAuthStateChange` subscription in
  // `useEffect` runs exclusively on the client where `supabase` is non-null.
  const supabaseRef = useRef<SupabaseClient | null>(null);
  if (supabaseRef.current === null && typeof window !== "undefined") {
    supabaseRef.current = getSupabaseBrowser();
  }
  const supabase = supabaseRef.current;

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    const init = async () => {
      setIsLoading(true);
      try {
        const res = await fetch("/api/auth/session", {
          credentials: "include",
          cache: "no-store",
        });
        const data = await res.json();
        if (data?.ok && data?.user) {
          setUser({
            id: data.user.id,
            email: data.user.email ?? null,
            role: data.user.role ?? "",
          });

          if (data.profile) {
            setProfile({
              id: data.profile.id,
              full_name: data.profile.full_name,
              role_id: data.profile.role_id,
              role_name: data.profile.role_name,
            });
          }
        }
      } catch {
        // ignore session fetch errors
      } finally {
        setIsLoading(false);
      }
    };

    init();

    // Subscribe to auth state changes (e.g. sign-out from another tab)
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setUser(null);
        setProfile(null);
      } else if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
        // Re-fetch session to get latest user/profile data
        init();
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, [supabase]);

  return (
    <AuthContext.Provider value={{ user, profile, isLoading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export type { AuthContextValue };
