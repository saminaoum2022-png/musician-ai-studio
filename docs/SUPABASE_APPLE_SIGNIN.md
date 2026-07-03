# Sign in with Apple — setup

NabadAi Music supports **Continue with Apple** on the auth screen (native iOS sheet when available, otherwise Supabase OAuth in the browser).

## Personal Team vs paid Apple Developer Program

| Account | Sign in with Apple in Xcode | What works in the app |
|---------|----------------------------|------------------------|
| **Personal Team** (free, “Sami Naoum” in Xcode) | **Not supported** — you will see provisioning errors if the entitlement is enabled | **Google**, email/password, and **Apple via browser OAuth** (in-app Safari sheet) still work |
| **Apple Developer Program** ($99/year) | Supported — enable entitlement + capability | Native Apple sheet **and** browser OAuth |

If Xcode shows:

> *Personal development teams do not support the Sign In with Apple capability*

the repo ships with an **empty** `App.entitlements` so you can build on a Personal Team. When you enroll in the paid program, copy `App.entitlements.apple-sign-in` → `App.entitlements`, add the **Sign In with Apple** capability in Xcode, and enable it on App ID `com.nabadai.music` in the developer portal.

**In Xcode now (Personal Team):** remove **Sign In with Apple** from **Signing & Capabilities** if you added it manually (click the **−** on that capability row), then **Product → Clean Build Folder** and build again.

## NabadAi values (sami Naoum team — Jul 2026)

| Field | Value |
|-------|--------|
| Apple Developer login | `samynaoum.mac@icloud.com` |
| Team ID | `D9P29385BD` |
| App ID (native) | `com.nabadai.music` |
| Services ID (web / Supabase) | `com.nabadai.music.web` (create if missing) |
| Supabase project | `msqpcvkstuotpoqwdvwe.supabase.co` |
| Supabase OAuth callback | `https://msqpcvkstuotpoqwdvwe.supabase.co/auth/v1/callback` |
| iOS deep link | `com.nabadai.music://auth-callback` |

## 1. Apple Developer (paid program)

Log in as **`samynaoum.mac@icloud.com`**.

1. [Apple Developer](https://developer.apple.com/account) → **Certificates, Identifiers & Profiles**.
2. **Identifiers → App IDs** → `com.nabadai.music`:
   - Enable **Sign In with Apple** (capability) → **Save**.
3. **Identifiers → Services IDs** → **+** → create **`com.nabadai.music.web`**:
   - Enable **Sign In with Apple** → **Configure**:
     - **Primary App ID:** `com.nabadai.music`
     - **Domains:** `msqpcvkstuotpoqwdvwe.supabase.co`
     - **Return URLs:**
       - `https://msqpcvkstuotpoqwdvwe.supabase.co/auth/v1/callback`
       - `https://musician-ai-studio.vercel.app/`
       - `https://www.nabadai.com/` (if using custom domain)
   - **Save**.
4. **Keys** → **+** → **Sign in with Apple** → name e.g. `NabadAi Supabase` → **Register** → download **`.p8`** (once only).
   - Note **Key ID** (10 chars) and confirm **Team ID** = `D9P29385BD`.

## 2. Supabase Dashboard

[Supabase project](https://supabase.com/dashboard/project/msqpcvkstuotpoqwdvwe) → **Authentication**.

1. **Providers → Apple** → **Enable**.
2. Fill in:
   - **Client IDs:** `com.nabadai.music.web,com.nabadai.music` (Services ID + native bundle ID, comma-separated)
   - **Secret Key:** an **OAuth client secret JWT** (not the raw `.p8` file). Generate locally:
     ```bash
     node scripts/generate-apple-oauth-secret.mjs ~/Downloads/AuthKey_XXXXXXXXXX.p8 YOUR_KEY_ID
     ```
     `YOUR_KEY_ID` = 10-character Key ID from Apple Developer → Keys (also in the `.p8` filename).
     Paste the printed JWT into **Secret Key**. Regenerate every ~6 months (Apple limit).
   - Legacy dashboards may show separate Key ID / Team ID / `.p8` fields instead — same values: Team ID `D9P29385BD`.
3. **URL Configuration → Redirect URLs** — ensure these exist:
   - `https://musician-ai-studio.vercel.app/`
   - `https://www.nabadai.com/`
   - `com.nabadai.music://auth-callback`
4. **Save**.

## 3. Xcode (after paid Developer Program)

1. Copy entitlements:
   ```bash
   cp ios/App/App/App.entitlements.apple-sign-in ios/App/App/App.entitlements
   ```
2. Xcode → **Signing & Capabilities** → **+ Capability** → **Sign In with Apple**
3. Plugin already in repo: `@capacitor-community/apple-sign-in`

After pulling:

```bash
npm install
npx cap sync ios
```

Open Xcode → **Signing & Capabilities** → confirm **Sign In with Apple** appears on the App target. Clean build and run on a **physical device** (Simulator Apple ID can be flaky).

## 4. Test

| Platform | Expected |
|----------|----------|
| **iOS device** | Tap **Continue with Apple** → system Apple sheet → signed in |
| **Web** | Tap **Continue with Apple** → Apple web OAuth → redirect back with session |
| **OAuth fallback** | If native plugin fails, in-app browser opens Supabase Apple OAuth (same as Google) |

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Apple token exchange failed` | Apple provider not enabled or wrong Service ID / key in Supabase |
| Native sheet never appears | `npx cap sync ios`, clean build, entitlement on App ID in Developer portal |
| Browser OAuth loops / no callback | Add `com.nabadai.music://auth-callback` to Supabase redirect URLs |
| Email missing on repeat login | Normal for Apple — email only on first authorization |

See also: [LAUNCH_CHECKLIST.md](./LAUNCH_CHECKLIST.md) · [APP_STORE_LEGAL.md](./APP_STORE_LEGAL.md)
