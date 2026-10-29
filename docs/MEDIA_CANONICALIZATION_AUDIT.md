# ZT Lounge Media Canonicalization — Audit & Fix Tracker

**Purpose:** Make `media_assets` the single canonical media registry, remove legacy URL fallbacks only after proving they are unused, and make the Media Library understandable to administrators.

**Rule:** Fix one issue at a time. After each fix, update this file with the exact files changed, evidence collected, tests run, and remaining risks. Do not mark an issue complete because code was merely changed.

## Safety and evidence rules

- [ ] Read the current branch and working-tree state before editing. Preserve unrelated user changes; do not reset, stash, or overwrite them.
- [ ] Verify every relevant claim against the live Supabase schema/data and the exact Git branch being changed.
- [ ] Use read-only SQL for investigation. No database writes, migrations, storage deletion, record merging, or URL/data cleanup without explicit approval.
- [ ] Do not infer that a Storage object is missing from a URL mismatch alone. Confirm the actual bucket and object key first.
- [ ] Do not deduplicate assets just because their `public_url` values match. Confirm bytes, intended uses, references, and expected display before merging anything.
- [ ] No silent fallback to a hard-coded or legacy URL. A missing canonical media reference must produce a visible, diagnosable missing-media state.
- [ ] Do not remove a legacy database column until code, queries, triggers, views, policies, and public-site usage have been checked and a migration is explicitly approved.
- [ ] After every fix, run the narrowest relevant tests, then the wider type/lint/build/browser checks where available. Record actual commands and results.
- [ ] If a tool/test fails, report the failure and stop relying on that test as evidence. Never report an unrun test as passed.
- [ ] Update the status and evidence in this document in the same change/commit as each completed issue, where practical.

## Canonical contract

1. **Storage** owns the actual file bytes and the bucket/object key.
2. **`public.media_assets`** owns the canonical asset row and stable `id`, plus verified metadata such as `public_url`, `file_name`, `mime_type`, `file_size`, `media_type`, and a real content hash once its contract is repaired.
3. **Content tables** own content and refer to media using `media_id` (or the explicitly named equivalent, such as `page_seo.og_image_media_id`).
4. **Business settings** choose which canonical asset is the logo and favicon through `logo_media_id` and `favicon_media_id`; they must not maintain a second independent URL authority.
5. **A shared resolver/reference registry** must be used consistently by rendering, Media Library usage reporting, and delete protection.
6. **The administrator sees** a human-readable file name, media type, and understandable “Used in” labels—not internal UUIDs or raw implementation details.
7. **Page scope is not ownership by default.** An asset can be shared by multiple pages. Do not treat `media_assets.page_id` as exclusive ownership until the intended meaning is explicitly confirmed.

## Verified baseline

These observations came from the read-only audit. Re-check them against the current branch and live database before implementing a fix, because the environment may have changed.

- [x] Live `media_assets` schema was observed with: `id`, `content_hash`, `public_url`, `file_size`, `mime_type`, `created_at`, `updated_at`, `created_by`, `updated_by`, `file_name`, `alt_text`, `media_type`, `display_id`, `page_id`.
- [x] Live schema did **not** show `bucket`, `path`, `original_name`, `width`, `height`, `title`, `description`, or `category` on `media_assets`.
- [x] Live `website_pages` columns observed were `id`, `name`, `slug`, `is_active`, `service_cards_enabled`, `service_packages_enabled`, `created_at`, `updated_at`; `page_key` and `title` were absent.
- [x] Live `media_type` enum values observed: `service`, `gallery`, `general`, `menu`, `testimonial`, `branding`, `hero`, `promotion`, `seo`, `feature`.
- [x] `public.media_usage` was not present when checked.
- [x] The prior audit observed 73 `media_assets` rows, 54 distinct `public_url` values, 13 duplicate-URL groups, and 6 relative URL values. Recount before acting.
- [x] The prior audit found all 73 `content_hash` values failed the expected SHA-256-shaped format check. Some values looked like labels (for example, `sha256:classic-haircut`), not hashes. Recheck before data changes.
- [x] The prior audit found 9 tables/columns with FKs to `media_assets.id`: `branding_assets.media_id`, `gallery.media_id`, `hero_slides.media_id`, `menu_items.media_id`, `page_features.media_id`, `page_seo.og_image_media_id`, `promotions.media_id`, `services.media_id`, `testimonials.media_id`.
- [x] `business_settings.logo_media_id` and `business_settings.favicon_media_id` existed but had no FK constraints at audit time. Prior dangling-reference checks returned zero; recheck before proposing constraints.
- [x] `media_assets_view` reported 75 references but omitted the two `business_settings` references; a separate scan counted 77 non-null references across the listed columns. Recompute using one authoritative method.
- [x] `hero_slides.image_url` and `promotions.banner_image` existed in the live schema, and the prior audit found no populated values in either. Recheck before removing fallback code or considering a migration.
- [x] The prior URL-to-Storage-object comparison returned no matches for the compared URLs. This is **not proof of missing files**; URL parsing, hostnames, bucket names, and object keys must be reconciled.
- [ ] Public website repository/rendering paths have not yet been comprehensively audited in this tracker. No claim that public-site fallback removal is complete is allowed until that audit is done.

## Issues and one-by-one fix plan

Statuses: **OPEN** = not fixed; **IN PROGRESS** = currently being worked; **FIXED—UNVERIFIED** = code changed but required verification is incomplete; **VERIFIED** = acceptance checks passed and evidence is recorded; **BLOCKED** = needs evidence, decision, or approval.

### M-01 — Drizzle schema and repository disagree with live `media_assets` schema
**Severity:** Critical  
**Status:** FIXED—UNVERIFIED

