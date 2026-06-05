# Email setup — help@nabadai.com & support@nabadai.com

The app links to two addresses:

| Address | Purpose |
|---------|---------|
| `help@nabadai.com` | General help, account, how to use the app |
| `support@nabadai.com` | Bug reports |

**Resend** (used for Supabase signup emails) only **sends** mail — it does **not** give you an inbox. You need separate setup to **receive** user emails.

---

## Recommended for launch (pick one)

### Option A — Free forwarding (fastest, ~15 min)

Forward both addresses to your personal Gmail. Good enough for App Store review and early users.

**Best tools:** [Cloudflare Email Routing](https://developers.cloudflare.com/email-routing/) (free) or [ImprovMX](https://improvmx.com/) (free tier).

**Cloudflare steps** (domain DNS must be on Cloudflare):

1. Add `nabadai.com` to [Cloudflare](https://dash.cloudflare.com) (import DNS from current host if needed).
2. **Email → Email Routing → Enable**.
3. Add destination: your Gmail (verify via code).
4. Create routes:
   - `help@nabadai.com` → your Gmail
   - `support@nabadai.com` → your Gmail (or same inbox)
5. Send a test from another account to `help@nabadai.com` — should arrive in Gmail.

**ImprovMX step-by-step:** see [ImprovMX setup (full walkthrough)](#improvmx-setup-full-walkthrough) below.

**Replying as help@nabadai.com from Gmail:** Settings → Accounts → “Send mail as” → add `help@nabadai.com` (use SMTP details from your provider, or Google Workspace if you upgrade later).

---

### Option B — Google Workspace (~$7 USD/month per user)

Real Gmail inboxes at `@nabadai.com`. Best long-term if you want Calendar, Drive, and a polished support workflow.

1. [workspace.google.com](https://workspace.google.com) → Get started.
2. Verify you own `nabadai.com` (add TXT record in DNS).
3. Add **MX records** Google provides (replace or prioritize over other MX).
4. Create users:
   - `help@nabadai.com` (primary support inbox)
   - `support@nabadai.com` as **alias** on the same user (Admin → Users → Aliases), **or** a second user if you want separate inboxes.
5. Test send + receive.

---

### Option C — Zoho Mail (free tier for small teams)

1. [zoho.com/mail](https://www.zoho.com/mail/) → free plan for custom domain.
2. Verify domain + add Zoho MX records.
3. Create `help@` and `support@` (or one mailbox + alias).
4. Use Zoho webmail or forward to Gmail.

---

## Minimum for App Store

Apple only needs addresses that **work when users email you**. Forwarding to Gmail is fine.

Checklist:

- [ ] `help@nabadai.com` receives mail
- [ ] `support@nabadai.com` receives mail (or forwards to `help@`)
- [ ] You can **reply** and users see a `@nabadai.com` address (ideal)
- [ ] Checked spam folder on first test

---

## Keep separate: Resend + noreply@

| Role | Service | Address |
|------|---------|---------|
| **Outbound** (signup, password reset) | Resend via Supabase SMTP | `noreply@nabadai.com` |
| **Inbound** (users contact you) | Cloudflare / ImprovMX / Google / Zoho | `help@`, `support@` |

Resend domain verification (SPF/DKIM) is for **sending**. Inbound MX records are different — both can coexist if MX points to your inbox provider and Resend uses SPF/DKIM on the same domain (Resend docs explain this).

---

## Simplest setup (solo founder)

1. **ImprovMX or Cloudflare** → `help@` and `support@` → your Gmail  
2. **Resend** → verify `nabadai.com` for `noreply@` (Supabase)  
3. Later: move to **Google Workspace** when volume grows  

---

## Where is nabadai.com DNS?

| DNS host | What to do |
|----------|------------|
| **Shopify** | Shopify Admin → Settings → Domains → `nabadai.com` → DNS → add MX (ImprovMX/Zoho/Google) or move DNS to Cloudflare |
| **Cloudflare** | Use Email Routing (Option A) |
| **Namecheap / GoDaddy** | Advanced DNS → add MX records from chosen provider |
| **Vercel** | Vercel only hosts the website; email DNS is usually still at your registrar |

---

---

## ImprovMX setup (full walkthrough)

### Step 1 — Create account

1. Open [improvmx.com](https://improvmx.com) → **Get Started Free**
2. Sign up with your **personal Gmail** (where you want to read support mail)
3. Confirm your ImprovMX account email if asked

### Step 2 — Add your domain

1. ImprovMX dashboard → **Add domain**
2. Enter: `nabadai.com` (no `https://`, no `www`)
3. ImprovMX shows DNS records to add — keep this tab open

### Step 3 — DNS records (at your domain registrar)

Go to wherever **`nabadai.com` DNS** is managed (Shopify, Namecheap, Cloudflare, etc.).

**Delete old MX records** on `@` / root if any exist (old Google, Zoho, etc.).  
**Do not delete** Resend records on the **`send`** subdomain if you already added them for Supabase.

Add these **three** records for the **root domain** (`@`):

| Type | Host / Name | Value | Priority |
|------|-------------|-------|----------|
| **MX** | `@` (or blank) | `mx1.improvmx.com` | **10** |
| **MX** | `@` (or blank) | `mx2.improvmx.com` | **20** |
| **TXT** | `@` (or blank) | `v=spf1 include:spf.improvmx.com ~all` | — |

**Shopify (your setup):** see [Shopify DNS + ImprovMX](#shopify-dns--improvmx) below.

**Important — Resend coexistence:** Resend usually uses the **`send`** subdomain (`send.nabadai.com`) for its MX/SPF/DKIM, not the root. ImprovMX uses **root** MX. They normally work together. If you already have a **TXT** SPF record on `@` for Resend, **merge** into one line (see [Combining SPF](https://improvmx.com/guides/combining-spf-records)) instead of adding a second SPF TXT.

Wait **5–60 minutes** (sometimes up to 24h). ImprovMX dashboard should show the domain as **active**.

Verify: [ImprovMX Inspector](https://improvmx.com/inspector) → enter `nabadai.com`

### Step 4 — Create aliases

In ImprovMX → domain `nabadai.com` → **Aliases**:

| Alias | Forwards to |
|-------|-------------|
| `help` | your Gmail (e.g. `sami.naoum@gmail.com`) |
| `support` | same Gmail (or a second inbox later) |

That creates `help@nabadai.com` and `support@nabadai.com`.

Optional: add alias `*` (catch-all) → your Gmail so `anything@nabadai.com` also reaches you.

### Step 5 — Test receiving

1. From a **different** email (not your forwarding Gmail), send to `help@nabadai.com`  
   Subject: `NabadAi test 1`
2. Check Gmail inbox **and Spam**
3. Repeat for `support@nabadai.com`
4. ImprovMX → **Logs** — confirm both show as forwarded

### Step 6 — Reply as help@nabadai.com (optional but recommended)

Forwarding only covers **incoming** mail. To **reply** so users see `help@nabadai.com`:

**Option A — ImprovMX SMTP in Gmail (reply as help@ / support@)**

**Requires a paid ImprovMX plan** (free = receive only). Cheapest: **Light ~$50/year** (25 outbound emails/day — enough for support).

1. ImprovMX → **Upgrade** to Light (or Premium)
2. Domain `nabadai.com` → ⚙ → **SMTP Credentials** → add user e.g. `help@nabadai.com` + password
3. ImprovMX → **DKIM / DMARC** — copy TXT records into **Shopify DNS** (same page as MX)
4. Gmail → **Settings** → **See all settings** → **Accounts and Import** → **Send mail as** → **Add another email address**
   - Email: `help@nabadai.com`
   - Uncheck **Treat as an alias**
   - SMTP: `smtp.improvmx.com`, port **587**, TLS
   - Username: `help@nabadai.com`
   - Password: ImprovMX SMTP password from step 2
5. Gmail sends verification to `help@` → arrives in your Gmail via forward → enter code
6. Repeat steps 4–5 for `support@nabadai.com` (second SMTP credential, or same per ImprovMX UI)
7. Test: **Compose** → **From:** `help@nabadai.com` → send to a **different** email address

Full guide: [improvmx.com/guides/gmail-smtp](https://improvmx.com/guides/gmail-smtp)

**Option B — Reply from Gmail as-is (free)**

You can reply from personal Gmail for now; users will see your Gmail address until Option A is set up.

### Troubleshooting

| Problem | Fix |
|---------|-----|
| ImprovMX says DNS not valid | Double-check MX host is `@` not `nabadai.com`; wait longer |
| No mail in Gmail | Check Spam; check ImprovMX **Logs** for bounces |
| Resend signup emails broke | Ensure you did not remove Resend `send` subdomain records |
| Two SPF TXT on `@` | Merge into one SPF record |

---

## Shopify DNS + ImprovMX

DNS for `nabadai.com` is in **Shopify** — add ImprovMX records there only. No GoDaddy or Cloudflare needed.

### A — ImprovMX account + domain

1. [improvmx.com](https://improvmx.com) → sign up (free)
2. **Add domain** → `nabadai.com`

### B — Shopify DNS records

1. **Shopify Admin** → **Settings** → **Domains**
2. Under **Shopify-managed domains**, click **`nabadai.com`**
3. **DNS settings** → **Manage**

#### Delete old MX (if any)

In the DNS list, find any existing **MX** records on the root domain (`@`).  
Click **⋯** → **Remove** on each.

**Do not delete:**

- **A** / **CNAME** records (website)
- Records on **`send`** (Resend — Supabase signup emails)

#### Add MX record 1

1. **Add custom record** → **MX record**
2. **Name:** `@` (or leave the name field as Shopify defaults for root)
3. **Points to / Mail server:** `mx1.improvmx.com`
4. **Priority:** `10`
5. **TTL:** Auto
6. **Confirm**

#### Add MX record 2

Same steps, but:

- **Points to:** `mx2.improvmx.com`
- **Priority:** `20`

#### Add SPF (TXT)

1. **Add custom record** → **TXT record**
2. **Name:** `@` (or leave default — Shopify: don’t change name field unless you know you need `@`)
3. **Value / Points to:**

```
v=spf1 include:spf.improvmx.com ~all
```

4. **Confirm**

**If you already have a TXT record on `@` starting with `v=spf1`** (e.g. from another service), edit it to **merge** includes — only **one** SPF TXT on `@`. Resend usually uses **`send`** subdomain, so root `@` is often free.

Wait **15–60 minutes**. ImprovMX dashboard should show **Email forwarding active**.

### C — Aliases in ImprovMX

| Alias | Forwards to |
|-------|-------------|
| `help` | your Gmail |
| `support` | your Gmail |

### D — Test

Email `help@nabadai.com` from another account → check Gmail + Spam.

Shopify help: [Editing DNS settings](https://help.shopify.com/en/manual/domains/managing-domains/edit-dns-settings)  
ImprovMX + Shopify: [improvmx.com/guides/shopify](https://improvmx.com/guides/shopify)

---

See also: [LAUNCH_CHECKLIST.md](./LAUNCH_CHECKLIST.md) Phase 1 → Email & support.
