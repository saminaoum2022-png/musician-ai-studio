# Future product notes (deferred)

Captured for later design/implementation — not in scope for current sprints unless explicitly picked up.

---

## 1. Profile privacy settings

**Goal:** Let users choose whether their **profile** is private or public.

**Context today:**
- `profiles.is_public` exists and is saved via profile edit (`activeProfile.isPublic`, `supabaseUpsertProfile`).
- Per-song visibility is separate: `user_songs.public_on_profile` and `meta.profileVisibility` on releases.
- Public profile route: `#/u/USERNAME`.

**Later work (TBD):**
- Clear UX in Settings (and/or Profile edit): **Public profile** vs **Private profile**.
- Define private behavior: hide `#/u/…`, Discover surfacing, follower-only vs fully hidden, search, etc.
- RLS / API: enforce `profiles.is_public` on public reads (songs, stats, music styles line, posts).
- Migration-safe default for existing users (likely stay public unless they opt in to private).

---

## 2. Send credits on posts (motivation / tips)

**Goal:** Users can send credits to each other on posts as encouragement.

**Later work (TBD):**
- UI on posts (Friends feed, public profile posts, Discover cards?) — amount picker, confirm, thank-you state.
- Backend: ledger entries, anti-abuse, min/max, rate limits, refunds policy.
- Notifications when someone sends credits.
- Optional: show “supported by N credits” on post without exposing payer amounts.

---

## 3. Credit buckets: purchased vs earned

**Goal:** **Gained credits** (tips, promos, rewards) are **separate from bought credits**. Spending rules TBD; user intent: earned credits are **use-once** / non-refundable style (details to finalize).

**Context today:**
- Credits live in `credits` / related Supabase tables and Suno generation debits a single balance.

**Later work (TBD):**
- Schema: e.g. `credits_purchased`, `credits_earned` (or ledger with `source`: `purchase` | `gift_received` | `promo` | `tip_sent`).
- Debit order: which bucket is consumed first when generating (likely earned before purchased, or opposite — product decision).
- Tips flow (#2) credits **recipient** earned balance; sender debits purchased (or either bucket — TBD).
- Settings/history: show both balances and transaction types.
- No change to generation prompts or music-style personalization.

---

## Related (already shipped)

- Music style onboarding + Settings → Music styles (personalization only, not generation).
- Profile hero: dot-separated music styles under `@handle` (replaces voice timbre bar).

**Last updated:** 2026-06-20
