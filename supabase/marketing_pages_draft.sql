-- Marketing CMS — server-side draft workspace (Shopify-style live vs draft).
-- Run once in Supabase SQL Editor after marketing_pages.sql.

alter table public.marketing_pages
  add column if not exists draft_content jsonb,
  add column if not exists draft_updated_at timestamptz,
  add column if not exists published_at timestamptz;

comment on column public.marketing_pages.draft_content is
  'Unpublished edits — promoted to content on Publish. NULL = no pending draft.';
comment on column public.marketing_pages.draft_updated_at is
  'When draft_content was last saved from admin.';
comment on column public.marketing_pages.published_at is
  'When content was last published to the live site.';

create index if not exists marketing_pages_draft_updated_idx
  on public.marketing_pages (draft_updated_at desc nulls last);
