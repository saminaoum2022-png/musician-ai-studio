# Sign in with Apple — setup

NabadAi Music supports **Continue with Apple** on the auth screen (native iOS sheet when available, otherwise Supabase OAuth in the browser).

## 1. Apple Developer

1. [Apple Developer](https://developer.apple.com/account) → **Certificates, Identifiers & Profiles**.
2. **Identifiers → App IDs** → `com.nabadai.music`:
   - Enable **Sign In with Apple** (capability).
3. **Identifiers → Services IDs** → create e.g. `com.nabadai.music.web` (or reuse your web service id):
   - Enable **Sign In with Apple**.
   - **Domains**: your Supabase project host, e.g. `abcdefgh.supabase.co`.
   - **Return URLs**:
     - `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
     - `https://musician-ai-studio.vercel.app/` (web app origin, if used)
4. **Keys** → create **Sign in with Apple** key (`.p8`), note **Key ID** and **Team ID**.

## 2. Supabase Dashboard

1. **Authentication → Providers → Apple** → Enable.
2. Fill in:
   - **Services ID** (from step 3 above — the *web* Services ID, not the bare bundle id)
   - **Secret Key** (contents of `.p8` file)
   - **Key ID**
   - **Team ID**
3. **Authentication → URL Configuration → Redirect URLs** — ensure these exist:
   - `https://musician-ai-studio.vercel.app/`
   - `com.nabadai.music://auth-callback` (iOS OAuth fallback)
4. Save.

## 3. Xcode (repo already wired)

- `ios/App/App/App.entitlements` — Sign In with Apple entitlement
- `CODE_SIGN_ENTITLEMENTS` in the App target
- Plugin: `@capacitor-community/apple-sign-in`

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

See also: [APP_STORE_LEGAL.md](./APP_STORE_LEGAL.md)
