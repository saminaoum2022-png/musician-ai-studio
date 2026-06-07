# NabadAi Music — App Store launch checklist

One place to track everything needed to ship **NabadAi Music** on the App Store.  
**Blocked on:** Apple Developer Program (complaint pending). Everything else can be done in parallel.

**Related docs**

| Doc | Use for |
|-----|---------|
| [APP_STORE_LEGAL.md](./APP_STORE_LEGAL.md) | Privacy, terms, account deletion, smoke tests |
| [APP_STORE_PRIVACY_LABELS.md](./APP_STORE_PRIVACY_LABELS.md) | App Privacy questionnaire answers |
| [SUPABASE_APPLE_SIGNIN.md](./SUPABASE_APPLE_SIGNIN.md) | Sign in with Apple (portal + Xcode) |
| [SUPABASE_CONFIRM_EMAIL_TEMPLATE.md](./SUPABASE_CONFIRM_EMAIL_TEMPLATE.md) | Branded signup email |
| [LOGIN_403_VERCEL.md](./LOGIN_403_VERCEL.md) | Vercel deployment protection / login 403 |

---

## Status at a glance

| Area | Ready? |
|------|--------|
| App code + legal pages in repo | Yes |
| Production `/privacy` + `/terms` (200) | Yes (6 Jun 2026) |
| Delete API (401 when signed out) | Yes (6 Jun 2026) |
| iPhone QA (all tests) | Yes (6 Jun 2026) |
| help@ / support@ email | Yes (6 Jun 2026) |
| Signup email flow | Yes (tested) |
| Apple Developer Program | **Waiting** |
| App Store Connect listing | Not started |
| Sign in with Apple (native) | Needs paid account |
| Screenshots | Not in repo yet |

---

## Phase 1 — While waiting on Apple (no paid account needed)

### Email & support

**How to create the addresses:** [EMAIL_SETUP.md](./EMAIL_SETUP.md) (forwarding, Google Workspace, or Zoho).

- [x] **`help@nabadai.com`** inbox receives mail (test from external email)
- [x] **`support@nabadai.com`** inbox receives mail
- [ ] **Resend:** `nabadai.com` domain verified (SPF, DKIM in DNS)
- [ ] **Supabase → Auth → SMTP:** sender `noreply@nabadai.com` (or Resend onboarding address until domain verifies)
- [ ] **Supabase → Emails → Confirm signup:** paste branded template from [SUPABASE_CONFIRM_EMAIL_TEMPLATE.md](./SUPABASE_CONFIRM_EMAIL_TEMPLATE.md)
- [x] Test sign-up with a **new email** → confirmation arrives → link opens app

### Production backend

- [ ] **Vercel → Environment Variables (Production):**
  - [ ] `SUPABASE_URL`
  - [ ] `SUPABASE_ANON_KEY`
  - [ ] `SUPABASE_SERVICE_ROLE_KEY` (required for account deletion)
- [ ] **Vercel → Deployment Protection:** Off on Production (or iOS bypass configured — see [LOGIN_403_VERCEL.md](./LOGIN_403_VERCEL.md))
- [ ] Smoke test (no credentials):

```bash
curl -sS -o /dev/null -w "privacy:%{http_code}\n" https://musician-ai-studio.vercel.app/privacy
curl -sS -o /dev/null -w "terms:%{http_code}\n" https://musician-ai-studio.vercel.app/terms
curl -sS -o /dev/null -w "home:%{http_code}\n" https://musician-ai-studio.vercel.app/
curl -sS -o /dev/null -w "config:%{http_code}\n" https://musician-ai-studio.vercel.app/api/public-config
# Expect: 200, 200, 200, 200
```

### Supabase auth URLs

- [ ] **Authentication → URL configuration → Site URL:** `https://musician-ai-studio.vercel.app/` (or `https://nabadai.com/` when domain is live)
- [ ] **Redirect URLs** include:
  - [ ] `https://musician-ai-studio.vercel.app/`
  - [ ] `com.nabadai.music://auth-callback`
- [ ] **Providers:** Email (confirm on), Google (on)

### QA on a real iPhone (TestFlight or Xcode install)

**Step-by-step script:** [IPHONE_QA.md](./IPHONE_QA.md)

- [x] Sign in with **Google**
- [x] Sign in with **email/password** (confirm link flow)
- [x] **Guest** mode works
- [x] **Generate song** completes (credits deducted)
- [x] **Microphone** permission + hum/melody capture
- [x] **Friends** feed loads
- [x] **Settings → Privacy Policy** opens in browser (200)
- [x] **Settings → Terms** opens in browser (200)
- [x] **Settings → Delete account** → type `DELETE` → signed out; cannot sign in again

