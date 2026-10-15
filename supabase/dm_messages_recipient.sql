-- Inbound DM realtime filter: dm_messages.recipient_id is the other participant.
-- Safe to re-run. Shared staging/production DB — run before clients subscribe with
-- recipient_id=eq.{uid} or inbox live inserts will not match.

alter table public.dm_messages
  add column if not exists recipient_id uuid references auth.users(id) on delete cascade;

update public.dm_messages m
set recipient_id = case
  when t.user_a = m.sender_id then t.user_b
  else t.user_a
end
from public.dm_threads t
where t.id = m.thread_id
  and m.recipient_id is null;

create index if not exists dm_messages_recipient_created_idx
  on public.dm_messages (recipient_id, created_at desc);

create or replace function public.dm_messages_set_recipient()
returns trigger
language plpgsql
as $$
begin
  if new.recipient_id is null then
    select case
      when t.user_a = new.sender_id then t.user_b
      else t.user_a
    end
      into new.recipient_id
    from public.dm_threads t
    where t.id = new.thread_id;
  end if;
  return new;
end;
$$;

drop trigger if exists dm_messages_set_recipient on public.dm_messages;
create trigger dm_messages_set_recipient
  before insert or update of thread_id, sender_id
  on public.dm_messages
  for each row
  execute function public.dm_messages_set_recipient();
