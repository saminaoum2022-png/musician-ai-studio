-- Pro Singers Phase A — application photo + singer assignment status.
-- Run in Supabase SQL Editor after pro_singers.sql.

begin;

alter table public.singer_applications
  add column if not exists photo_url text not null default '';

alter table public.pro_singers
  add column if not exists photo_url text not null default '';

alter table public.pro_singer_requests
  add column if not exists singer_assignment_status text not null default '';

alter table public.pro_singer_requests
  add column if not exists singer_decline_reason text not null default '';

-- Drop old check if re-running; ignore errors on first run.
alter table public.pro_singer_requests
  drop constraint if exists pro_singer_requests_singer_assignment_status_check;

alter table public.pro_singer_requests
  add constraint pro_singer_requests_singer_assignment_status_check
  check (singer_assignment_status in ('', 'pending', 'accepted', 'declined'));

create index if not exists pro_singer_requests_singer_assignment_idx
  on public.pro_singer_requests (singer_id, singer_assignment_status, created_at desc);

commit;
