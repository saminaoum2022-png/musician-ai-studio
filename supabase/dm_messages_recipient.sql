-- Inbound DM realtime filter: dm_messages.recipient_id is the other participant.
--
-- Lock-light. Additive. Existing rows stay valid with NULL until backfill.
-- Live production API does not need this column; the trigger fills it on insert.
--
-- Do NOT run this whole file as one transaction. CREATE INDEX CONCURRENTLY
-- and VALIDATE CONSTRAINT cannot run inside a transaction (Supabase SQL
-- editor often wraps a paste in one txn — run each STEP separately).
--
-- Safe to re-run. If you already applied the earlier version of this file,
-- leftover steps no-op.

-- =============================================================================
-- STEP 1 — nullable column, no default, no FK (milliseconds, catalog-only)
-- =============================================================================
alter table public.dm_messages
  add column if not exists recipient_id uuid;

-- =============================================================================
-- STEP 2 — trigger BEFORE backfill so new sends are never left NULL
-- =============================================================================
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

-- =============================================================================
-- STEP 3 — backfill in small batches (SKIP LOCKED so live sends are not blocked)
-- =============================================================================
do $$
declare
  batch_size int := 400;
  updated int;
begin
  loop
    with batch as (
      select m.id, m.thread_id, m.sender_id
      from public.dm_messages m
      where m.recipient_id is null
      order by m.created_at
      limit batch_size
      for update skip locked
    )
    update public.dm_messages m
    set recipient_id = case
      when t.user_a = b.sender_id then t.user_b
      else t.user_a
    end
    from batch b
    join public.dm_threads t on t.id = b.thread_id
    where m.id = b.id;

    get diagnostics updated = row_count;
    exit when updated = 0;
    perform pg_sleep(0.05);
  end loop;
end;
$$;

-- =============================================================================
-- STEP 4 — index without blocking writes (MUST be its own statement / no txn)
-- =============================================================================
create index concurrently if not exists dm_messages_recipient_created_idx
  on public.dm_messages (recipient_id, created_at desc);

-- =============================================================================
-- STEP 5 — FK as NOT VALID (no full-table rewrite), then validate (allows DML)
-- Skip if the earlier SQL already attached REFERENCES on ADD COLUMN.
-- =============================================================================
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dm_messages_recipient_id_fkey'
      and conrelid = 'public.dm_messages'::regclass
  ) then
    alter table public.dm_messages
      add constraint dm_messages_recipient_id_fkey
      foreign key (recipient_id) references auth.users(id) on delete cascade
      not valid;
  end if;
end;
$$;

-- Own statement. ShareUpdateExclusive — reads and DM writes still go through.
alter table public.dm_messages
  validate constraint dm_messages_recipient_id_fkey;
