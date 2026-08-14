-- Read receipts: let thread participants see each other's read cursor + Realtime updates.
-- Run once in Supabase SQL editor (safe to re-run).

ALTER TABLE public.dm_thread_reads REPLICA IDENTITY FULL;

DROP POLICY IF EXISTS "dm_thread_reads_select_participant" ON public.dm_thread_reads;
CREATE POLICY "dm_thread_reads_select_participant"
  ON public.dm_thread_reads FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.dm_threads t
      WHERE t.id = dm_thread_reads.thread_id
        AND (t.user_a = auth.uid() OR t.user_b = auth.uid())
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'dm_thread_reads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_thread_reads;
  END IF;
END $$;
