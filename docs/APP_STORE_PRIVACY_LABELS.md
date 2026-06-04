# App Store Connect — App Privacy (nutrition labels)

Copy these answers into **App Store Connect → App Privacy** for **NabadAi Music**.  
They match what the app actually collects today (no ad/analytics SDKs).

**Global toggles (first screen)**

| Question | Answer |
|----------|--------|
| Do you or your third-party partners collect data from this app? | **Yes** |
| Is data used to track users? | **No** |
| Are you or your third-party partners using data for tracking? | **No** |

---

## Data types to add

For **every row below**, use:

- **Linked to the user’s identity?** → **Yes**
- **Used for tracking?** → **No**
- **Third-party advertising?** → No (not applicable)
- **Developer’s advertising or marketing?** → No
- **Analytics?** → No (no third-party analytics SDK)
- **Product personalization?** → No (unless Apple forces a choice — use **App Functionality** only)
- **App Functionality** → **Yes**
- **Other purposes** → No

---

### 1. Contact Info → **Email Address**

| Field | Value |
|-------|--------|
| Why collected | Account sign-in (email/password or linked Google account), support, account recovery |
| Linked to user | Yes |
| Tracking | No |
| Purposes | **App Functionality** |

---

### 2. Contact Info → **Name** (optional but accurate)

| Field | Value |
|-------|--------|
| Why collected | Display name / username on profile and social features |
| Linked to user | Yes |
| Tracking | No |
| Purposes | **App Functionality** |

*If Connect only lets you pick one Contact type, Email is required; add Name if you collect display names (you do via `profiles`).*

---

### 3. User Content → **Photos or Videos**

| Field | Value |
|-------|--------|
| Why collected | Profile avatar, story/moment photos, song artwork user selects |
| Linked to user | Yes |
| Tracking | No |
| Purposes | **App Functionality** |

---

### 4. User Content → **Audio Data**

| Field | Value |
|-------|--------|
| Why collected | Melody guides, vocal references, Persona voice samples, Echo voice moments, generated songs |
| Linked to user | Yes |
| Tracking | No |
| Purposes | **App Functionality** |

---

### 5. User Content → **Other User Content**

| Field | Value |
|-------|--------|
| Why collected | Lyrics, style prompts, posts, comments/replies, generated music metadata |
| Linked to user | Yes |
| Tracking | No |
| Purposes | **App Functionality** |

---

### 6. Identifiers → **User ID**

| Field | Value |
|-------|--------|
| Why collected | Supabase auth UUID for account, library, credits, social graph |
| Linked to user | Yes |
| Tracking | No |
| Purposes | **App Functionality** |

---

### 7. Usage Data → **Product Interaction** (recommended)

| Field | Value |
|-------|--------|
| Why collected | Play counts, likes, follows, notifications — tied to account for social/library features |
| Linked to user | Yes |
| Tracking | No |
| Purposes | **App Functionality** |

---

## Do **not** declare (unless you add features later)

| Category | Reason |
|----------|--------|
| Location | App does not request location permission or store GPS |
| Contacts | No address-book access |
| Browsing / Search History | People search queries are not stored as a separate “search history” product |
| Purchases | No Apple IAP; credits are promo/server-side, not Payment Info |
| Financial Info | None |
| Health / Fitness | None |
| Sensitive Info | None |
| Diagnostics (Crash / Performance) | No crash reporting SDK (e.g. Sentry/Firebase) in the client |
| Device ID for advertising | None |
| Data Used to Track You | No cross-app tracking |

---

## Third-party data sharing (Privacy questionnaire)

When asked whether data is shared with third parties **for their own purposes**:

| Partner | Data shared | Purpose |
|---------|-------------|---------|
| **Supabase** | Account, profile, user content, identifiers | Auth, database, storage (processor) |
| **Vercel** | Request metadata, API payloads in transit | Hosting (processor) |
| **Suno** (or other AI music API) | Prompts, audio references needed for generation | Music generation (processor) |
| **Google** | Only if user taps “Continue with Google” | OAuth sign-in |

Answer **No** to “sell data” and **No** to “track users across apps/websites” unless you add ad networks later.

---

## Must match `PrivacyInfo.xcprivacy`

The iOS manifest in `ios/App/App/PrivacyInfo.xcprivacy` lists:

- Email, User ID, Photos/Videos, Audio, Other User Content  
- `NSPrivacyTracking` = false  
- Required-reason APIs: UserDefaults (CA92.1), File Timestamp (C617.1)

Keep App Store labels aligned with that file after any SDK upgrade.

---

## Privacy Policy URL (required)

```
https://musician-ai-studio.vercel.app/privacy
```

Terms (support / legal reference):

```
https://musician-ai-studio.vercel.app/terms
```
