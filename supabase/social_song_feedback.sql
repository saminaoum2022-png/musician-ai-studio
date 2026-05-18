create table if not exists public.social_song_feedback (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.user_songs(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  listener_user_id uuid not null references auth.users(id) on delete cascade,
  feedback_type text not null check (feedback_type in ('hook', 'lyrics', 'replay', 'remix')),
  created_at timestamptz not null default now(),
  unique (song_id, listener_user_id, feedback_type)
);

create index if not exists social_song_feedback_owner_created_idx
  on public.social_song_feedback (owner_user_id, created_at desc);

create index if not exists social_song_feedback_song_type_idx
  on public.social_song_feedback (song_id, feedback_type);

alter table public.social_song_feedback enable row level security;

drop policy if exists "song feedback is readable for public song counts" on public.social_song_feedback;
create policy "song feedback is readable for public song counts"
  on public.social_song_feedback for select
  using (
    exists (
      select 1
      from public.user_songs s
      where s.id = social_song_feedback.song_id
        and s.public_on_profile is true
    )
  );

drop policy if exists "listeners can add public song feedback" on public.social_song_feedback;
create policy "listeners can add public song feedback"
  on public.social_song_feedback for insert
  with check (
    auth.uid() = listener_user_id
    and auth.uid() <> owner_user_id
    and exists (
      select 1
      from public.user_songs s
      where s.id = social_song_feedback.song_id
        and s.user_id = social_song_feedback.owner_user_id
        and s.public_on_profile is true
    )
  );
