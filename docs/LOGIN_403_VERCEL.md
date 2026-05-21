# Fix "403: Forbidden" when signing in (web / Vercel)

If Google login shows a plain white page with **403: Forbidden** and an ID like `1779382476-…`, the request never reached the NabadAi app. **Vercel Deployment Protection** (or similar) is blocking the OAuth return URL.

## Fix in Vercel (required)

1. Open [Vercel Dashboard](https://vercel.com) → your **musician-ai-studio** project.
2. **Settings** → **Deployment Protection**.
3. For **Production** (and Preview if you test there):
   - Either **turn off** protection for the deployment you use for real users, **or**
   - Enable **Protection Bypass for Automation** and use a bypass token only in CI (not for end users).
4. Redeploy or wait for the setting to apply, then try **Continue with Google** again.

The OAuth callback lands on:

`https://YOUR_DOMAIN/?code=...`

That URL must load `index.html`, not a Vercel 403 page.

## Fix in Supabase (required)

1. Supabase → **Authentication** → **URL configuration**.
2. **Site URL**: your live app origin, e.g. `https://your-app.vercel.app`
3. **Redirect URLs** — add every origin you use:
   - `https://your-app.vercel.app/`
   - `https://your-app.vercel.app/**`
   - `http://localhost:3000/` (local dev)
   - `com.nabadai.music://auth-callback` (iOS app)

Save, then retry login.

## iOS app

Native login uses `com.nabadai.music://auth-callback` and is not affected by Vercel 403. If only the **website** fails, focus on Vercel + Supabase steps above.
