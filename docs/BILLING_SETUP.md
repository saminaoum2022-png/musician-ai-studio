# Apple subscriptions — setup guide

NabadAi Pro billing uses **RevenueCat** on iPhone and a provider-neutral backend (`/api/billing/*`).

## 1. Supabase (one-time)

Run in SQL Editor (in order):

1. `supabase/pro_subscriptions.sql`
2. `supabase/billing_subscriptions.sql`

## 2. RevenueCat

1. Create a project at [revenuecat.com](https://www.revenuecat.com)
2. Add **iOS app** with bundle ID `com.nabadai.music`
3. Connect **App Store Connect** (Shared Secret or App Store Connect API)
4. Create entitlement: **`pro`**
5. Create offering (e.g. `default`) with packages:
   - Weekly → `com.nabadai.music.pro.weekly`
   - Monthly → `com.nabadai.music.pro.monthly`
6. **Integrations → Webhooks**
   - URL: `https://www.nabadai.com/api/billing/webhook`
   - Authorization header: same value as `REVENUECAT_WEBHOOK_AUTH` on Vercel
7. Copy API keys:
   - **Public iOS SDK key** → `REVENUECAT_IOS_API_KEY`
   - **Secret API key** → `REVENUECAT_SECRET_API_KEY`

## 3. App Store Connect

Create subscription group **NabadAi Pro**:

| Product ID | Price | Trial |
|------------|-------|-------|
| `com.nabadai.music.pro.weekly` | $3.99/week | 7 days free |
| `com.nabadai.music.pro.monthly` | $9.99/month | — |

Product IDs must match `src/pro-plan-config.js` exactly.

## 4. Vercel env vars

| Variable | Where |
|----------|--------|
| `REVENUECAT_IOS_API_KEY` | Public — exposed via `/api/public-config` |
| `REVENUECAT_SECRET_API_KEY` | Secret — server sync + RevenueCat REST |
| `REVENUECAT_WEBHOOK_AUTH` | Secret — webhook Authorization header |

Redeploy after adding env vars.

## 5. Test on iPhone (Sandbox)

1. Create a **Sandbox Apple ID** in App Store Connect → Users and Access
2. Sign out of App Store on the test iPhone (Settings → App Store)
3. Build/install app from Xcode or TestFlight
4. Sign in to NabadAi with `saminaoum2022@gmail.com`
5. Settings → NabadAi Pro → Subscribe
6. Confirm in admin dashboard → **Subscriptions** tab
7. Confirm credits increased in **Credits** tab

## What happens on purchase

```
iPhone (RevenueCat SDK)
  → Apple payment
  → RevenueCat webhook → POST /api/billing/webhook
  → upsert pro_subscriptions + grant_paid_credits
  → app calls POST /api/billing/sync (backup)
```

## Credit grants (from pro-plan-config.js)

| Plan | Credits per renewal |
|------|---------------------|
| Weekly (incl. trial week) | 400 |
| Monthly | 1,200 (1,000 + 200 bonus) |

## Not in v1 (can add later)

- Pro feature gating (Coach, Studio, cover refresh, analytics, badge; WAV & stems coming soon)
- One-time credit packs (`com.nabadai.music.credits.*`)

---

## Stripe web billing (nabadai.com)

Web subscriptions use **Stripe Checkout** alongside iOS RevenueCat. Both write to the same `pro_subscriptions` row and grant the same credits.

### 1. Stripe Dashboard

1. Create product **NabadAi Pro** with recurring prices:
   - **Weekly** — $3.99/week (optional: also set 7-day trial on the price)
   - **Monthly** — $9.99/month
2. Copy each **Price ID** (`price_…`).
3. **Developers → Webhooks** → Add endpoint:
   - URL: `https://www.nabadai.com/api/billing/stripe-webhook`
   - Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`
4. Copy **Secret key** and **Webhook signing secret**.

For staging, add a second webhook pointing at your Vercel preview URL.

### 2. Vercel env vars

| Variable | Where |
|----------|--------|
| `STRIPE_SECRET_KEY` | Secret — Checkout, Portal, webhooks |
| `STRIPE_WEBHOOK_SECRET` | Secret — webhook signature verification |
| `STRIPE_PRICE_WEEKLY` | Price ID for weekly plan |
| `STRIPE_PRICE_MONTHLY` | Price ID for monthly plan |
| `NABAD_PUBLIC_ORIGIN` | Optional — `https://www.nabadai.com` (used for Checkout return URLs) |

Redeploy after adding env vars. `/api/public-config` exposes `stripeWebEnabled: true` when all three Stripe vars are set.

### 3. Web flow

```
Browser (nabadai.com)
  → POST /api/billing/checkout
  → Stripe Checkout
  → Stripe webhook → POST /api/billing/stripe-webhook
  → upsert pro_subscriptions + grant_paid_credits
  → app calls POST /api/billing/sync (backup)
```

Manage/cancel: **Manage subscription** → POST `/api/billing/portal` → Stripe Customer Portal.

### 4. iOS + web together

- iOS keeps using RevenueCat — no changes required.
- One `pro_subscriptions` row per user. If someone already has Pro via Apple, web checkout returns an error.
- Credits match iOS: 400/week (incl. trial), 1,200/month.
