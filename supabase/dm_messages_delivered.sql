-- DM delivery receipts (BBM-style ✓ → ✓D before ✓R read).
-- Run once in Supabase SQL editor. Safe to re-run.

alter table public.dm_messages
  add column if not exists delivered_at timestamptz;

create index if not exists dm_messages_thread_delivered_idx
  on public.dm_messages (thread_id, delivered_at desc nulls last)
  where delivered_at is not null;
