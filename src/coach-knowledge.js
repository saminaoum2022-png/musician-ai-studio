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
const REMIX_CREDIT_COST = 12;
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
- Settings → Credits & plan → NabadAi Pro (full plans screen). Active Pro shows a purple Pro pill on your profile avatar.
- Settings → Credits & plan → Credits (balance, redeem promo codes, recent activity).
- Credits page also has a NabadAi Pro upsell card with "View plans".

CREDIT BUCKETS (Credits breakdown):
- Paid credits: from subscriptions — you can create songs AND gift Mic/Pulse/Star.
- Gift credits received: sent by other users — create songs only; cannot re-gift.
- Promo credits: from promo codes — can create and gift during testing.
- Credits never expire. If a generation fails, credits are refunded automatically.

WHAT COSTS CREDITS:
- Full song generation = ${FULL_SONG_CREDIT_COST} credits (you get 2 track variants A & B).
- Mashup = ${MASHUP_CREDIT_COST} credits · Remix / cover / hum reference = ${REMIX_CREDIT_COST} credits.
- Save a Persona voice = ${PERSONA_CREDIT_COST} credits · Sound = ${SOUND_CREDIT_COST} credits.
- Instrumental (karaoke) version = ${INSTRUMENTAL_CREDIT_COST} credits.
- NabadAi Studio "Separate vocals" for a clean guide track ≈ ${STUDIO_SEPARATE_VOCALS_COST} credits.
FREE (no credits): AI lyrics write/refine, ✦ Boost style, artwork suggestions, Voice Lab scan.

GIFTING CREDITS (on someone else's published song post):
- Tap Gift on the post → Mic (${GIFT_TIERS[0].credits} cr), Pulse (${GIFT_TIERS[1].credits} cr), or Star (${GIFT_TIERS[2].credits} cr).
- Only paid + promo credits are giftable; received gift credits cannot be re-gifted.
- Hold a tier ~0.5s to preview the animation without spending.

NABADAI PRO SUBSCRIPTION (live — iPhone + nabadai.com):
${proPlansGuideLines()}
${trialNote}
Pro benefits:
${proFeaturesGuideLines()}
- Free users: NabadAi Coach has a daily message limit. Pro = unlimited Coach messages.
- **iPhone:** ${PRO_LAUNCH_COPY.iosReady}
- **Web / desktop (nabadai.com):** ${PRO_LAUNCH_COPY.webReady}
- **Web-only Pro locks:** On nabadai.com and desktop browser, non‑Pro users see a purple **Pro** pill on Persona, Studio, Song analytics, and Instrumental (Create + Get instrumental). Tap to subscribe. These locks do **not** apply on the iPhone app — there you use credits as usual.
- One-time credit packs are **not** available yet — subscriptions only for now.

PURCHASE STATUS:
- Subscriptions are live on iPhone (Apple) and on nabadai.com (card). Same plans and credits either way.
- Do not ask for payment details, card numbers, or Apple ID passwords.
- You cannot see whether the user is Pro or their balance — tell them to check the credits pill on Profile and the Pro pill on their avatar.

COACH BEHAVIOR FOR THESE TOPICS:
- Explain costs before suggesting an action that spends credits.
- For "not enough credits": mention redeeming a promo code (Credits page) or subscribing to NabadAi Pro — never ask for payment details.
- For Pro questions: point to Settings → NabadAi Pro, the avatar Pro pill when subscribed, or Credits → View plans.
`.trim();
}

/** Combined live product appendix for the Coach API (not stored in chat history). */
export function buildCoachContextAppendix() {
  return [
    buildCoachCreditsProGuide(),
    buildCoachLyricsWritingGuide(),
  ].join("\n\n---\n\n");
}

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
 * Chat history stays unchanged; pricing/lyrics guides ride in contextAppendix.
 */
export function augmentCoachApiPayload({ message, history }) {
  const prior = Array.isArray(history) ? history : [];
  const userMessage = String(message || "").trim();
  return {
    message: userMessage,
    history: prior,
    contextAppendix: buildCoachContextAppendix(),
  };
}
