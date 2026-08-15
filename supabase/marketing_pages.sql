-- Marketing CMS — editable homepage copy and assets (admin-only writes via service role).
-- Run once in Supabase SQL Editor (production project).

create table if not exists public.marketing_pages (
  page_key text not null,
  locale text not null default 'en',
  content jsonb not null default '{}'::jsonb,
  published boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  primary key (page_key, locale)
);

create index if not exists marketing_pages_updated_idx
  on public.marketing_pages (updated_at desc);

alter table public.marketing_pages enable row level security;

-- No policies: anon/authenticated cannot read/write via PostgREST.
-- Vercel APIs use the service role key.

comment on table public.marketing_pages is
  'Marketing site content (homepage, locales). Edited via admin.nabadai.com; read via /api/marketing/content.';
