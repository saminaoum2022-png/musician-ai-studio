-- Enable Supabase Realtime (postgres_changes) for direct messages.
-- Run once in the Supabase SQL editor when deploying Phase 2.
-- Safe to re-run: skips if the table is already in the publication.

ALTER TABLE public.dm_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'dm_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_messages;
  END IF;
END $$;
