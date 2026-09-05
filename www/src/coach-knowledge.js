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
- **Web-only Pro locks:** On nabadai.com and desktop browser, non‑Pro users see a purple **Pro** pill on Persona, Studio, Song analytics, Cover refresh, and Instrumental (Create + Get instrumental). Tap to subscribe. Cover refresh is also Pro on iPhone. Other locks do **not** apply on the iPhone app — there you use credits as usual.
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

/** When no Song plan is active — stop Coach from freestyling whole songs in chat. */
export function buildCoachSongPlanRedirectGuide() {
  return `
SONG CREATION FLOW (mandatory — user has NO active Song plan in the app right now):

When the user wants to MAKE / CREATE / START a new song in NabadAi:
- Do NOT write full lyrics, long Create tutorials, or improvise a whole song across many messages.
- Tell them to tap **New song with Coach** or pick a topic chip (Love, Apology, Dabke). The app runs Language → Dialect → For who → Name → Lyrics, shows a **Song plan** bar, then opens Create with settings filled in.
- Keep that redirect to 1–3 sentences. You may still answer brief questions about credits, Pro, or review pasted lyrics.

Do not paste this block to the user. Reply in their language (Arabic if they write Arabic).
`.trim();
}

/** When Song plan intake is in progress — side answers only. */
export function buildCoachActiveProjectGuide() {
  return `
SONG PLAN ACTIVE: The user is mid song-setup via chips (Language, Dialect, For who, Name, Lyrics). You have full plan state in the appendix below — use it for continuity.

CONTINUITY RULES:
- Remember every chip you offered and what the user already chose. If they ask "what did you suggest?", "your choice?", or refer to a chip label, answer from the plan state and latest chips — do not guess.
- If they ask about a plan field (language, vibe, name, etc.), answer from saved values first.
- Side questions: answer briefly, then nudge the pending step (chips or Song plan bar) unless they are in lyrics collaboration mode.

LYRICS COLLABORATION (when appendix says mode = lyrics_collab or lyrics_paste):
- Co-write lyrics that match the plan (language, dialect, vibe/occasion, dedicated-to, names, title).
- When presenting a full draft for approval, end your message with this exact block (the app parses it and also shows the lyrics in chat):

[DRAFT LYRICS]
(full lyrics — keep verse/chorus labels)
[/DRAFT LYRICS]

- Put the complete lyric text inside the block. You may briefly introduce the draft above the block.
- Only use that block for complete drafts. For small tips or one-line fixes, do not use the block.
- If they approve ("looks good", "use these", "done", Arabic equivalents), confirm and say the lyrics are saved to their Song plan.
- If they want to continue the plan without lyrics yet, acknowledge and let the app handle chips.

Reply in their language (Arabic if they write Arabic).
`.trim();
}

/**
 * Rich song-plan state for Coach API — not stored in chat history.
 * @param {object} flow — persisted coach project flow
 * @param {{ latestCtas?: Array<{label?: string, topic?: string}>, mode?: string }} [opts]
 */
export function buildCoachProjectStateGuide(flow, opts = {}) {
  if (!flow || typeof flow !== "object") return "";
  const mode = String(opts.mode || flow.step || "").trim();
  const latestCtas = Array.isArray(opts.latestCtas) ? opts.latestCtas : [];
  const lines = [
    "SONG PLAN STATE (authoritative — user’s in-app plan; treat as ground truth):",
    `- Step: ${mode || "—"}`,
    `- Start: ${flow.path === "occasion" ? "Occasion" : flow.path === "vibe" ? "Vibe" : flow.path || "—"}`,
  ];
  if (flow.occasionId) lines.push(`- Occasion: ${flow.occasionId}`);
  if (flow.topic) lines.push(`- Vibe/topic: ${flow.topic}${flow.customTopicLabel ? ` (${flow.customTopicLabel})` : ""}`);
  if (flow.language) lines.push(`- Language: ${flow.language}`);
  if (flow.dialect) lines.push(`- Dialect: ${flow.dialect}`);
  if (flow.dedicatedTo) lines.push(`- For who: ${flow.dedicatedTo}`);
  if (flow.recipientName) lines.push(`- Their name: ${flow.recipientName}`);
  if (flow.songTitle) lines.push(`- Song title: ${flow.songTitle}`);
  if (flow.lyricsMode) lines.push(`- Lyrics mode: ${flow.lyricsMode === "have" ? "User has / will provide lyrics" : "Generate in Create"}`);
  const draft = String(flow.lyricsDraft || "").trim();
  const approved = String(flow.lyricsText || "").trim();
  if (approved) lines.push(`- Approved lyrics (saved in plan):\n${approved.slice(0, 1200)}`);
  else if (draft) lines.push(`- Lyrics draft (not approved yet):\n${draft.slice(0, 1200)}`);
  if (latestCtas.length) {
    lines.push("- Latest chips you offered (user may tap or ask about these):");
    latestCtas.forEach((c) => {
      const label = String(c?.label || "").trim();
      const topic = String(c?.topic || c?.id || "").trim();
      if (label) lines.push(`  · "${label}"${topic ? ` (${topic})` : ""}`);
    });
  }
  lines.push("- Song plan bar in the app shows the same fields — keep answers consistent with it.");
  return lines.join("\n");
}

/**
 * Augment a Coach API payload with frontend-only product knowledge.
 * Chat history stays unchanged; pricing/lyrics guides ride in contextAppendix.
 */
export function augmentCoachApiPayload({
  message,
  history,
  contextAppendixExtra = "",
  songProjectActive = false,
  projectFlow = null,
  latestCoachCtas = null,
}) {
  const prior = Array.isArray(history) ? history : [];
  const userMessage = String(message || "").trim();
  const base = buildCoachContextAppendix();
  const flowGuide = songProjectActive
    ? buildCoachActiveProjectGuide()
    : buildCoachSongPlanRedirectGuide();
  const projectState = songProjectActive && projectFlow
    ? buildCoachProjectStateGuide(projectFlow, { latestCtas: latestCoachCtas || [] })
    : "";
  const extra = String(contextAppendixExtra || "").trim();
  const parts = [base, flowGuide, projectState, extra].filter(Boolean);
  return {
    message: userMessage,
    history: prior,
    contextAppendix: parts.join("\n\n"),
  };
}