**Verified gap:** `src/db/schema.ts` and `src/lib/repository.ts` were observed describing legacy columns that were absent from the live table.

**Fix plan**
1. Re-read the live schema and current branch versions of both files.
2. Search all references to the legacy fields and classify them as runtime query, type-only, UI-only, migration-only, or dead code.
3. Align the application schema/repository with the verified live contract. Do not invent replacement columns.
4. Separate content-specific fields (for example, a service title) from global asset metadata.
5. Do not modify the database to fit stale code unless a separate, approved design decision requires it.

**Acceptance evidence**
- [ ] Field-by-field schema comparison attached to this issue.
- [ ] No live query selects/inserts/updates columns absent from the verified schema.
- [ ] TypeScript and relevant unit/integration tests pass.
- [ ] No database write or migration was performed without approval.

**Fix evidence / commit / tests:**
- Live read-only query on 2026-10-29 confirmed the exact `media_assets` columns and types: `id uuid NOT NULL`, `content_hash varchar NOT NULL`, `public_url text NOT NULL`, `file_size integer NULL`, `mime_type varchar NULL`, timestamps nullable with `now()` defaults, `created_by/updated_by uuid NULL`, `file_name/alt_text text NULL`, `media_type public.media_type NULL` defaulting to `general`, `display_id integer NOT NULL` backed by `public.media_display_id_seq`, and `page_id text NULL`.
- Live FK inspection confirmed `created_by → profiles.id`, `updated_by → profiles.id`, and `page_id → website_pages.slug`; the latter corrects the older baseline note that described no FK.
- Live constraints confirmed unique `content_hash` and unique `display_id`. This also contradicts the upload route's existing comment claiming there is no unique constraint; handle under M-05 before changing duplicate semantics.
- Changed `src/db/schema.ts` in commit `d3c9714104f8d19e028d107c6dac92c82e2dd21a`: replaced stale `bucket/path/original_name/width/height/title/description/category/uploaded_by` fields with verified live columns and declared the observed enum values and sequence default.
- Also aligned the Drizzle `business_settings` table to live columns and removed phantom `logo_light_media_id`, `logo_url`, `favicon_url`, and unrelated absent fields from that table definition (commit `49a832f4a39d225cbe18a0ac02c4b3ad1bda1aae`).
- Changed the `media_assets` response allowlist in `src/lib/repository.ts` in commit `34a2319c413aa712dd69fa889d62a30915239f6c` to stop advertising absent columns and expose live metadata fields (while continuing to suppress `content_hash` as sensitive).
- **Verification pending:** no local TypeScript/lint/test execution has been performed in this session; this issue is not VERIFIED. Also check all schema references and any Drizzle insert callers before promoting status.

### M-02 — Media API uses nonexistent table/columns and wrong page labels
**Severity:** Critical  
**Status:** FIXED—UNVERIFIED

**Verified gap:** `src/app/api/media/route.ts` was observed querying absent `media_usage`, absent `media_assets.bucket/path/title/category`, and absent `website_pages.page_key/title`. It also returned `hasMore: false` and performed usage filtering after pagination, which can make results inaccurate.

**Fix plan**
1. Inspect the current route and every caller/consumer before editing.
2. Define the response contract from verified live columns and the canonical reference inventory.
3. Replace nonexistent usage-table queries with the approved, shared reference-accounting implementation.
4. Use real `website_pages.name/slug` fields for labels.
5. Implement correct pagination and filtering semantics; calculate totals/usage without silently dropping failed reference queries.
6. Return explicit errors when a required usage query fails rather than classifying the asset as unused.

**Acceptance evidence**
- [ ] API contract matches the live schema.
- [ ] Pagination tested with more than one page and with used/unused filters.
- [ ] Failed usage lookup cannot return a misleading “unused” result.
- [ ] Usage labels resolve against verified page fields.
- [ ] API tests and type checks pass.

**Fix evidence / commit / tests:**
- Live read-only SQL on 2026-10-29 reconfirmed `media_assets` has no `bucket`, `path`, `title`, or `category` columns and `website_pages` has `id/name/slug` rather than `page_key/title`.
- Replaced the stale summary/list logic in `src/app/api/media/route.ts` (commit `88840664988c8c4fbe3945e1f22596b4b7c6526d`, followed by summary response correction `183274dd9049ca87524fd9353bc3a0b27ddd5d64`). The route now queries live asset fields, searches `file_name/alt_text/public_url`, filters `media_type`, derives usage from the shared reference registry, includes logo/favicon references, resolves page names through `website_pages.name/slug`, applies used/unused filtering before output pagination, and returns an error if a required usage/label query fails.
- Summary no longer queries absent `media_usage` or `bucket` fields; it counts usage across registered reference columns and reports distinct media types.
- **Verification pending:** API integration tests and TypeScript checks have not run. Also verify the reference registry's table/column list against all live references (M-04), and test pagination beyond one page. Status remains unverified.

### M-03 — Media Library UI edits fields that do not exist in the canonical table
**Severity:** High  
**Status:** FIXED—UNVERIFIED

**Verified gap:** `src/features/media` was observed expecting legacy fields and offering edits for `title`, `description`, and `category`, which were absent from live `media_assets`.

**Fix plan**
1. Inventory every field rendered and edited by the Media Library.
2. Decide field ownership based on verified schema: global asset metadata belongs on the asset row only when a live column supports it; content titles/descriptions belong to their content records.
3. Keep admin labels simple: file name, media type, alt text if supported, and “Used in” destinations.
4. Remove controls that imply writes to nonexistent columns; do not silently discard user input.
5. Explain shared use clearly and avoid presenting page scope as exclusive ownership.

