-- song_covers — user-uploaded song cover art (photo mode, player cover change)
-- Run in Supabase SQL Editor. Client uploads via storage API (see uploadSongCoverBlob in app.js).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'song_covers',
  'song_covers',
  true,
  2097152, -- 2 MB per cover (client downscales before upload)
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "song_covers_public_read" on storage.objects;
create policy "song_covers_public_read"
  on storage.objects for select
  using (bucket_id = 'song_covers');

drop policy if exists "song_covers_insert_own" on storage.objects;
create policy "song_covers_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'song_covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "song_covers_update_own" on storage.objects;
create policy "song_covers_update_own"
  on storage.objects for update
  using (
    bucket_id = 'song_covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "song_covers_delete_own" on storage.objects;
create policy "song_covers_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'song_covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
