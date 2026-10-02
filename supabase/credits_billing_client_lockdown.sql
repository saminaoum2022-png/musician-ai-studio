-- Grok security item 7: credits / billing — no direct browser (anon/authenticated) access.
-- Run once in Supabase SQL Editor (shared production DB).
--
-- App reads balances via GET /api/credits/me and mutations via Vercel (service role + RPCs).
-- After this migration, PostgREST with a user JWT must not SELECT/PATCH money tables.

begin;

-- Drop every RLS policy on billing-related tables (covers prod drift beyond repo).
do $$
declare
  r record;
  t text;
  tables text[] := array[
    'user_credits',
    'credit_ledger',
    'promo_codes',
    'promo_redemptions',
    'billing_events',
    'pro_subscriptions',
    'gift_events',
    'welcome_credit_claims',
    'stripe_trial_claims',
    'user_push_subscriptions',
    'credits_transactions'
  ];
begin
  foreach t in array tables loop
    if to_regclass(format('public.%I', t)) is null then
      raise notice 'skip missing table public.%', t;
      continue;
    end if;
    for r in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy if exists %I on public.%I', r.policyname, t);
      raise notice 'dropped policy % on public.%', r.policyname, t;
    end loop;
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Default deny: remove table privileges from API roles (RLS alone is not enough if policies exist).
do $$
declare
  t text;
  tables text[] := array[
    'user_credits',
    'credit_ledger',
    'promo_codes',
    'promo_redemptions',
    'billing_events',
    'pro_subscriptions',
    'gift_events',
    'welcome_credit_claims',
    'stripe_trial_claims',
    'user_push_subscriptions',
    'credits_transactions'
  ];
begin
  foreach t in array tables loop
    if to_regclass(format('public.%I', t)) is null then
      continue;
    end if;
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;

commit;

-- ---------- Verify (replace JWT + URL; expect 401/403 or empty, never 200 with rows) ----------
-- curl -s -o /dev/null -w "%{http_code}" \
--   "$SUPABASE_URL/rest/v1/user_credits?select=balance&limit=1" \
--   -H "apikey: $ANON_KEY" -H "Authorization: Bearer $USER_JWT"
--
-- curl -s -X PATCH "$SUPABASE_URL/rest/v1/user_credits?user_id=eq.$USER_UUID" \
--   -H "apikey: $ANON_KEY" -H "Authorization: Bearer $USER_JWT" \
--   -H "Content-Type: application/json" -d '{"balance":99999}'
-- Expect failure; balance unchanged in dashboard / GET /api/credits/me.
