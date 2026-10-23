/**
 * Canonical list of every table/column pair that references `media_assets.id`
 * anywhere in the ZT Lounge data model.
 *
 * Single source of truth for the two Admin media scanners:
 *   - DELETE guard  → `src/app/api/admin/media_assets/[id]/route.ts`
 *                      (`checkMediaReferences`)
 *   - Usage scan    → `src/app/api/media/route.ts`
 *                      (`refSources` + `resolveUsageLabels`)
 *
 * Both scanners MUST be derived from this list (or a trivial projection of it)
 * so that the UI safety gate (`usageCount > 0`) and the API 409 agree — see
 * F-1/F-2/F-3 in `_media_management_audit.md`.
 *
 * Rules:
 *  - Add a table here the moment it gets a `media_id`-style FK column.
 *  - `business_settings` carries two separate columns (`logo_media_id`,
 *    `favicon_media_id`); both are listed so the DELETE guard checks each one.
 *    The usage scan handles `business_settings` with a single `.or()` query
 *    (see `/api/media/route.ts`), so it filters these out of its `.in()` batch.
 *  - Do NOT add legacy non-FK columns (e.g. `image_url`, `banner_image`) here —
 *    those are read-only fallbacks, not canonical references (F-4).
 */

export const MEDIA_REFERENCE_TABLES = [
  { table: "services", column: "media_id" },
  { table: "gallery", column: "media_id" },
  { table: "hero_slides", column: "media_id" },
  // F-1 fix: real column is `media_id` (there is no `image_id` on menu_items).
  { table: "menu_items", column: "media_id" },
  { table: "promotions", column: "media_id" },
  // F-2 fix: was omitted from the DELETE guard but is scanned by /api/media.
  { table: "testimonials", column: "media_id" },
  // F-7 side-effect: also cover membership_plans so the usage scan and DELETE
  // guard agree (media_id is writable in repository.ts and referenced in schema).
  { table: "membership_plans", column: "media_id" },
  // Branding columns are two distinct FKs on the same table.
  { table: "business_settings", column: "logo_media_id" },
  { table: "business_settings", column: "favicon_media_id" },
] as const;

export type MediaReferenceTable = typeof MEDIA_REFERENCE_TABLES[number];
