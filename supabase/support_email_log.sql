-- Pro support email log (manual sends from admin dashboard).
-- Run in Supabase SQL Editor after pro_subscriptions.sql.

create table if not exists public.support_email_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  template_id text not null,
  recipient_email text not null,
  subject text not null,
  sent_by_user_id uuid references auth.users (id) on delete set null,
  sent_by_email text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  constraint support_email_log_template_check check (
    template_id in (
      'trial_welcome',
      'trial_ending',
      'first_paid',
      'feedback_checkin',
      'cancel_confirm'
    )
  )
);

create index if not exists support_email_log_user_idx
  on public.support_email_log (user_id, created_at desc);

create index if not exists support_email_log_template_idx
  on public.support_email_log (template_id, created_at desc);

alter table public.support_email_log enable row level security;

comment on table public.support_email_log is
  'Audit log for manual Pro lifecycle emails sent from admin (Resend).';
