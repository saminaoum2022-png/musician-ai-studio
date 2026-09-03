-- Allow freeform compose logs without a linked user (optional user_id).
-- Run after support_email_log.sql.

alter table public.support_email_log
  alter column user_id drop not null;

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
      'custom_compose'
    )
  );
