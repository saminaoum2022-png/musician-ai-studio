-- Allow longer DM bodies for song/voice attachment JSON (URLs + metadata).
-- Run once in Supabase SQL editor.

alter table public.dm_messages
  drop constraint if exists dm_messages_body_check;

alter table public.dm_messages
  add constraint dm_messages_body_check
  check (char_length(btrim(body)) > 0 and char_length(body) <= 2000);