### Account deletion E2E (throwaway user)

```bash
export SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
export SUPABASE_ANON_KEY="..."
export TEST_EMAIL="delete-test@yourdomain.com"
export TEST_PASSWORD="..."
export SUPABASE_SERVICE_ROLE_KEY="..."
export API_BASE="https://musician-ai-studio.vercel.app"
node scripts/test-account-delete.mjs          # dry run
export CONFIRM_DELETE=1
node scripts/test-account-delete.mjs          # actually delete
```

- [ ] Script reports success
- [ ] User removed in Supabase Auth dashboard

### Optional polish (recommended before public launch)

- [ ] Point **`nabadai.com`** → Vercel (cleaner emails, OAuth, share links)
- [ ] Simple support page at `https://nabadai.com/support` or `/support` on Vercel (Apple prefers HTTPS over `mailto:` alone)
- [x] Soften in-app **“closed friends beta / Ask Samy”** copy if shipping to the public App Store

---

## Phase 2 — When Apple Developer Program is active

### Apple Developer portal

- [ ] Enroll / account complaint resolved — **Program active**
- [ ] **App ID** `com.nabadai.music` — enable **Sign In with Apple**
- [ ] **Services ID** (e.g. `com.nabadai.music.web`) — Sign In with Apple, domains + return URLs
- [ ] **Key** — Sign in with Apple `.p8` — note **Key ID** + **Team ID**

### Supabase Apple provider

Follow [SUPABASE_APPLE_SIGNIN.md](./SUPABASE_APPLE_SIGNIN.md):

- [ ] **Authentication → Providers → Apple** enabled
- [ ] Services ID, `.p8` secret, Key ID, Team ID saved
- [ ] Redirect URL `com.nabadai.music://auth-callback` in Supabase

### Xcode / iOS build

```bash
npm install
cp ios/App/App/App.entitlements.apple-sign-in ios/App/App/App.entitlements
npx cap sync ios
```

- [ ] **Signing & Capabilities** → **Sign In with Apple** on App target
- [ ] **Continue with Apple** works on a **physical iPhone** (not only Simulator)
- [ ] **Product → Archive** → upload to App Store Connect

---

## Phase 3 — App Store Connect listing

### Required URLs (copy-paste)

| Field | URL |
|-------|-----|
| **Privacy Policy** | `https://musician-ai-studio.vercel.app/privacy` |
| **Terms** (support / legal) | `https://musician-ai-studio.vercel.app/terms` |
| **Support** | `https://musician-ai-studio.vercel.app/` or `mailto:help@nabadai.com` |
| **Marketing URL** (optional) | `https://musician-ai-studio.vercel.app/` |

Update to `https://nabadai.com/...` when custom domain is live.

### App Privacy (nutrition labels)

- [ ] Complete questionnaire using [APP_STORE_PRIVACY_LABELS.md](./APP_STORE_PRIVACY_LABELS.md)
- [ ] **No tracking** — matches `PrivacyInfo.xcprivacy`

### Age rating

- [ ] Complete questionnaire (no gambling, no unrestricted web, user-generated music/social — expect **12+** or **13+** depending on social/UGC answers)

### Screenshots (6.7" iPhone required)

**Tap-by-tap guide:** [APP_STORE_SCREENSHOTS.md](./APP_STORE_SCREENSHOTS.md)

Capture on iPhone 15 Pro Max simulator or device (**1290 × 2796**). Suggested **5–6 screens**:

| # | Screen to capture | Overlay caption (optional, in design tool) |
|---|-------------------|------------------------------------------|
| 1 | **Create / Generate** — lyrics + style visible, big Generate CTA | *Turn ideas into full songs* |
| 2 | **Result player** — cover art, waveform, play controls | *Studio-quality tracks in minutes* |
| 3 | **Hum / mic** or melody guide UI | *Hum a melody — AI does the rest* |
| 4 | **Persona** — voice persona tile | *Your voice, your sound* |
| 5 | **Friends** feed with posts | *Share tracks with your circle* |
| 6 | **Profile / proof of creation** (optional) | *Verified proof you made it* |

Tips:

- Use **dark theme** (default) — matches brand
- Hide debug/build strings if visible in footer
- Sign in as a user with a real generated song for player/feed shots
- No placeholder “lorem” — use real song titles

- [ ] 6.7" screenshots uploaded
- [ ] 6.5" / 5.5" (if required by Connect at submit time)
- [ ] iPad screenshots (optional — app supports iPad orientations)

### App Review notes (paste into “Notes for reviewer”)