**Acceptance evidence**
- [ ] Every editable field maps to a real, verified writable column/API.
- [ ] Saving and reloading proves edits persist.
- [ ] UI displays human-readable usage labels and handles shared assets.
- [ ] No UUIDs are required for routine admin tasks.

**Fix evidence / commit / tests:**
- Updated `src/features/media/media-library-view.tsx` to consume live fields (`file_name`, `media_type`, `alt_text`, `public_url`, file size/timestamps, usage) and removed display dependencies on `bucket/path/original_name/width/height/title/description/category` (commit `68559bd0987b07fad32ad7e0986ab9add4b69b5c`).
- Aligned `src/types/media.ts`, `src/lib/media/selection.ts`, `src/features/media/image-browser.tsx`, `src/features/media/image-change-dialog.tsx`, and `src/features/media/media-picker-modal.tsx` with the canonical schema; removed the unsupported bucket filter and old title/path/dimension fields from the picker (commits `bae0c48f055ac9fa8da9db4fbacfc11b8a9753b0`, `4669a7f84c11a6423527916976dfc3d096caf3d8`, `daf671c1694cd8dba82b7aee9c6a50d2bf4d272a`, `8eac854a1f7d7fe25cb3eb7442144a3eff0657ab`, `21f2402fa98e14579b45f922c6b3cb04408a6e68`, `ee262246d5da1ce997e37c90f855b402f8d3b6fb`, `1537af6076e893d9de560351ae1d57afe7ec0974`, `71e222b149eaf47281ed2af5bfce63c4ecbe4581`).
- Replaced `src/features/media/media-edit-modal.tsx` so only live `alt_text` and `media_type` are editable; labels use file name/type/alt text, and content-specific titles/descriptions are not written to the shared asset row (commit `949bcf8d822b6c173b1e6cad93b0b42764450a68`).
- Updated delete/usage dialogs to show the real `file_name` (commits `0938c2bf2de3ecc1fd190d9bc5cff265af10f484`, `5235859088a8a5cb71d49f2f4c4e59023155630a`).
- Restricted repository writable fields to `alt_text` and `media_type` (commit `2bdef470d73d2c61f1e33851f06bd99b22526f78`) and added API validation to reject unsupported fields/enum values instead of silently ignoring them (commit `9362c3253eb9a3fccb28e0e3bdb7dd005df8a3c2`).
- **Verification pending:** no UI build, typecheck, API tests, or browser test has run. Status remains unverified until the form can save and reload a real test record in a safe environment.

### M-04 — Usage reporting and delete protection do not share reliable reference accounting
**Severity:** Critical  
**Status:** FIXED—UNVERIFIED

**Verified gap:** The prior `media_assets_view` count omitted `business_settings.logo_media_id` and `favicon_media_id`. The branch has a reference registry in `src/lib/media/reference-tables.ts`; verify it is actually shared by every usage and deletion path.

**Fix plan**
1. Enumerate all actual media reference columns from the live database, including views, functions, triggers, APIs, and settings.
2. Compare that inventory to `MEDIA_REFERENCE_TABLES`.
3. Make usage display and delete guard consume the same verified inventory or one canonical database abstraction.
4. Fail closed if any reference query fails, times out, or returns an indeterminate count.
5. Include logo/favicon references in usage totals and labels.
6. Ensure deletion checks run server-side and cannot be bypassed by client filtering.

**Acceptance evidence**
- [ ] Registry-to-live-schema reconciliation is recorded.
- [ ] A known asset referenced in each supported table is reported as used.
- [ ] Logo and favicon each appear in usage accounting.
- [ ] Query failure blocks deletion and does not report zero references.
- [ ] Referenced assets cannot be deleted; unreferenced test assets follow the intended deletion policy.

**Fix evidence / commit / tests:**
- Read-only live FK inventory on 2026-10-29 confirmed nine FK columns referencing `media_assets.id`: `branding_assets.media_id`, `gallery.media_id`, `hero_slides.media_id`, `menu_items.media_id`, `page_features.media_id`, `page_seo.og_image_media_id`, `promotions.media_id`, `services.media_id`, and `testimonials.media_id`.
- A separate live column inventory confirmed `business_settings.logo_media_id` and `business_settings.favicon_media_id` exist but are not FK-constrained; both are included in `MEDIA_REFERENCE_TABLES`. `logo_light_media_id` is **not present in the current live `business_settings` table**, contrary to earlier branch assumptions; this needs explicit treatment in M-13/M-01 rather than adding a phantom reference.
- The API usage scanner now uses the shared registry and fails the request if any required usage query fails (M-02 commits). The delete guard in `src/app/api/admin/media_assets/[id]/route.ts` already uses the same registry and throws on query errors or null counts (existing branch change; regression verification pending).
- **Verification pending:** no integration tests have proven every reference path, logo/favicon counts, or deletion failure behavior. Status remains unverified.

### M-05 — `content_hash` has an unverified/incorrect contract
**Severity:** Critical  
**Status:** IN PROGRESS

**Verified gap:** Prior audit values did not match a SHA-256 digest format, despite code/comments treating them as hashes. A unique constraint on `content_hash` was observed. The upload branch also handles duplicate hash errors, so the actual intended semantics must be established before changes.

**Fix plan**
1. Inspect the exact live constraint/index definitions and upload behavior.
2. Determine whether `content_hash` is intended to be a cryptographic digest, a legacy label, or another unique key. Do not assume.
3. If it must be a digest, design a safe backfill plan that computes hashes from actual bytes and checks collisions before writes.
4. Resolve the uniqueness strategy and duplicate-upload behavior before altering data.
5. Do not rewrite hashes, remove uniqueness, merge rows, or delete assets without explicit approval.

