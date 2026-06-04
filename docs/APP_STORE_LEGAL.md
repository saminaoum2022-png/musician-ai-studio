# App Store — privacy, terms & account deletion

Use this checklist when submitting **NabadAi Music** to App Store Connect.

## In-app (shipped in repo)

| Item | Location |
|------|----------|
| Privacy Policy | `/privacy.html` — linked from intro, auth, Settings |
| Terms of Service | `/terms.html` — linked from intro, auth, Settings |
| Delete account | Settings → **Delete account** (signed-in) → `POST /api/account/delete` |
| Permission strings | `ios/App/App/Info.plist` |
| Privacy manifest | `ios/App/App/PrivacyInfo.xcprivacy` |

## App Store Connect — required URLs

1. **Privacy Policy URL** (public HTTPS):
   - Production: `https://musician-ai-studio.vercel.app/privacy`
   - Or your custom domain when live.

2. **Terms** (optional field; often in Privacy or Support URL):
   - `https://musician-ai-studio.vercel.app/terms`

3. **Support URL**: `mailto:help@nabadai.com` or a support page.

## App Privacy questionnaire (nutrition labels)

Declare at minimum:

- **Contact info** — email (account)
- **User content** — photos, audio, other user content (lyrics, generated music)
- **Identifiers** — user ID
- **Usage data** — optional if you only use first-party credits ledger (declare if you add analytics later)

Set **Data linked to the user** = Yes for account-tied data.  
Set **Used for tracking** = No (unless you add ad/analytics SDKs later).

## Account deletion (Apple Guideline 5.1.1)

- In-app path: **Settings → Delete account**
- Must delete server-side account for signed-in users (`/api/account/delete` uses Supabase Admin API).
- User confirms by typing `DELETE`.

## Vercel environment

Ensure production has:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (required for account deletion API)

## Before submit

- [ ] Open Privacy & Terms links on device (Safari / in-app Browser).
- [ ] Test delete account with a test user; confirm sign-out and cannot sign in again.
- [ ] Confirm `help@nabadai.com` and `support@nabadai.com` inboxes exist.
- [ ] Add Privacy Policy URL in App Store Connect.
- [ ] Archive build after `npx cap sync ios`.
