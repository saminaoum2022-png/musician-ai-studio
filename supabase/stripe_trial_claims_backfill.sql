-- Backfill stripe_trial_claims for emails that already used a Stripe weekly trial.
-- Run AFTER stripe_trial_claims.sql (table must exist).
-- Safe to re-run (ON CONFLICT DO NOTHING).

insert into public.stripe_trial_claims (email_lower, source)
values
  ('gh.alanoud1@gmail.com', 'backfill'),
  ('1002169726@edu-darom.org.il', 'backfill'),
  ('afrahja11@icloud.com', 'backfill'),
  ('imadelmilook@gmail.com', 'backfill'),
  ('aimannabhi@gmail.com', 'backfill'),
  ('rorittaismail106@gmail.com', 'backfill'),
  ('nada.alshamsi@hotmail.com', 'backfill')
on conflict (email_lower) do nothing;

-- Add any other trial emails from Stripe Dashboard → Subscriptions (Trialing + Canceled trials).
