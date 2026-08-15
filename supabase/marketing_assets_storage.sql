-- Public marketing asset uploads (hero images) — server uploads via service role in /api/admin/marketing.
-- Run in Supabase SQL Editor after marketing_pages.sql.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'marketing_assets',
  'marketing_assets',
  true,
  8388608, -- 8 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "marketing_assets_public_read" on storage.objects;
create policy "marketing_assets_public_read"
  on storage.objects for select
  using (bucket_id = 'marketing_assets');
