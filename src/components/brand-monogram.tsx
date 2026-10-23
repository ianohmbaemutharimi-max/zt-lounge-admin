/**
 * Static server-safe brand monogram for public (non-authenticated) pages.
 *
 * Public homepage must NOT use BrandLogo (a client component that depends on
 * the React Query Providers context and the /api/branding endpoint which
 * resolves business branding for authenticated contexts). This component is a
 * render-only fallback: a neutral "ZT" mark identical to BrandLogo's monogram
 * branch, so branding on the public site can never drift.
 */
export function BrandMonogram({ className }: { className?: string }) {
  return (
    <span
      className={
        className ??
        "flex h-10 w-10 items-center justify-center rounded bg-gold font-serif text-lg font-bold text-black"
      }
      aria-label="ZT Lounge"
    >
      ZT
    </span>
  );
}

export default BrandMonogram;