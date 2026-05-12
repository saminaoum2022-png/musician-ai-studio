-- search_templates — curated Search tab shelves (see src/app.js Search v2).
-- Run in Supabase SQL Editor. Client falls back to in-code SEARCH_TEMPLATE_FALLBACK
-- if this table is missing, empty, or RLS blocks reads.
--
-- Columns mirror the client mapper `mapSearchTemplateRowFromDb`.

create table if not exists public.search_templates (
  id text primary key,
  shelf text not null,
  occasion text not null,
  title text not null,
  sub text not null,
  chip text default '',
  style text not null,
  lyrics text not null,
  keywords text[] not null default '{}',
  cover_url text default '',
  preview_url text default '',
  sort_order int not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create index if not exists search_templates_shelf_sort_idx
  on public.search_templates (shelf, sort_order, id);

alter table public.search_templates enable row level security;

drop policy if exists "search_templates_select_public_active" on public.search_templates;

create policy "search_templates_select_public_active"
  on public.search_templates for select
  to anon, authenticated
  using (active = true);

-- Example rows (merge by id with app defaults). Add cover_url / preview_url when you have assets.
-- Re-run safe: conflicts skip.
insert into public.search_templates (id, shelf, occasion, title, sub, chip, style, lyrics, keywords, cover_url, preview_url, sort_order, active)
values
(
  'bday-jazz',
  'birthday',
  'Birthday · Jazz lounge',
  'Happy Birthday Jazz',
  'A warm jazz-club birthday number — we''ll sing their name in the chorus.',
  'Birthday',
  'Jazz, smooth piano, brushed drums, upright bass, warm vocal, 90 bpm',
  $lyr$Happy birthday [name], the room is yours tonight
Lights down low, the band plays bright
Here's to the years and all the highs to come
[name], take the floor — this song's your one$lyr$,
  array['birthday','bday','anniversaire','عيد ميلاد','happy birthday','jazz']::text[],
  '',
  '',
  0,
  true
),
(
  'bday-trap',
  'birthday',
  'Birthday · Trap hype',
  'Birthday Trap',
  'Loud, modern, and hype — for the squad night out.',
  'Birthday',
  'Trap, 808s, hi-hats, hype vocal, 145 bpm',
  $lyr2$[name] in the building, light it up
Cake on the table, drinks on the cup
It's your night, it's your year
[name], [name], everybody cheer$lyr2$,
  array['birthday','bday','hype','trap','party']::text[],
  '',
  '',
  10,
  true
)
on conflict (id) do nothing;
