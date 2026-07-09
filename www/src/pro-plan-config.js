/**
 * NabadAi Pro + credit packs — single config for UI, IAP, and webhooks.
 * Tune credit amounts here before App Store Connect / RevenueCat go live.
 */

export const FULL_SONG_CREDIT_COST = 12;

/** @typedef {"weekly"|"monthly"} ProPlanId */

export const PRO_PRODUCT_IDS = Object.freeze({
  weekly: "com.nabadai.music.pro.weekly",
  monthly: "com.nabadai.music.pro.monthly",
});

export const PRO_PLANS = Object.freeze([
  {
    id: "weekly",
    productId: PRO_PRODUCT_IDS.weekly,
    label: "Weekly",
    priceDisplay: "$3.99",
    priceSuffix: "/ week",
    trialDays: 7,
    trialLabel: "7-day free trial",
    creditsPerPeriod: 400,
    bonusCredits: 0,
    creditsNote: "Credits added each week · giftable",
    badge: "",
    ctaTrial: "Start free trial",
    ctaSubscribe: "Subscribe weekly",
  },
  {
    id: "monthly",
    productId: PRO_PRODUCT_IDS.monthly,
    label: "Monthly",
    priceDisplay: "$9.99",
    priceSuffix: "/ month",
    trialDays: 0,
    trialLabel: "",
    creditsPerPeriod: 1000,
    bonusCredits: 200,
    creditsNote: "Credits added each month · giftable",
    badge: "",
    saveBadge: "Save ~17%",
    ctaTrial: "",
    ctaSubscribe: "Subscribe monthly",
  },
]);

/** Shown on trial start (weekly path). Match first paid week unless you change it. */
export const PRO_TRIAL_CREDITS = 400;

export const PRO_FEATURES = Object.freeze([
  { key: "credits", label: "Monthly or weekly credits", sub: "Paid credits each renewal — create songs or gift Mic / Pulse / Star" },
  { key: "coach", label: "Unlimited NabadAi Coach", sub: "Free users get a daily message limit" },
  { key: "studio", label: "NabadAi Studio", sub: "Record your voice, AI mix, and save to My Vocals" },
  { key: "wav", label: "WAV export", sub: "Lossless downloads for your tracks" },
  { key: "analytics", label: "Song analytics", sub: "See who listened and how many plays" },
  { key: "badge", label: "Pro badge on your profile", sub: "Shows you support NabadAi creators" },
]);

/**
 * One-time credit packs — fixed prices ($1.99 / $7.99 / $12.99).
 * Credits are derived from the monthly Pro per-credit rate, with a tier markup
 * that steps down on bigger packs so $/credit improves as users spend more.
 * Pro monthly stays the best deal overall (same rate + features).
 */
const MONTHLY_PRO_PRICE = 9.99;
const MONTHLY_PRO_CREDITS = 1000 + 200; // base + bonus
const SUBSCRIPTION_CREDIT_RATE = MONTHLY_PRO_PRICE / MONTHLY_PRO_CREDITS;

/** Markup over subscription $/credit — lower on larger packs. */
const PACK_TIER_MARKUP = Object.freeze({
  starter: 2.4,
  creator: 1.6,
  studio: 1.25,
});

function packCreditsForPrice(priceUsd, markup) {
  const raw = priceUsd / (SUBSCRIPTION_CREDIT_RATE * markup);
  return Math.max(12, Math.round(raw / 10) * 10); // round to nearest 10
}

export const CREDIT_PACKS = Object.freeze([
  {
    id: "pack_12",
    productId: "com.nabadai.music.credits.12",
    priceUsd: 1.99,
    priceDisplay: "$1.99",
    label: "Starter",
    markup: PACK_TIER_MARKUP.starter,
    credits: 200,
  },
  {
    id: "pack_60",
    productId: "com.nabadai.music.credits.60",
    priceUsd: 7.99,
    priceDisplay: "$7.99",
    label: "Creator",
    markup: PACK_TIER_MARKUP.creator,
    credits: 850,
    badge: "Popular",
  },
  {
    id: "pack_120",
    productId: "com.nabadai.music.credits.120",
    priceUsd: 12.99,
    priceDisplay: "$12.99",
    label: "Studio",
    markup: PACK_TIER_MARKUP.studio,
    credits: 1400,
    badge: "Best value",
  },
]);

/** Effective $/credit for a pack (for UI/debug). */
export function packCreditUnitPrice(pack) {
  const price = Number(pack?.priceUsd) || 0;
  const credits = Number(pack?.credits) || 0;
  if (!price || !credits) return 0;
  return price / credits;
}

/** Subscription anchor $/credit — packs are always priced above this. */
export function subscriptionCreditUnitPrice() {
  return SUBSCRIPTION_CREDIT_RATE;
}

export const PRO_LAUNCH_COPY = Object.freeze({
  eyebrow: "",
  lead: "More credits, Studio, WAV export, unlimited Coach, and listener analytics.",
  footnote:
    "1 full song = 12 credits (2 versions). Subscription credits are paid credits — you can create or gift them. Cancel anytime in Settings → Subscriptions.",
  packsHeadline: "Only need a few songs?",
  packsLead: "Buy credits anytime.\nNo subscription required.",
  creditsFinePrint: [
    "1 full song = 12 credits (2 versions).",
    "Subscription credits and purchased credits are both giftable.",
    "Credits never expire.",
  ],
  iapSoon: "Connect App Store + RevenueCat to enable purchases.",
  iosReady: "Subscribe with your Apple ID. Cancel anytime in iPhone Settings → Subscriptions.",
  webOnly: "Subscriptions are available in the NabadAi iPhone app.",
});

export function planCreditsTotal(plan) {
  const base = Number(plan?.creditsPerPeriod) || 0;
  const bonus = Number(plan?.bonusCredits) || 0;
  return base + bonus;
}

export function planCreditsMeta(plan) {
  const base = Number(plan?.creditsPerPeriod) || 0;
  const bonus = Number(plan?.bonusCredits) || 0;
  const songs = songsFromCredits(base + bonus);
  if (bonus > 0) {
    return `${base.toLocaleString()} + ${bonus} bonus credits · ≈ ${songs}`;
  }
  return `${base.toLocaleString()} credits · ≈ ${songs}`;
}

export function songsFromCredits(credits) {
  const n = Number(credits);
  if (!Number.isFinite(n) || n <= 0) return "0 songs";
  const songs = Math.floor(n / FULL_SONG_CREDIT_COST);
  const rem = n % FULL_SONG_CREDIT_COST;
  if (songs <= 0) return "partial song";
  if (rem === 0) return songs === 1 ? "1 song" : `${songs} songs`;
  return songs === 1 ? "~1 song" : `~${songs} songs`;
}
