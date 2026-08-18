import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for use inside Route Handlers and Server Actions.
 * The Next.js cookies() store is writable in those contexts, so Supabase
 * can write refreshed session tokens back to the browser.
 *
 * Do NOT call this from Server Components — use getSupabaseServerReadOnly()
 * there instead.
 */
export async function getSupabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll is called by the Supabase client when it refreshes the
            // session. In Server Components the cookie store is read-only and
            // this call will throw. That is safe to ignore here: the session
            // refresh will be written on the next request via middleware.
          }
        },
      },
    }
  );
}

export async function getSupabaseAdmin() {
  const { createClient } = await import("@supabase/supabase-js");
  
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}