-- Allow refund_confirm in support email log.
-- Run after support_email_log_compose.sql.

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
      'refund_confirm',
      'custom_compose'
    )
  );
