/**
 * ============================================================
 * CANONICAL PUBLIC PAGE KEYS — destinations that actually resolve
 * ============================================================
 *
 * The single place in the Admin app that records which
 * `website_pages.page_key` values resolve to a SERVED public page.
 *
 * MIRROR OF THE PUBLIC SOURCE OF TRUTH (separate deployment, cannot be
 * imported):
 *   zt-lounge/assets/js/lib/page-identity.js
 *     PAGE_TO_PAGE_KEY   (PageId → website_pages.page_key)
 *     PAGE_ROUTES        (PageId / page_key → served public HTML route)
 *   zt-lounge/assets/js/repositories/PageResolver.js
 *     resolvePageRecord  (page_key → website_pages.id)
 *
 * Keep this list in lockstep with PAGE_ROUTES. A key must be added here only
 * when a served public page exists for it.
 *
 * DELIBERATELY ABSENT — keys that must never be offered as a placement
 * destination:
 *   barbershop  — not a canonical PageId; there is no served barbershop.html
 *   autospa     — NOT a website page. Auto Spa is a service owned by the
 *                 Grooming & Care page (services.page_id -> grooming-care);
 *                 its destination is the service fragment
 *                 pages/business/grooming-care.html#autospa-services, not a page.
 *   NEW page rows created in the CMS before a public page ships
 *
 * A promotion saved against one of those keys can never render anywhere: the
 * public renderer matches `promotion.page_id` against the CURRENT page's
 * resolved UUID, and no public page ever resolves to a dead key.
 */
export const PUBLIC_PAGE_KEYS: readonly string[] = [
  "home",
  "restaurant",
  "restaurant-menu",
  "lounge",
  "vip",
  "events",
  "conference",
  "grooming-care",
  "gallery",
  "contact",
] as const;

/**
 * True when a `website_pages.page_key` resolves to a served public page.
 * @param pageKey value from website_pages.page_key
 */
export function isPublicPageKey(pageKey: unknown): boolean {
  return typeof pageKey === "string" && PUBLIC_PAGE_KEYS.indexOf(pageKey) !== -1;
}

/**
 * CANONICAL PUBLIC ROUTES — `page_key` → the served public HTML route,
 * site-root-relative, exactly as stored in `services.href` today.
 *
 * MIRROR OF THE SAME PUBLIC SOURCE OF TRUTH (see the header above):
 *   zt-lounge/assets/js/lib/page-identity.js
 *     PAGE_ROUTES  (page_key → served public HTML route)
 *   exposed publicly as `pageHrefForPageKey(pageKey)`.
 *
 * These values are byte-identical to the six canonical discovery rows already
 * in the database, e.g. Restaurant -> "pages/experiences/restaurant.html".
 *
 * Keep this map in lockstep with PAGE_ROUTES AND with PUBLIC_PAGE_KEYS above.
 * A key absent here has no served page and must never be offered as a
 * destination. Adding a key here requires a served public page to exist.
 */
export const PUBLIC_PAGE_ROUTES: Readonly<Record<string, string>> = {
  home: "index.html",
  restaurant: "pages/experiences/restaurant.html",
  "restaurant-menu": "pages/experiences/restaurant-menu.html",
  lounge: "pages/experiences/lounge.html",
  vip: "pages/experiences/vip.html",
  events: "pages/business/events.html",
  conference: "pages/business/conference.html",
  "grooming-care": "pages/business/grooming-care.html",
  gallery: "pages/contact/gallery.html",
  contact: "pages/contact/contact.html",
} as const;

/**
 * Canonical public route for a `website_pages.page_key`, or null when the key
 * resolves to no served public page. Mirrors the public
 * `PageIdentity.pageHrefForPageKey()`.
 */
export function pageRouteForPageKey(pageKey: unknown): string | null {
  if (typeof pageKey !== "string") return null;
  return Object.prototype.hasOwnProperty.call(PUBLIC_PAGE_ROUTES, pageKey)
    ? PUBLIC_PAGE_ROUTES[pageKey]
    : null;
}

/**
 * Reverse lookup: a stored `services.href` value back to the `page_key` whose
 * canonical route it is, ignoring any `#fragment`. Returns null when the stored
 * href does not correspond to any known canonical route (e.g. a legacy or
 * hand-written URL), so callers can preserve such a value verbatim rather than
 * silently rewriting it.
 */
export function pageKeyForRouteHref(href: unknown): string | null {
  if (typeof href !== "string") return null;
  const route = href.trim().split("#")[0].trim();
  if (!route) return null;
  for (const key of PUBLIC_PAGE_KEYS) {
    if (PUBLIC_PAGE_ROUTES[key] === route) return key;
  }
  return null;
}

/**
 * Split a stored `services.href` into the form's two editable parts:
 * the canonical `page_key` and the optional `#fragment`.
 * `pageKey` is null when the value is empty; `customHref` is set ONLY when a
 * non-empty href does not match a canonical route, so the editor can show and
 * round-trip it without data loss.
 */
export function splitHref(href: unknown): { pageKey: string; fragment: string; customHref: string | null } {
  const raw = typeof href === "string" ? href.trim() : "";
  if (!raw) return { pageKey: "", fragment: "", customHref: null };
  const hashAt = raw.indexOf("#");
  const fragment = hashAt >= 0 ? raw.slice(hashAt + 1) : "";
  const pageKey = pageKeyForRouteHref(raw);
  if (!pageKey) return { pageKey: "", fragment, customHref: raw };
  return { pageKey, fragment, customHref: null };
}

/**
 * Compose the stored `services.href` value from the form's two parts.
 * Returns null (not "") when no destination is chosen, which is exactly what a
 * page-scoped service must store so it stays out of the discovery set.
 */
export function composeHref(pageKey: unknown, fragment: unknown, customHref?: unknown): string | null {
  const custom = typeof customHref === "string" ? customHref.trim() : "";
  if (custom) return custom;
  const route = pageRouteForPageKey(pageKey);
  if (!route) return null;
  const frag = typeof fragment === "string" ? fragment.trim().replace(/^#/, "") : "";
  return frag ? `${route}#${frag}` : route;
}
