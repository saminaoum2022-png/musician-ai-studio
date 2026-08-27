-- Blog posts CMS (service role access only — same pattern as marketing_pages).
-- Run on production Supabase before first publish.

create table if not exists public.blog_posts (
  slug text not null,
  locale text not null default 'en',
  content jsonb not null default '{}'::jsonb,
  draft_content jsonb,
  published boolean not null default false,
  published_at timestamptz,
  draft_updated_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  primary key (slug, locale)
);

create index if not exists blog_posts_list_idx
  on public.blog_posts (locale, published, published_at desc nulls last);

alter table public.blog_posts enable row level security;
