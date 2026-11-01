-- Permit identical image bytes to exist as independent role-specific media assets.
-- content_hash is descriptive integrity metadata, not a global identity key:
-- Services, Gallery, Hero, etc. may each own a separate media ID and Storage path.
begin;

alter table public.media_assets
  drop constraint if exists media_assets_content_hash_key;

create index if not exists media_assets_content_hash_idx
  on public.media_assets (content_hash);

comment on column public.media_assets.content_hash is
  'SHA-256 of normalized file bytes; intentionally non-unique because separate content roles may own independent copies.';

commit;