**Acceptance evidence**
- [ ] Contract is documented and consistent in DB, API, and comments.
- [ ] Duplicate-upload behavior is tested against actual file bytes.
- [ ] No hash values were fabricated from filenames or labels.
- [ ] Any backfill/data migration is separately approved and has rollback/recovery planning.

**Fix evidence / commit / tests:**
- Live read-only SQL on 2026-10-29: 73 rows, 73 distinct values, zero values matching a 64-character SHA-256 hex digest; 67 values begin with `sha256:`. Live constraints include unique `media_assets_content_hash_key`.
- `src/lib/images/processor.ts` computes SHA-256 of the normalized WebP bytes (or raw ICO bytes), so the new-upload hash algorithm is concrete and verified in source.
- Corrected both contradictory upload-route comments in commits `6c3032b36b18c308fcfab64450ee7607cffb3306` and `6489ffe17800e720dbe49cae6257ef3ace726973`; code performs a preflight duplicate lookup and handles the unique constraint race with cleanup.
- **Not safe to complete:** existing rows cannot be rehashed from metadata alone. Storage object mapping and byte-level hashes must be reconciled first (M-06/M-07). No hashes or rows were modified. No production upload was executed.

### M-06 — Duplicate public URLs and relative URL entries need asset-by-asset reconciliation
**Severity:** High  
**Status:** IN PROGRESS

**Verified gap:** Prior audit observed repeated URL groups and six relative URL values. Duplicate URLs alone do not establish duplicate file bytes or safe merge candidates.

**Fix plan**
1. Recount and list every duplicate URL group and every relative URL row.
2. For each candidate, identify the actual Storage object, verify the bytes/hash, inspect all references, and check expected public rendering.
3. Decide whether rows represent accidental duplicates, intentional shared assets, or incorrect metadata.
4. Propose any merge or data repair as a reviewed mapping first; preserve references and auditability.
5. Do not delete or merge records as part of the code-only fix.

**Acceptance evidence**
- [ ] Candidate-by-candidate reconciliation table exists.
- [ ] Every changed reference is accounted for and validated.
- [ ] Images render correctly in the public site and admin.
- [ ] Any data-changing cleanup was explicitly approved and verified after execution.

**Fix evidence / commit / tests:**
- Live read-only SQL confirms 13 duplicate `public_url` groups. The largest is the same `.../images/branding/logo.webp` URL repeated by eight asset rows; the other groups include duplicate auto-spa, conference, events, lounge, restaurant, and VIP images.
- Six rows use relative paths: `/favicon-default.png`, `/logo-default.svg`, and `/icon-service-1.svg` through `/icon-service-4.svg`. Fetching these exact root paths in the public GitHub repository returned NOT_FOUND; full repository-wide path search remains pending.
- The duplicate rows are referenced by different content records (including services/gallery/testimonials), so equal URLs alone are not permission to merge or delete. No rows were changed.

### M-07 — Storage identity and canonical URLs are not reconciled
**Severity:** Critical  
**Status:** IN PROGRESS

**Verified gap:** Prior URL-to-object comparison produced zero matches, but the comparison was not sufficient to prove missing files. Some URL host/path values appeared suspicious and require confirmation.

**Fix plan**
1. Read the actual Storage buckets and object keys using read-only queries/API inspection.
2. Verify the URL format and derive bucket/object keys using the actual configured Storage URL contract, not guessed string parsing.
3. Match each asset row to the real object and test URL accessibility where supported.
4. Identify unresolved rows precisely: valid external/relative assets, resolvable Storage assets, malformed URLs, or truly missing objects.
5. Do not rewrite URLs or delete Storage objects until each case is classified and approved.

**Acceptance evidence**
- [ ] Every canonical asset has a documented resolution status.
- [ ] Bucket/key mapping is verified, not inferred.
- [ ] Missing objects are distinguished from URL parser/host mismatch.
- [ ] Public URL behavior is tested for representative assets and all repaired exceptions.

**Fix evidence / commit / tests:**
- Current project URL from the connected Supabase project is `https://jczwilrysvnhcjzjztbi.supabase.co`.
- Read-only SQL against `storage.objects` found 197 objects across seven buckets: `favicons` 1, `gallery-images` 15, `hero-images` 2, `logos` 2, `menu-images` 13, `public-assets` 152, `service-images` 12.
- Compared every media URL's `/storage/v1/object/public/{bucket}/{key}` suffix to live `storage.objects`: 73 total assets, 67 Storage-shaped URLs, 65 exact bucket/key matches, 2 unmatched Storage-shaped URLs (`public-assets/images/autospa/interior-webp.webp` and `public-assets/images/restaurant/kitchen.webp`), and 6 relative URLs (listed under M-06).
- All 67 absolute media URLs use the host `pub-xyz.supabase.co`, which differs from the connected project's verified host. The bucket/key match is evidence for the object path only, not proof that the URL is usable.
- No public URL or Storage object was changed. The host repair is a data write and remains pending explicit approval; the two unmatched paths require asset review, not guessed substitutions.

### M-08 — Missing FK constraints for business settings media references
**Severity:** High  
**Status:** IN PROGRESS

**Verified gap:** current live `business_settings.logo_media_id` and `favicon_media_id` columns have no FK constraints. Current values are non-dangling but point to semantically incorrect relative-path assets (tracked as M-15).

**Fix plan**
1. Recheck live column types, nullability, existing values, and all write paths.
2. Confirm desired delete behavior and whether settings can ever legitimately reference a removed asset.
3. Propose FK constraints (and appropriate delete behavior) only after data validation and explicit migration approval.
4. Keep application-level delete protection even if FKs are added, for clear admin feedback.

