-- Cached Suno timestamped (karaoke) lyrics — one row per audio clip.
-- Service role only; API reads/writes after the first paid Suno fetch.

create table if not exists public.music_timestamped_lyrics (
  audio_id text primary key,
  provider text not null default 'suno',
  provider_task_id text not null default '',
  aligned_words jsonb not null default '[]'::jsonb,
  hoot_cer numeric,
  fetched_at timestamptz not null default now()
);

create index if not exists music_timestamped_lyrics_fetched_at_idx
  on public.music_timestamped_lyrics (fetched_at desc);

alter table public.music_timestamped_lyrics enable row level security;

comment on table public.music_timestamped_lyrics is
  'Global cache of timestamped lyrics per audio_id. Avoids repeat Suno get-timestamped-lyrics charges.';
