-- Voice status clips (uploadStatusVoiceBlob in app.js)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'status_audio',
  'status_audio',
  true,
  524288,
  array['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/x-m4a', 'audio/m4a']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "status_audio_public_read" on storage.objects;
create policy "status_audio_public_read"
  on storage.objects for select
  using (bucket_id = 'status_audio');

drop policy if exists "status_audio_insert_own" on storage.objects;
create policy "status_audio_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'status_audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "status_audio_update_own" on storage.objects;
create policy "status_audio_update_own"
  on storage.objects for update
  using (
    bucket_id = 'status_audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "status_audio_delete_own" on storage.objects;
create policy "status_audio_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'status_audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