```
NabadAi Music is an AI music creation and social listening app.

TEST ACCOUNT (if needed):
Email: [CREATE A DEDICATED REVIEWER ACCOUNT]
Password: [PASSWORD]
Promo code for credits (if empty balance): [ONE-TIME CODE]

SIGN IN:
- Continue with Apple, Google, or email/password are all supported.
- Guest mode is available but generation requires a signed-in account.

CREDITS:
- Song generation uses in-app credits (not Apple In-App Purchase).
- New users receive starter credits; additional credits are granted via promo codes during early access.
- No real-money purchases are offered in this version.

ACCOUNT DELETION:
Settings → Delete account → confirm → type DELETE. Removes server-side account per Guideline 5.1.1.

PERMISSIONS:
- Microphone: record short melody/vocal guides for AI generation.
- Camera / Photos: optional story images and cover art.

Support: help@nabadai.com
```

- [ ] Create **dedicated App Review test account** (do not use your personal account)
- [ ] Generate **one promo code** with credits for reviewer if balance can hit zero
- [ ] Fill in bracketed fields in notes above

---

## App Store copy (ready to paste)

### App name (30 chars max)

```
NabadAi Music
```

### Subtitle (30 chars max)

```
AI songs from your voice
```

Alternative subtitles (pick one):

```
Hum it. Write it. Ship it.
Create & share AI music
Your AI music studio
```

### Promotional text (170 chars — can change without new build)

```
Create full songs from lyrics, style, or a hum. Save your voice as a Persona, share on Friends, and export proof of creation. Start with free credits today.
```

### Description (4000 chars max)

```
NabadAi Music is your pocket AI studio — turn a hum, a lyric, or a mood into a full song you can share.

CREATE
• Write lyrics or let AI help you draft them
• Pick a style — pop, hip-hop, acoustic, and more
• Hum a melody or record a short vocal guide
• Generate complete tracks with cover art in minutes

YOUR VOICE, YOUR SOUND
• Build a Persona from your voice and reuse it across songs
• Echo — drop 24-hour voice moments for friends
• Export and share what you make

SOCIAL
• Friends feed — post tracks, like, and discover what your circle is making
• Share links that open straight in the app
• Proof of creation — a verified record of how your track was made

BUILT FOR MUSICIANS
• Maqam and regional flavor options for Middle Eastern-inspired arrangements
• Lock-screen playback and background audio
• Dark, focused studio UI — one tap to create

GET STARTED
Sign in with Apple, Google, or email. New accounts include starter credits to generate your first songs. Need more? Redeem a promo code in Settings.

NabadAi Music is made for creators who want to go from idea to finished track without a full studio.

Support: help@nabadai.com
Privacy: https://musician-ai-studio.vercel.app/privacy
Terms: https://musician-ai-studio.vercel.app/terms
```

### Keywords (100 chars total, comma-separated, no spaces after commas)

```
AI music,song generator,lyrics,voice,melody,create music,share music,studio,beat,maker
```

Alternative keyword set (swap if first is taken / crowded):

```
music AI,songwriter,hum to song,vocal,persona,social music,Arabic music,maqam,create
```

### Category

| Primary | **Music** |
| Secondary | **Social Networking** or **Entertainment** |

### Copyright

```
© 2026 NabadAi
```

### Version

```
1.0
```

Matches Xcode `MARKETING_VERSION`.

---

## Phase 4 — Submit & launch day

- [ ] **App Store Connect →** new app, bundle ID `com.nabadai.music`
- [ ] Upload build from Xcode Organizer
- [ ] Attach build to version **1.0**
- [ ] All metadata + screenshots + privacy filled
- [ ] **Export compliance:** app uses HTTPS only → typically **No** for encryption beyond standard TLS
- [ ] Submit for **App Review**
- [ ] **TestFlight** external testers (optional soft launch before public)
- [ ] On approval: release **manually** or **automatically** (your choice)

### After approval

- [ ] Post launch link / QR for friends
- [ ] Monitor `support@nabadai.com` for review replies and user bugs
- [ ] Watch Supabase auth logs for sign-in failures first 48h

---

## Quick reference

| Item | Value |
|------|-------|
| Bundle ID | `com.nabadai.music` |
| Display name | NabadAi Music |
| Deep link | `com.nabadai.music://auth-callback` |
| Production API | `https://musician-ai-studio.vercel.app` |
| Privacy | `https://musician-ai-studio.vercel.app/privacy` |
| Terms | `https://musician-ai-studio.vercel.app/terms` |
| Help | `help@nabadai.com` |
| Bugs | `support@nabadai.com` |

---

*Last updated: 6 June 2026*
