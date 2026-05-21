# Fix login: Vercel 403 Forbidden

If you see **403: Forbidden** in the browser, or the app says **"Could not load login settings"**, the whole Vercel deployment is locked. The app cannot load `/api/public-config` (Supabase URL + anon key), so Google sign-in never starts.

Verified: `https://musician-ai-studio.vercel.app/` and `/api/public-config` return **403** while Deployment Protection is on.

## Fix A — Turn off protection (simplest)

1. [Vercel Dashboard](https://vercel.com) → **musician-ai-studio** project.
2. **Settings** → **Deployment Protection**.
3. For **Production** (and **Preview** if you test there): set protection to **Off** / not enabled for public traffic.
4. **Redeploy** Production (Deployments → … → Redeploy).
5. Open `https://musician-ai-studio.vercel.app/` — you should see NabadAi, not a white 403 page.
6. In **Supabase** → Authentication → URL configuration, add redirect URLs:
   - `https://musician-ai-studio.vercel.app/`
   - `com.nabadai.music://auth-callback` (iOS)

Then try **Continue with Google** again on web and in the iOS app.

## Fix B — Keep protection, use bypass token (iOS / automation)

1. Vercel → **Settings** → **Deployment Protection** → **Protection Bypass for Automation** → create/copy the secret.
2. On your Mac, from the repo root (with values from Vercel **Environment Variables**):

```bash
export SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
export SUPABASE_ANON_KEY="your_anon_key"
export VERCEL_PROTECTION_BYPASS="your_bypass_secret"
node scripts/sync-client-env.mjs
npx cap sync ios
```

3. Clean build in Xcode and run. The app sends `x-vercel-protection-bypass` on API requests.

You can also copy `www/env.client.example.js` → `www/env.client.js` and paste the same values by hand.

## After it works

- Web: hard refresh or clear site data once.
- iOS: Product → Clean Build Folder, then Run.
- Bundle should load `app.js?v=20260521momentsV9` or newer.