**Acceptance evidence**
- [ ] Current data has zero dangling references.
- [ ] Constraint and delete semantics are reviewed.
- [ ] Migration is approved before execution.
- [ ] Post-migration constraint and application tests pass.

**Fix evidence / commit / tests:**
- Current live read-only schema shows `media_assets.page_id` is nullable text with FK `media_assets_page_id_fkey` to `website_pages.slug`, contrary to the prior baseline's no-FK statement.
- Current `business_settings` schema has `logo_media_id` and `favicon_media_id`, but no `logo_light_media_id`, `logo_url`, or `favicon_url`. Those missing columns conflict with older admin/public code assumptions and must be resolved through code alignment, not a database write.
- `src/app/api/admin/business-settings/branding/route.ts` now rejects attempts to clear required logo/favicon references and explicitly rejects `logo_light_media_id` updates because that column is absent in the live schema (commit `0b87ede36a6b5b4eb5e81cc27103a28bf61bfca2`).
- `src/db/schema.ts` and `src/lib/repository.ts` now align the Drizzle table and API allowlists for business settings to current live columns (commits `49a832f4a39d225cbe18a0ac02c4b3ad1bda1aae`, `71e222b149eaf47281ed2af5bfce63c4ecbe4581`); `SettingsView` no longer offers fields that the live table cannot store and disables the unsupported light-logo picker (commit `1537af6076e893d9de560351ae1d57afe7ec0974`).
- `src/lib/repository.ts` response/writable allowlists now include only live `business_settings` fields (commit `71e222b149eaf47281ed2af5bfce63c4ecbe4581`). `src/features/settings/settings-view.tsx` now edits only live business fields and clearly disables the light-logo picker until the missing column is added through an approved migration (commit `1537af6076e893d9de560351ae1d57afe7ec0974`).
- `src/app/api/admin/[resource]/[id]/route.ts` now resolves branding only from media IDs and fails closed on canonical media lookup errors; it no longer reads `logo_url` or `favicon_url` fallback values (commit `4a9fade5f073e9049e72cf5eadc1c0f946d6f5e9`).
- Existing values were not changed. FK migration and `logo_light_media_id` schema support remain blocked pending explicit approval.

### M-09 — `media_assets.page_id` meaning and shared asset ownership are unclear
**Severity:** High  
**Status:** FIXED—UNVERIFIED

**Verified gap:** `page_id` is nullable text with an FK to `website_pages.slug`; the field's use as page-scope metadata is established by the live constraint and values, while exclusive ownership semantics are not assumed.

**Fix plan**
1. Search application code and historical migrations for how `page_id` is assigned, filtered, and displayed.
2. Determine whether it means upload context, default page/filter, or actual ownership.
3. Document the chosen meaning. A shared asset must be allowed to serve multiple content records/pages.
4. Do not convert the field to a foreign key, rename it, or delete values until semantics and data are verified.

**Acceptance evidence**
- [ ] Existing behavior and intended semantics are documented.
- [ ] Shared assets remain discoverable from every use.
- [ ] Page filtering does not hide a shared asset from valid references.
- [ ] Any schema change has explicit approval.

**Fix evidence / commit / tests:**
- Live `page_id` values on 2026-10-29 are page slugs already present in `website_pages.slug` (`grooming-care`, `restaurant`, `home`, `conference`, `vip`, `lounge`, `events`, `restaurant-menu`), plus 7 nulls; the live FK to `website_pages.slug` confirms this is page-scope metadata.
- The registry/API does not use `page_id` as proof of exclusive ownership or as a deletion guard; usage is derived from actual content `media_id` references. Shared references remain counted separately.
- No `page_id` data was changed. Remaining question is whether the admin should expose it as a filter/upload context; it must not be treated as exclusive ownership.

### M-10 — Legacy URL fallback paths remain to be fully inventoried and removed
**Severity:** Critical  
**Status:** IN PROGRESS

**Verified gap:** Live schema included `hero_slides.image_url` and `promotions.banner_image`; prior audit found no populated values then. The public website repository and all renderers have not yet been comprehensively audited, so fallback removal is not verified.

**Fix plan**
1. Search both admin and public-site repositories for `image_url`, `banner_image`, `logo_url`, `favicon_url`, hard-coded Storage URLs, direct URL columns, and fallback expressions.
2. Trace each match to its source, runtime caller, database field, and rendered component. Distinguish genuine fallbacks from unrelated fields.
3. Verify every affected record has a valid canonical media reference and that the resolver returns the intended asset.
4. Change renderers and forms to use the canonical `media_id → media_assets.id → media_assets.public_url` path only.
5. When a canonical reference is missing, show an explicit missing-media state; do not quietly substitute an unrelated image or old URL.
6. Remove old schema definitions/columns only after code and database dependency checks and explicit migration approval.

**Acceptance evidence**
- [ ] Both repositories and relevant branches are searched and results recorded.
- [ ] No unapproved legacy fallback remains in active render paths.
- [ ] Canonical references and rendered assets are checked for every affected content type.
- [ ] Missing-media behavior is explicit and tested.
- [ ] No database column was dropped without approval.

**Fix evidence / commit / tests:**
- Public repository `ianohmbaemutharimi-max/ztlounge`, branch `fix/media-canonicalization` created from `main`.
- Read-only live SQL confirmed `hero_slides.image_url` and `promotions.banner_image` are the only legacy image URL columns among the checked content tables; `menu_items`, `services`, `testimonials`, and `gallery` do not have `image_url`. Promotions currently has 0 rows; hero_slides has 2 rows and both have `media_id`.
- MenuRepository was changed to use `media_id` and MediaResolver, and static MenuConfig fallback was removed (commit `2f2d1b5db09d881d2ad25bcecd969daee31b6248`).
- **Remaining blockers:** business branding and testimonials reference semantically incorrect assets (M-15); services repository does not match live service-card schema; public URLs contain an invalid host despite most bucket/key paths matching Storage. These must be resolved before deleting all fallback code.
- No browser/runtime verification has run; status remains in progress.

