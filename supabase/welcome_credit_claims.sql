-- One welcome bonus per email — survives account deletion (stops delete/recreate farming).
-- Run in Supabase SQL Editor, OR create manually in Table Editor (see bottom).
--
-- No FK to auth.users — when someone deletes their account, this row stays.

create table if not exists public.welcome_credit_claims (
  email_lower text primary key,
  last_user_id uuid,
  credits_granted numeric(14, 4) not null default 0,
  source text not null default 'grant',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.welcome_credit_claims is
  'Tracks which emails already received (or forfeited) the web signup welcome credits.';

alter table public.welcome_credit_claims enable row level security;
-- No user policies — service role only (Vercel API).

-- ---------- Manual setup (no SQL paste) ------------------------------------
-- Supabase → Table Editor → New table → welcome_credit_claims
-- Columns:
--   email_lower     text      primary key
--   last_user_id    uuid      nullable
--   credits_granted numeric   default 0
--   source          text      default grant
--   created_at      timestamptz  default now()
--   updated_at      timestamptz  default now()
-- Enable RLS on the table (no policies needed for users).
