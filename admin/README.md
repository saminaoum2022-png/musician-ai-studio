# Nabad AI Admin (`admin.nabadai.com`)

Standalone admin dashboard — **not** part of the iOS app or main `nabadai.com` SPA.

## Setup

### 1. Supabase SQL

Run in the SQL Editor (in order if not already applied):

1. `supabase/credits.sql` + `supabase/credits_decimal.sql` + `supabase/gifts.sql`
2. `supabase/pro_subscriptions.sql`
3. **`supabase/admin_dashboard.sql`**

Then grant yourself admin:

```sql
update public.profiles
set role = 'admin'
where user_id = (
  select id from auth.users
  where lower(email) = lower('your-admin-email@example.com')
);
```

### 2. Vercel domain

1. Vercel project → **Domains** → add `admin.nabadai.com`
2. DNS: CNAME `admin` → `cname.vercel-dns.com` (or value Vercel shows)
3. Deploy — `vercel.json` rewrites the subdomain to `/admin/*`

### 3. Optional env

| Variable | Purpose |
|----------|---------|
| `ADMIN_EMAILS` | Fallback admin gate (comma-separated) |
| `SUNO_USD_PER_CREDIT` | Est. API cost per credit (default `0.008`) |

## Access

Open **https://admin.nabadai.com** in a desktop browser and sign in with your admin Supabase account.

## API

`GET /api/music/admin?view=overview|suno|users|credits|generations|subscriptions`

Requires `Authorization: Bearer <supabase access_token>` and `profiles.role = 'admin'`.

## Suno bucket model

- **Master Suno balance** — live credits on your Suno API account (the bucket you purchase).
- **User outstanding** — credits allocated to users (liability).
- When a user generates, their Nabad balance drops **and** your Suno master bucket is consumed.
