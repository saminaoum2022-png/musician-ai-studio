-- Inbound support mail (Resend receiving → admin Inbox).
-- Run after support_email_log.sql.

create table if not exists public.support_inbound_messages (
  id uuid primary key default gen_random_uuid(),
  resend_email_id text not null,
  message_id text,
  in_reply_to text,
  from_email text not null,
  from_name text,
  to_emails text[] not null default '{}',
  cc_emails text[] not null default '{}',
  subject text not null default '',
  text_body text,
  html_body text,
  headers jsonb,
  attachments jsonb not null default '[]'::jsonb,
  received_at timestamptz not null,
  is_read boolean not null default false,
  matched_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint support_inbound_messages_resend_id_key unique (resend_email_id)
);

create index if not exists support_inbound_messages_received_idx
  on public.support_inbound_messages (received_at desc);

create index if not exists support_inbound_messages_unread_idx
  on public.support_inbound_messages (is_read, received_at desc)
  where is_read = false;

create index if not exists support_inbound_messages_from_email_idx
  on public.support_inbound_messages (lower(from_email), received_at desc);

alter table public.support_inbound_messages enable row level security;

comment on table public.support_inbound_messages is
  'Inbound mail to support@ / help@ via Resend receiving webhook (admin Inbox).';
