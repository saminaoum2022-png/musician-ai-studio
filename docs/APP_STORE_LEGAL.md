# App Store — privacy, terms & account deletion

Use this checklist when submitting **NabadAi Music** to App Store Connect.

**Master launch tracker (screenshots, metadata, phases):** [LAUNCH_CHECKLIST.md](./LAUNCH_CHECKLIST.md)

## In-app (shipped in repo)

| Item | Location |
|------|----------|
| Privacy Policy | `/privacy.html` — linked from intro, auth, Settings |
| Terms of Service | `/terms.html` — linked from intro, auth, Settings |
| Delete account | Settings → **Delete account** (signed-in) → `POST /api/account/delete` |
| Sign in with Apple | Auth screen → **Continue with Apple** (see [SUPABASE_APPLE_SIGNIN.md](./SUPABASE_APPLE_SIGNIN.md)) |
| Permission strings | `ios/App/App/Info.plist` |
| Privacy manifest | `ios/App/App/PrivacyInfo.xcprivacy` |

## App Store Connect — required URLs

1. **Privacy Policy URL** (public HTTPS):
   - `https://musician-ai-studio.vercel.app/privacy`

2. **Terms** (optional field; often in Privacy or Support URL):
   - `https://musician-ai-studio.vercel.app/terms`

3. **Support URL**: `mailto:help@nabadai.com` or a support page.

## App Privacy questionnaire (nutrition labels)

**Step-by-step answers:** see **[APP_STORE_PRIVACY_LABELS.md](./APP_STORE_PRIVACY_LABELS.md)** (copy into App Store Connect).

Summary: declare **Email**, **Name** (username), **Photos/Videos**, **Audio**, **Other User Content**, **User ID**, **Product Interaction** — all **linked to user**, **not used for tracking**, purpose **App Functionality** only.

## Account deletion (Apple Guideline 5.1.1)

- In-app path: **Settings → Delete account**
- Must delete server-side account for signed-in users (`/api/account/delete` uses Supabase Admin API).
- User confirms by typing `DELETE`.

### Production smoke test (automated, no account)

Run anytime (no credentials):

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://musician-ai-studio.vercel.app/privacy
curl -sS -o /dev/null -w "%{http_code}\n" https://musician-ai-studio.vercel.app/terms
curl -sS -X POST https://musician-ai-studio.vercel.app/api/account/delete \
  -H "Content-Type: application/json" -d '{"confirm":"DELETE"}'
# Expect: 200, 200, {"error":"Not signed in"} with HTTP 401
```

**Last run:** 6 Jun 2026 — privacy `200`, terms `200`, delete without auth `401` ✓

### Full E2E delete (dedicated test user)

Use a throwaway account you are OK losing:

```bash
export SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
export SUPABASE_ANON_KEY="..."
export TEST_EMAIL="delete-test@yourdomain.com"
export TEST_PASSWORD="..."
# optional: verify removal in Auth admin
export SUPABASE_SERVICE_ROLE_KEY="..."
export API_BASE="https://musician-ai-studio.vercel.app"

# Dry run (sign-in only, no delete)
node scripts/test-account-delete.mjs

# Actually delete
export CONFIRM_DELETE=1
node scripts/test-account-delete.mjs
```

**On device:** Settings → Delete account → confirm → type `DELETE` → signed out; try signing in again (should fail).

## Vercel environment

Ensure production has:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (required for account deletion API)

## Before submit

- [x] Production `/privacy` and `/terms` return 200 (smoke test)
- [x] Delete API returns 401 when not signed in (smoke test)
- [ ] Full E2E delete with `scripts/test-account-delete.mjs` + dedicated test user
- [ ] Open Privacy & Terms links on device (Safari / in-app Browser)
- [ ] Confirm `help@nabadai.com` and `support@nabadai.com` inboxes exist
- [ ] Complete App Privacy using [APP_STORE_PRIVACY_LABELS.md](./APP_STORE_PRIVACY_LABELS.md)
- [ ] Add Privacy Policy URL in App Store Connect
- [ ] Configure Apple provider in Supabase ([SUPABASE_APPLE_SIGNIN.md](./SUPABASE_APPLE_SIGNIN.md))
- [ ] Test **Continue with Apple** on a physical iPhone
- [ ] Archive build after `npx cap sync ios`
