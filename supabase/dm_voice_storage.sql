-- DM voice drops (compressed clips, max 2 MB — see src/dm-voice-drop.js)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'dm_voice',
  'dm_voice',
  true,
  2097152,
  array[
    'audio/webm',
    'audio/webm;codecs=opus',
    'audio/mp4',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mpeg',
    'audio/ogg',
    'audio/x-m4a',
    'audio/m4a'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "dm_voice_public_read" on storage.objects;
create policy "dm_voice_public_read"
  on storage.objects for select
  using (bucket_id = 'dm_voice');

drop policy if exists "dm_voice_insert_own" on storage.objects;
create policy "dm_voice_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'dm_voice'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "dm_voice_update_own" on storage.objects;
create policy "dm_voice_update_own"
  on storage.objects for update
  using (
    bucket_id = 'dm_voice'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "dm_voice_delete_own" on storage.objects;
create policy "dm_voice_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'dm_voice'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