### M-11 — Upload route changes need runtime and regression verification
**Severity:** High  
**Status:** OPEN

**Existing branch changes to verify:** The working branch already contains changes to `src/app/api/admin/upload/route.ts` to use live field names and map upload categories to live `media_type` enum values. It also handles duplicate lookup errors and a unique-constraint error. These changes have not yet been proven by a complete test run.

**Fix plan**
1. Re-read the route, its callers, and live constraints.
2. Verify every mapped `media_type` is a valid live enum value.
3. Confirm duplicate handling matches the approved `content_hash` contract (M-05).
4. Test successful upload, invalid type, duplicate upload, DB lookup failure, and Storage upload failure without damaging existing assets.
5. Never claim this issue verified solely because the code compiles.

**Acceptance evidence**
- [ ] Route behavior is tested using a safe test asset/environment.
- [ ] No test writes/deletes production data without approval.
- [ ] Failure cases return accurate errors and do not create orphaned records/objects.
- [ ] Type checks and route tests pass.

**Fix evidence / commit / tests:** _Add after implementation._

### M-12 — Delete guard changes need regression verification
**Severity:** High  
**Status:** OPEN

**Existing branch changes to verify:** The working branch has a fail-closed check in `src/app/api/admin/media_assets/[id]/route.ts` and an expanded reference list in `src/lib/media/reference-tables.ts`. These changes are not yet verified by a complete test run.

**Fix plan**
1. Confirm the reference registry covers all real live references and is used by the deletion route.
2. Test referenced asset, unreferenced asset, null count, and reference-query error cases.
3. Confirm the API returns a clear conflict/error instead of deleting when usage cannot be determined.
4. Ensure no delete operation reaches Storage or database until the guard succeeds.

**Acceptance evidence**
- [ ] All supported references are protected.
- [ ] Query failures block deletion.
- [ ] No false “unused” result is possible from a failed check.
- [ ] Tests pass and actual database/storage mutation behavior is documented.

**Fix evidence / commit / tests:**
- Reviewed `checkMediaReferences()` against the live registry and confirmed it checks each of the 11 registered table/column pairs. Query errors and null counts throw, causing DELETE to return 500 rather than treating the asset as unused.
- Clarified route comments so they no longer claim the Storage object is deleted; the endpoint only deletes the database row and defers Storage cleanup (commit `0aab30e03974f9eb51dde0f16721cc2d00a7e013`).
- **Verification pending:** API tests must cover each reference table, `business_settings.logo_media_id`, `favicon_media_id`, query failures, and the 409/500 behavior. No deletion was executed.

### M-13 — Public website repository and runtime paths have not been verified
**Severity:** Critical  
**Status:** IN PROGRESS

**Verified repository/branch:** `ianohmbaemutharimi-max/ztlounge`, working branch `fix/media-canonicalization`, created from `main` for isolated work. The current audit began from the GitHub source; no local browser/runtime verification has yet been performed.

**Verified public-code findings (2026-10-29):**
- `assets/js/repositories/MediaResolver.js` enforces `media_id → media_assets.id → public_url` for content collections and does not use `image_url` as a fallback in `applyResolved()`.
- `assets/js/repositories/BusinessRepository.js` still initializes resolved branding URLs from legacy `logo_url`, `logo_light_url`, and `favicon_url`; if canonical lookup fails it keeps those values.
- `assets/js/branding-init.js` explicitly keeps existing/static branding when canonical logo/favicon resolution fails.
- `assets/js/shared-components.js` still embeds hard-coded Supabase Storage URLs for both logo variants and hard-coded `data-media-id` values in injected header markup. These are active legacy fallback paths and must be traced/fixed without breaking header injection order.
- Admin `src/app/api/admin/[resource]/[id]/route.ts` no longer falls back to legacy `logo_url`/`favicon_url` when resolving business settings; canonical lookup errors return an error instead (commit `4a9fade5f073e9049e72cf5eadc1c0f946d6f5e9`).
- Admin branding PATCH rejects null logo/favicon assignments and reports the unsupported light-logo field rather than pretending it was persisted (commit `0b87ede36a6b5b4eb5e81cc27103a28bf61bfca2`).
- `assets/js/repositories/MenuRepository.js` previously read `menu_items.image_url` directly and used local `MenuConfig` fallbacks. Live SQL confirms `menu_items.image_url` does not exist and all 5 live menu rows have `media_id`; the repository was changed to resolve those IDs only through `MediaResolver` and removed its static item/category fallback (public repo commit `2f2d1b5db09d881d2ad25bcecd969daee31b6248`).
- `assets/js/repositories/ServicesRepository.js` still uses the absent `services.type` field, resolves page keys to UUIDs despite live `services.page_id` being text page slugs, and falls back to local config rows with legacy `image_url` mappings. Live SQL shows 64 services, all grouped through `service_card_type_id` (39 nav, 12 info, 13 pkg); 6 package rows intentionally have no `media_id`. This path needs a separate verified mapping to live card-type/page semantics before removing its fallback.
- `assets/js/repositories/TestimonialsRepository.js` previously had local config fallback and mapped `image_url`; live `testimonials` has no `image_url` column and its 3 canonical rows currently reference logo.webp assets. The repository was changed to use `media_id` and MediaResolver only and to remove local config fallback (public commit `3678a8fe5fc24e6d79201554bf0945b868bdf79d`). The semantic media references remain wrong and URL host correction is still blocked by M-07/M-15.
- `docs/MEDIA.md` and `docs/ARCHITECTURE.md` describe a 197-row live registry snapshot from 2026-10-18, but the live read-only SQL query on 2026-10-29 returned 73 rows. The current live database query is the source of truth; older counts are historical only.

