-- Live Listen: host stays "waiting" until the guest taps Join.
-- Run once in the Supabase SQL editor (shared DB).

alter table public.listen_sessions
  add column if not exists guest_joined boolean not null default false;
