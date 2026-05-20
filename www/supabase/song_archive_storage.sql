-- song_archive — permanent audio copies (see api/songs/archive.js)
-- Run in Supabase SQL Editor after creating the bucket (or use the insert below).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'song_archive',
  'song_archive',
  true,
  52428800,
  array['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/webm', 'audio/ogg', 'application/octet-stream']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public read (playback from app + Hub)
drop policy if exists "song_archive_public_read" on storage.objects;
create policy "song_archive_public_read"
  on storage.objects for select
  using (bucket_id = 'song_archive');

-- Server uploads via service role (api/songs/archive.js). Optional: allow
-- authenticated users to upload only under their own folder.
drop policy if exists "song_archive_insert_own" on storage.objects;
create policy "song_archive_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'song_archive'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "song_archive_update_own" on storage.objects;
create policy "song_archive_update_own"
  on storage.objects for update
  using (
    bucket_id = 'song_archive'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "song_archive_delete_own" on storage.objects;
create policy "song_archive_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'song_archive'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
