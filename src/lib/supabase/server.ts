import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for use inside Route Handlers and Server Actions.
 * The Next.js cookies() store is writable in those contexts, so Supabase
 * can write refreshed session tokens back to the browser.
 *
 * Do NOT call this from Server Components — use getSupabaseServerReadOnly()
 * there instead (see below).
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
            // Defensive only. In a Route Handler / Server Action the cookie
            // store is writable, so this never runs. If this client is ever
            // reached from a read-only context by mistake, the write is
            // skipped and the refresh is persisted by src/proxy.ts instead.
            // Prefer getSupabaseServerReadOnly() in Server Components.
          }
        },
      },
    }
  );
}

/**
 * Supabase client for use inside Server Components.
 *
 * Server Components run with a READ-ONLY cookies() store: any call to
 * cookieStore.set() throws "Cookies can only be modified in a Server Action
 * or Route Handler", which Next.js surfaces as a console error even when the
 * throw is swallowed.
 *
 * To avoid ever triggering that write, this client sets no cookies at all
 * (setAll is an intentional no-op). It still reads the session from the
 * incoming request cookies and lets Supabase refresh the access token in
 * memory for the duration of the request.
 *
 * Persisting a refreshed session is the sole responsibility of the proxy
 * middleware (src/proxy.ts), which runs on every matched request and writes
 * the refreshed cookies onto the response.
 */
export async function getSupabaseServerReadOnly() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // Intentionally a no-op — this client is used only where cookies are
          // read-only. The refresh is persisted by src/proxy.ts.
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