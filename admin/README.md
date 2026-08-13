# Nabad AI Admin (`admin.nabadai.com`)

Standalone admin dashboard — **not** part of the iOS app or main `nabadai.com` SPA.

## Setup

### 1. Supabase SQL

Run in the SQL Editor (in order if not already applied):

1. `supabase/credits.sql` + `supabase/credits_decimal.sql` + `supabase/gifts.sql`
2. `supabase/pro_subscriptions.sql`
3. **`supabase/admin_dashboard.sql`**
4. **`supabase/admin_team_roles.sql`** — extended dashboard roles + team audit columns
5. **`supabase/admin_team_audit.sql`** — audit log, pending invites, auto-apply on signup

Then grant yourself admin (only needed once — after that use **Settings → Team & roles** in the dashboard):

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
| `SUNO_USD_PER_CREDIT` | Est. API cost per credit (default `0.00525` — $5.25 / 1000 credits) |

## Access

Open **https://admin.nabadai.com** in a desktop browser.

- **Google accounts** (most NabadAi users): tap **Continue with Google** — your Google password does not go in the email/password form.
- **Email/password accounts**: use the form below the divider.

Your account must have dashboard access (`profiles.role` is not `user`, or your email is in `ADMIN_EMAILS`).

### Dashboard roles (Settings → Team & roles)

| Role | Best for | Access |
|------|----------|--------|
| **Owner / Admin** | You, co-founders | Everything + invite/revoke teammates |
| **Operations** | Platform ops | Overview, Suno, Users, Generations, Subscriptions |
| **Support** | Customer support | Users, Credits (grant), Generations, Subscriptions |
| **Moderator** | Trust & safety | Users, Publications, Generations |
| **Finance** | Billing / revenue | Overview, Credits, Subscriptions, **Billing events**, Users |
| **Viewer** | Advisors / interns | Read-only across analytics tabs |

Teammates must **already have a NabadAi account** before you grant access. Owner emails in `ADMIN_EMAILS` cannot be revoked from the UI.

### Supabase redirect URL (required for Google)

In **Supabase → Authentication → URL configuration → Redirect URLs**, add:

- `https://admin.nabadai.com/`
- `https://nabadai.com/admin/` (if you open admin from the main domain)

Without these, Google sign-in will fail after you pick your account.

### Email + password (if Google does not work)

Google accounts do not have a password until you set one. Easiest options:

**Option A — Supabase Dashboard (no terminal)**

1. [Supabase Dashboard](https://supabase.com) → your project → **Authentication** → **Users**
2. Find your email (e.g. `saminaoum2022@gmail.com`) → **⋮** → **Send password recovery**
3. Open the email link — it may briefly open the main NabadAi site, then **redirects to admin** with a **Set admin password** form
4. Choose a password (8+ characters), save, then you’re in

If the link opens the normal login page with no redirect, copy the full URL from the browser and change the path to `/admin/` (keep `?token_hash=...&type=recovery`), or request a fresh recovery email after deploy.

**Option B — script (sets password immediately)**

From the repo root, with your **service role** key from Supabase → Settings → API:

```bash
export SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="eyJ..."
export ADMIN_EMAIL="saminaoum2022@gmail.com"
node scripts/set-admin-password.mjs
```

The script prints a generated password and sets `profiles.role = 'admin'`.

Then grant admin if needed:

```sql
update public.profiles set role = 'admin'
where user_id = (select id from auth.users where lower(email) = lower('saminaoum2022@gmail.com'));
```

## API

`GET /api/music/admin?view=overview|suno|users|user|credits|generations|publications|subscriptions|billing|settings|session`

User drill-down: `GET /api/music/admin?view=user&userId=<uuid>` — profile, credits, subscription, billing events, ledger, recent generations, and saved songs. Open from **Users** or **Billing events** via **View**.

Team management (Owner / Admin only):

- `GET /api/admin/team` — list teammates, pending invites, audit log
- `GET /api/admin/team?search=@username` — user lookup for invite form
- `POST /api/admin/team` — `{ "lookup": "email or @username", "role": "support", "sendInvite": true }`
- `DELETE /api/admin/team` — `{ "email": "..." }` or `{ "inviteId": "..." }`

Moderation (Admin + Moderator):

- `POST /api/admin/moderate` — `{ "action": "unpublish", "songId": "uuid", "reason": "..." }`

Requires `Authorization: Bearer <supabase access_token>` and appropriate dashboard role.

### Grant paid credits (portal + in-app)

`POST /api/credits/grant-paid` with body `{ "amount": 50, "email": "user@example.com" }`.

- **Admin portal** — Credits tab → **Grant paid credits** form (email optional; blank = your account).
- **iOS app** — Credits → Admin card → **Grant paid** (self only).

Manual grants are for support or gift testing. **NabadAi Pro** (including sandbox purchases) adds credits through the normal billing webhook — do not zero or replace those grants.

Requires the same admin auth as the dashboard.

## Suno bucket model

- **Master Suno balance** — live credits on your Suno API account (the bucket you purchase).
- **User outstanding** — credits allocated to users (liability).
- When a user generates, their Nabad balance drops **and** your Suno master bucket is consumed.