**Gap:** Admin-side findings alone cannot prove the public site uses canonical media references. Browser/network tests and a full renderer/repository inventory are still outstanding.

**Fix plan**
1. Confirm the exact public repository and branch before inspecting or editing.
2. Search content loaders, hero/gallery/menu/service/testimonial/promotion renderers, logo/favicon initialization, JSON-LD/SEO image handling, CSS backgrounds, and inline HTML.
3. Trace media IDs from each content query to the resolver and rendered URL.
4. Test representative content types in browser/DOM/network logs.
5. Fix only confirmed legacy paths; record any intentional external image use as an explicit exception.

**Acceptance evidence**
- [ ] Repository, branch, commit, and search scope are recorded.
- [ ] Every active media rendering path has a documented source.
- [ ] No hidden URL fallback remains unaccounted for.
- [ ] Browser verification confirms expected assets load.

**Fix evidence / commit / tests:** _Add after implementation._

### M-14 — Admin terminology and operational guidance are too implementation-heavy
**Severity:** Medium  
**Status:** IN PROGRESS

**Gap:** The current Media Library concepts do not consistently reflect the canonical schema, and usage labels may rely on nonexistent page fields.

**Fix plan**
1. Use plain admin labels: **File name**, **Type**, **Alt text**, **Used in**, and **Upload status**, only where supported by the API.
2. Explain the relationship succinctly: “Content records select a media item; the Media Library manages the shared file.”
3. Display shared usage and warn before deletion; do not ask admins to manage UUIDs or raw URLs.
4. Separate global file metadata from per-content text and page placement.

**Acceptance evidence**
- [ ] Labels match real behavior.
- [ ] Admin can identify an asset and where it is used without UUID knowledge.
- [ ] Shared assets and deletion consequences are clear.
- [ ] UI usability checks completed.

**Fix evidence / commit / tests:**
- Media Library cards/edit dialog now use file name and type; the picker types and search labels match canonical fields and unsupported bucket filtering is removed (M-03 commits).
- Settings image labels now display `file_name` rather than the nonexistent `title` field (commit `ee262246d5da1ce997e37c90f855b402f8d3b6fb`).
- **Verification pending:** usability/browser checks and all API save/load flows remain untested.

### M-15 — Canonical media references point to semantically incorrect assets
**Severity:** Critical
**Status:** OPEN

**Verified gap (live data, 2026-10-29):**
- `business_settings.logo_media_id` currently equals `11111111-1111-1111-1111-111111111111`, pointing to `favicon-default.png` with relative URL `/favicon-default.png`.
- `business_settings.favicon_media_id` currently equals `22222222-2222-2222-2222-222222222222`, pointing to `logo-default.svg` with relative URL `/logo-default.svg`.
- Eight separate `media_assets` rows named `logo.webp` share one public URL; five are referenced by service records (`Barbershop`, `Beard Grooming`, `Classic Haircut`, `Kids Haircut`, `Premium Package`) and three by testimonials (`Grace Wanjiku`, `John Patron`, `Mary Customer`). Their stored `media_type` values are `service` and `testimonial` respectively, so the same logo image is currently assigned as service/testimonial imagery. The affected content record IDs are listed in the read-only audit notes for the data-repair review; no IDs or references were modified.
- The public Storage inventory contains `public-assets/images/branding/logo.webp` and separate `logos/logo.webp` / `logos/logo-white.webp` objects. The live media registry has no canonical row named `logo-white.webp` in the queried set.
- This is a data/reference-integrity issue, not something a URL resolver can safely correct by guessing.

**Fix plan**
1. Inspect the actual bytes/previews of the candidate logo, favicon, service, and testimonial objects.
2. Produce a mapping of each affected content record and current `media_id` to the intended canonical asset.
3. Confirm the correct logo/favicon assets and create or reuse canonical asset rows only after approval.
4. Reassign content references only after review; preserve auditability and test all affected public components.
5. Do not delete/merge the old rows or Storage objects until reference and byte checks are complete.

**Acceptance evidence**
- [ ] Branding settings resolve to the intended logo and favicon.
- [ ] Service and testimonial records display their intended imagery, not a logo.
- [ ] All changed `media_id` references are accounted for and browser-verified.
- [ ] Any production data writes are explicitly approved and verified.

**Fix evidence / commit / tests:** _No data changes performed; mapping and approval required._

## Execution order

1. **Re-verify baseline and branch state.**
2. **M-13 public-site audit** and full legacy-fallback inventory before removing any fallback.
3. **M-01 + M-02** schema/API contract alignment.
4. **M-04** one authoritative reference inventory and fail-closed delete protection.
5. **M-03 + M-14** admin UI and usage-label alignment.
6. **M-11 + M-12** upload/delete regression tests.
7. **M-05 + M-06 + M-07 + M-15** hash, duplicate, Storage, and semantic-reference reconciliation; production data changes require separate approval.
8. **M-08 + M-09** constraints and page-scope semantics; migrations require separate approval.
9. **M-10** remove active legacy fallbacks after canonical references and browser output are verified.
10. Final full checks and update every issue status with evidence.

## Change log

