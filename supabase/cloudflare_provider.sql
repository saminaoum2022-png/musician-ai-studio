-- Allow Cloudflare Workers AI in provider spend logs.
-- Run on production Supabase (shared DB) before logging cloudflare cover_image events.

alter table public.provider_usage_events
  drop constraint if exists provider_usage_events_provider_check;

alter table public.provider_usage_events
  add constraint provider_usage_events_provider_check check (
    provider in ('suno', 'lyria', 'elevenlabs', 'gemini', 'pollinations', 'cloudflare', 'minimax', 'other')
  );

alter table public.provider_wallet_events
  drop constraint if exists provider_wallet_events_provider_check;

alter table public.provider_wallet_events
  add constraint provider_wallet_events_provider_check check (
    provider in ('suno', 'lyria', 'elevenlabs', 'gemini', 'pollinations', 'cloudflare', 'minimax', 'other')
  );
