-- Allow the 1 November credits template (and trial_canceled) in Sent.
-- Run on production Supabase after support_email_log_refund.sql.
-- Shared DB: this only loosens the template check; it does not change balances.

alter table public.support_email_log
  drop constraint if exists support_email_log_template_check;

alter table public.support_email_log
  add constraint support_email_log_template_check check (
    template_id in (
      'trial_welcome',
      'trial_ending',
      'first_paid',
      'feedback_checkin',
      'cancel_confirm',
      'trial_canceled',
      'refund_confirm',
      'custom_compose',
      'pro_credits_update'
    )
  );
