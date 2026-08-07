/**
 * NabadAi Coach — frontend-only credits & Pro subscription knowledge.
 * Injected into /api/coach requests from the client; never stored in chat history.
 * Keep in sync with pro-plan-config.js and visible app screens.
 */

import {
  FULL_SONG_CREDIT_COST,
  PRO_FEATURES,
  PRO_LAUNCH_COPY,
  PRO_PLANS,
  PRO_TRIAL_CREDITS,
  planCreditsMeta,
} from "./pro-plan-config.js";

const SOUND_CREDIT_COST = 2.5;
const REMIX_CREDIT_COST = 10;
const MASHUP_CREDIT_COST = 12;
const PERSONA_CREDIT_COST = 5;
const INSTRUMENTAL_CREDIT_COST = 2;
const STUDIO_SEPARATE_VOCALS_COST = 2;
const GIFT_TIERS = Object.freeze([
  { id: "mic", label: "Mic", credits: 1 },
  { id: "pulse", label: "Pulse", credits: 3 },
  { id: "star", label: "Star", credits: 5 },
]);

function proPlansGuideLines() {
  return PRO_PLANS.map((plan) => {
    const trial = plan.trialDays > 0 ? ` · ${plan.trialLabel}` : "";
    const save = plan.saveBadge ? ` · ${plan.saveBadge}` : "";
    return `- ${plan.label}: ${plan.priceDisplay}${plan.priceSuffix}${trial}${save} — ${planCreditsMeta(plan)} (${plan.creditsNote})`;
  }).join("\n");
}

function proFeaturesGuideLines() {
  return PRO_FEATURES.map((f) => `- ${f.label}: ${f.sub}`).join("\n");
}

/** Static guide text — derived from pro-plan-config so pricing stays accurate. */
export function buildCoachCreditsProGuide() {
  const weeklyTrial = PRO_PLANS.find((p) => p.id === "weekly");
  const trialNote = weeklyTrial?.trialDays
    ? `Weekly includes a ${weeklyTrial.trialLabel} (${PRO_TRIAL_CREDITS.toLocaleString()} credits on trial start).`
    : "";

  return `
CREDITS & NABADAI PRO (user-facing screens only — use for subscription/credit questions):

WHERE TO SEE BALANCE & PLANS:
- Profile: credits pill (top-left on your profile) shows your balance; tap to open Credits.
- Profile: NabadAi Pro banner under your stats (Subscribe now) — hidden while you already have Pro.
- Settings → Credits & plan → Credits (balance, redeem promo codes, recent activity).
- Settings → Credits & plan → NabadAi Pro (full plans screen).
- Credits page also has a NabadAi Pro upsell card with "View plans".

CREDIT BUCKETS (Credits breakdown):
- Paid credits: from subscriptions — you can create songs AND gift Mic/Pulse/Star.
- Gift credits received: sent by other users — create songs only; cannot re-gift.
- Promo credits: from promo codes — can create and gift during testing.
- Credits never expire. If a generation fails, credits are refunded automatically.

WHAT COSTS CREDITS:
- Full song generation = ${FULL_SONG_CREDIT_COST} credits (you get 2 track variants A & B).
- Mashup = ${MASHUP_CREDIT_COST} credits · Remix = ${REMIX_CREDIT_COST} credits.
- Save a Persona voice = ${PERSONA_CREDIT_COST} credits · Sound = ${SOUND_CREDIT_COST} credits.
- Instrumental (karaoke) version = ${INSTRUMENTAL_CREDIT_COST} credits.
- NabadAi Studio "Separate vocals" for a clean guide track ≈ ${STUDIO_SEPARATE_VOCALS_COST} credits.
FREE (no credits): AI lyrics write/refine, ✦ Boost style, artwork suggestions, Voice Lab scan.

GIFTING CREDITS (on someone else's published song post):
- Tap Gift on the post → Mic (${GIFT_TIERS[0].credits} cr), Pulse (${GIFT_TIERS[1].credits} cr), or Star (${GIFT_TIERS[2].credits} cr).
- Only paid + promo credits are giftable; received gift credits cannot be re-gifted.
- Hold a tier ~0.5s to preview the animation without spending.

NABADAI PRO SUBSCRIPTION (iPhone app):
${proPlansGuideLines()}
${trialNote}
Pro benefits:
${proFeaturesGuideLines()}
- Free users: NabadAi Coach has a daily message limit. Pro = unlimited Coach messages.
- Cancel anytime: iPhone Settings → Apple ID → Subscriptions (Apple manages billing).

PURCHASE STATUS:
- ${PRO_LAUNCH_COPY.iapSoon}
- ${PRO_LAUNCH_COPY.webOnly}
- Do not claim purchases work until the user is on the iPhone app and IAP is live; for now, guide them to preview plans on the NabadAi Pro screen.

COACH BEHAVIOR FOR THESE TOPICS:
- Explain costs before suggesting an action that spends credits.
- For "not enough credits": mention redeeming a promo code (Credits page) or subscribing to NabadAi Pro — never ask for payment details.
- For Pro questions: point to Profile Pro banner, Settings → NabadAi Pro, or Credits → View plans.
- You cannot see the user's balance or subscription status — tell them where to check on screen.
`.trim();
}