| Date | Issue | Change | Evidence | Status |
|---|---|---|---|---|
| 2026-10-29 | Tracker created | Recorded verified baseline, open gaps, safe fix sequence, and per-issue acceptance checks. No application code or database was changed by this tracker creation. | Prior read-only audit summary; re-verification required before each fix. | Tracking only |
| 2026-10-29 | M-01 | Aligned Drizzle `media_assets` definition and generic repository response allowlist to the current live schema. | Live read-only schema/constraint queries; commits `d3c9714104f8d19e028d107c6dac92c82e2dd21a`, `34a2319c413aa712dd69fa889d62a30915239f6c`. Runtime/typecheck still pending. | FIXED—UNVERIFIED |
| 2026-10-29 | M-13 | Confirmed public repo and isolated branch; traced canonical content gateway and found active legacy paths in branding/services. Changed MenuRepository and TestimonialsRepository to canonical media resolution without local config image fallback. | Public repo branch `fix/media-canonicalization`; commits `2f2d1b5db09d881d2ad25bcecd969daee31b6248`, `3678a8fe5fc24e6d79201554bf0945b868bdf79d`; live schema/row-count SQL. Browser run pending. | IN PROGRESS |
| 2026-10-29 | M-02 | Replaced stale Media API schema queries and changed usage scans to fail closed; fixed page-label lookup and pagination/filter order. | Live read-only schema query; commits `88840664988c8c4fbe3945e1f22596b4b7c6526d`, `183274dd9049ca87524fd9353bc3a0b27ddd5d64`. Typecheck/API tests pending. | FIXED—UNVERIFIED |
| 2026-10-29 | M-03 | Reworked Media Library fields and edit form to match the live schema; API now rejects edits to unsupported metadata and the UI exposes pagination. | Commits `68559bd0987b07fad32ad7e0986ab9add4b69b5c`, `949bcf8d822b6c173b1e6cad93b0b42764450a68`, `0938c2bf2de3ecc1fd190d9bc5cff265af10f484`, `5235859088a8a5cb71d49f2f4c4e59023155630a`, `2bdef470d73d2c61f1e33851f06bd99b22526f78`, `9362c3253eb9a3fccb28e0e3bdb7dd005df8a3c2`, `ca0c3f9b4e4632c76205fd81f97eb9207bc66495`, `bae0c48f055ac9fa8da9db4fbacfc11b8a9753b0`, `4669a7f84c11a6423527916976dfc3d096caf3d8`, `daf671c1694cd8dba82b7aee9c6a50d2bf4d272a`, `8eac854a1f7d7fe25cb3eb7442144a3eff0657ab`, `21f2402fa98e14579b45f922c6b3cb04408a6e68`. Runtime/typecheck tests pending. | FIXED—UNVERIFIED |
| 2026-10-29 | M-10 | Removed one confirmed legacy menu-image path by resolving menu media only through canonical media IDs; removed admin API legacy branding URL fallback; remaining public branding/services/testimonials fallbacks are inventoried but blocked on data/schema reconciliation. | Public repo commits `2f2d1b5db09d881d2ad25bcecd969daee31b6248`, `3678a8fe5fc24e6d79201554bf0945b868bdf79d`; admin commit `4a9fade5f073e9049e72cf5eadc1c0f946d6f5e9`; live SQL confirms menu/testimonial media IDs populated. | IN PROGRESS |
| 2026-10-29 | M-04 | Reconciled the reference registry against live FK and column inventories; usage API and delete guard share the registry and fail closed on query errors. | Live read-only SQL inventory; `src/lib/media/reference-tables.ts`, M-02 commits, and delete guard reviewed. Regression tests pending. | FIXED—UNVERIFIED |
| 2026-10-29 | M-08 | Aligned business-settings schema/API/UI with live columns, added fail-closed branding resolution and rejects unsupported light-logo/null assignments. FK and light-logo column migration remain pending approval. | Commits `49a832f4a39d225cbe18a0ac02c4b3ad1bda1aae`, `71e222b149eaf47281ed2af5bfce63c4ecbe4581`, `1537af6076e893d9de560351ae1d57afe7ec0974`, `4a9fade5f073e9049e72cf5eadc1c0f946d6f5e9`, `0b87ede36a6b5b4eb5e81cc27103a28bf61bfca2`. No database writes. | IN PROGRESS |
| 2026-10-29 | M-05 | Confirmed unique content-hash constraint and SHA-256 generation for new uploads; corrected contradictory upload-route comments. Legacy hash values remain unresolved pending object/byte reconciliation. | Live read-only SQL counts; `src/lib/images/processor.ts`; commits `6c3032b36b18c308fcfab64450ee7607cffb3306`, `6489ffe17800e720dbe49cae6257ef3ace726973`. No data writes. | IN PROGRESS |
| 2026-10-29 | M-06/M-07/M-15 | Compared canonical URL paths against actual `storage.objects`, identified 65 exact bucket/key matches, two unmatched Storage-shaped URLs, six relative paths, 13 duplicate URL groups, and incorrect branding/content associations. | Read-only SQL against `media_assets`, `storage.objects`, `business_settings`, and all media-reference columns; project URL verified from connected Supabase project. No data or Storage writes. | IN PROGRESS |

## Final completion criteria

- [ ] Live schema, application types, APIs, and UI agree.
- [ ] All active public/admin media paths use canonical media references or documented, approved exceptions.
- [ ] Legacy fallbacks are removed from active render paths; no silent fallback hides missing references.
- [ ] Usage counts include all verified reference columns and fail closed on errors.
- [ ] Upload and deletion lifecycle tests pass.
- [ ] Hash, duplicate URL, and Storage-object reconciliation is resolved or explicitly documented as an approved exception.
- [ ] No destructive data/schema/storage operation occurred without approval.
- [ ] Every issue above is marked **VERIFIED** or has a clearly documented **BLOCKED** reason; no issue is marked complete without evidence.
