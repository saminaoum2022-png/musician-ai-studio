-- moments — 24h moment images (see uploadMomentBlob in app.js)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'moments',
  'moments',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "moments_public_read" on storage.objects;
create policy "moments_public_read"
  on storage.objects for select
  using (bucket_id = 'moments');

drop policy if exists "moments_insert_own" on storage.objects;
create policy "moments_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'moments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "moments_update_own" on storage.objects;
create policy "moments_update_own"
  on storage.objects for update
  using (
    bucket_id = 'moments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "moments_delete_own" on storage.objects;
create policy "moments_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'moments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
