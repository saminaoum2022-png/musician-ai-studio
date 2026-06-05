# iPhone QA — pre-launch test script

Run on a **physical iPhone** with the Capacitor app (Xcode run or TestFlight).  
Tick each box. Note **PASS** / **FAIL** + what you saw.

**Before you start**

- [ ] Latest build: from repo root run `npx cap sync ios`, then run from Xcode (or confirm TestFlight build date)
- [ ] Footer shows build string (confirms `www/` is not stale)
- [ ] Phone on Wi‑Fi or cellular with decent signal
- [ ] **Do not** use your main personal account for the **Delete account** test (save that for last, throwaway only)

**Skip for now** (needs paid Apple Developer Program):

- Sign in with **Apple** (native sheet) — expect fail on Personal Team; browser fallback may work

---

## 1 — App opens

- [ ] App launches without white screen / crash
- [ ] Intro or auth screen appears within ~5s
- [ ] No “Could not load login settings” toast

**FAIL?** → Check [LOGIN_403_VERCEL.md](./LOGIN_403_VERCEL.md) (Vercel protection / `public-config` 403)

---

## 2 — Google sign-in

1. Sign out if already signed in (**Settings** → **Sign out**)
2. Tap **Continue with Google**
3. Complete Google OAuth

- [ ] Returns to app signed in
- [ ] Profile / avatar visible
- [ ] **Friends** tab does not say “Sign in” only

**FAIL?** → Note exact error. Check Supabase redirect URLs include `com.nabadai.music://auth-callback`

---

## 3 — Email sign-in

*(You already tested signup — quick sign-in check.)*

1. Sign out
2. Email + password → **Sign in**

- [ ] Signs in without error

---

## 4 — Guest mode

1. Sign out
2. **Continue as guest**

- [ ] Enters app (home / generate visible)
- [ ] Tapping **Generate song** shows sign-in prompt or clear message (guest cannot burn credits)

---

## 5 — Generate song (signed in)

Use your normal account (with credits).

1. Bottom tab **Generate** (center orb)
2. **Lyrics** tab — enter a short line OR use defaults
3. Pick a **style** if required
4. Tap **Generate song**
5. Wait for result (can take 1–3 min)

- [ ] Progress / loading shows (not stuck forever)
- [ ] Song appears with title + cover
- [ ] **Play** works, audio audible
- [ ] Credits balance decreased

**FAIL?** → Note error text, credit balance before/after, Wi‑Fi vs cellular

---

## 6 — Microphone (Hum)

1. On Generate screen, tap **Hum** tab
2. Tap record / start — iOS should ask for **Microphone**

- [ ] Permission dialog appears (first time)
- [ ] After **Allow**, recording UI responds
- [ ] Stop saves / shows waveform or ready state

**FAIL?** → Settings → NabadAi Music → Microphone must be **On**

---

## 7 — Friends feed

1. Bottom tab **Friends**

- [ ] Feed loads (posts or empty state — not infinite spinner)
- [ ] No persistent “Sign in” if you’re signed in
- [ ] Pull to refresh works (optional)

---

## 8 — Legal links

1. **Settings** (gear on Profile or tab)
2. Tap **Privacy Policy**
3. Back → tap **Terms of Service**

- [ ] Privacy page opens (Safari or in-app browser), not 404
- [ ] Terms page opens, not 404

---

## 9 — Help / Support mailto

1. **Settings** → **Help** row
2. **Settings** → **Report a problem** row

- [ ] Mail app opens addressed to `help@nabadai.com` / `support@nabadai.com`

---

## 10 — Delete account (LAST — throwaway account only)

Create a **new** test account you are OK losing (email signup).

1. Sign in as throwaway
2. **Settings** → **Delete account** (or Profile → **Delete account**)
3. Confirm → type `DELETE`
4. Signed out
5. Try **Sign in** again with same email

- [ ] Deletion completes without error
- [ ] Sign-in fails or account gone

**FAIL?** → Production needs `SUPABASE_SERVICE_ROLE_KEY` on Vercel ([APP_STORE_LEGAL.md](./APP_STORE_LEGAL.md))

---

## Results summary

| # | Test | PASS / FAIL | Notes |
|---|------|-------------|-------|
| 1 | App opens | | |
| 2 | Google | | |
| 3 | Email | | |
| 4 | Guest | | |
| 5 | Generate | | |
| 6 | Microphone | | |
| 7 | Friends | | |
| 8 | Legal links | | |
| 9 | Mailto | | |
| 10 | Delete account | | |

Copy this table into a note when done. Fix all **FAIL** before App Store submit.

**Last run:** 6 Jun 2026 — all tests **PASS** on physical iPhone.

---

See also: [LAUNCH_CHECKLIST.md](./LAUNCH_CHECKLIST.md)
