-- One Stripe weekly trial per email — survives account deletion (stops delete/recreate trial farming).
-- Run in Supabase SQL Editor after deploy, OR create manually in Table Editor.
--
-- No FK to auth.users — when someone deletes their account, this row stays.

create table if not exists public.stripe_trial_claims (
  email_lower text primary key,
  last_user_id uuid,
  stripe_subscription_id text,
  source text not null default 'trial_start',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.stripe_trial_claims is
  'Tracks which emails already received (or started) a Stripe weekly Pro free trial.';

alter table public.stripe_trial_claims enable row level security;
-- No user policies — service role only (Vercel API).

-- ---------- Backfill (run once after creating the table) -------------------
-- Add emails that already used a Stripe weekly trial (from Stripe Dashboard):
--
-- insert into public.stripe_trial_claims (email_lower, source)
-- values
--   ('gh.alanoud1@gmail.com', 'backfill'),
--   ('1002169726@edu-darom.org.il', 'backfill')
-- on conflict (email_lower) do nothing;