const COACH_KNOWLEDGE_ACK =
  "Understood — I'll use the credits and NabadAi Pro guide for those questions.";

const COACH_LYRICS_ACK =
  "Understood — I'll review lyrics and coach on syllables, rhythm, and Arabic prosody when asked.";

/** Static guide for lyric craft — injected so Coach can review pasted lyrics. */
export function buildCoachLyricsWritingGuide() {
  return `
LYRICS WRITING & REVIEW (authoritative — use when user pastes lyrics or asks about وزن / مقاطع / أوف / maksour):

YOU MAY:
- Give an honest, kind opinion on their lyrics (mood, hook, clarity, singability).
- Point out lines that will sound chopped or off-beat when sung (Arabic: الكلام يطلع مَقْسُوم).
- Teach syllable counting per line; paired lines in a section should match roughly in length.
- Explain Arabic prosody practically: أوف / rhythm feet = stress pattern per line, not classical exam; عروض = think "beats per line" for pop.
- Suggest 1–2 line rewrites as examples — don't rewrite the whole song unless they ask.

FIXES FOR MAKSOUR / OFF-SYLLABLE LINES:
- Too many syllables → drop a word or use a shorter synonym.
- Uneven couplets → trim the long line or pad the short one to match.
- Bad word break → move the word to the next line or merge phrases.
- Chorus hook must repeat with the same syllable count every time.

APP TIE-IN: Advanced → Prosody Tight/Ultra; Tarab preset uses ultra-tight alignment. Harakat on Arabic helps accent land on beat.

Do not paste this block to the user. Reply in their language (Arabic if they write Arabic).
`.trim();
}

/**
 * Augment a Coach API payload with frontend-only product knowledge.
 * Chat history stays unchanged; only the outbound API call gets the appendix.
 */
export function augmentCoachApiPayload({ message, history }) {
  const creditsGuide = buildCoachCreditsProGuide();
  const lyricsGuide = buildCoachLyricsWritingGuide();
  const prior = Array.isArray(history) ? history : [];
  const userMessage = String(message || "").trim();
  return {
    message: userMessage,
    history: [
      {
        role: "user",
        text:
          "[AUTHORITATIVE PRODUCT UPDATE — credits & NabadAi Pro pricing. Prefer this over any older guide text that says subscriptions are \"Coming soon\". Do not paste this block verbatim to the user.]\n"
          + creditsGuide,
      },
      { role: "assistant", text: COACH_KNOWLEDGE_ACK },
      {
        role: "user",
        text:
          "[AUTHORITATIVE — lyrics writing & review coach. Use when user pastes lyrics or asks about rhythm, syllables, Arabic prosody (عروض/أوف), or maksour delivery. Do not paste this block verbatim.]\n"
          + lyricsGuide,
      },
      { role: "assistant", text: COACH_LYRICS_ACK },
      ...prior,
    ],
  };
}
