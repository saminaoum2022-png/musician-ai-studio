-- Make dm_voice + song_archive private (Grok / storage audit).
-- Run once in Supabase SQL Editor after dm_voice_storage.sql + song_archive_storage.sql.
--
-- Playback: app uses /api/messages?type=voice_drop and /api/songs/stream (not public URLs).

begin;

update storage.buckets
set public = false
where id in ('dm_voice', 'song_archive');

drop policy if exists "dm_voice_public_read" on storage.objects;
drop policy if exists "song_archive_public_read" on storage.objects;

-- Re-assert owner-scoped write policies (reads are service-role / API only).
drop policy if exists "dm_voice_insert_own" on storage.objects;
create policy "dm_voice_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'dm_voice'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "song_archive_insert_own" on storage.objects;
create policy "song_archive_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'song_archive'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

commit;
