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
    creditsPerPeriod: 100,
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
    creditsPerPeriod: 500,
    creditsNote: "Credits added each month · giftable",
    badge: "",
    saveBadge: "Save ~42%",
    ctaTrial: "",
    ctaSubscribe: "Subscribe monthly",
  },
]);

/** Shown on trial start (weekly path). Match first paid week unless you change it. */
export const PRO_TRIAL_CREDITS = 100;

export const PRO_FEATURES = Object.freeze([
  { key: "credits", label: "Monthly or weekly credits", sub: "Paid credits each renewal — create songs or gift Mic / Pulse / Star" },
  { key: "coach", label: "Unlimited NabadAi Coach", sub: "Free users get a daily message limit" },
  { key: "studio", label: "NabadAi Studio", sub: "Record your voice, AI mix, and save to My Vocals" },
  { key: "wav", label: "WAV export", sub: "Lossless downloads for your tracks" },
  { key: "analytics", label: "Song analytics", sub: "See who listened and how many plays" },
  { key: "badge", label: "Pro badge on your profile", sub: "Shows you support NabadAi creators" },
]);

/**
 * One-time credit packs (consumables). Prices are placeholders — set in App Store Connect.
 * costPerSong is derived from credits ÷ FULL_SONG_CREDIT_COST for UI only.
 */
export const CREDIT_PACKS = Object.freeze([
  {
    id: "pack_12",
    productId: "com.nabadai.music.credits.12",
    credits: 12,
    priceDisplay: "$1.99",
    label: "Starter",
    songsHint: "1 song",
  },
  {
    id: "pack_60",
    productId: "com.nabadai.music.credits.60",
    credits: 60,
    priceDisplay: "$7.99",
    label: "Creator",
    songsHint: "5 songs",
    badge: "Popular",
  },
  {
    id: "pack_120",
    productId: "com.nabadai.music.credits.120",
    credits: 120,
    priceDisplay: "$12.99",
    label: "Studio",
    songsHint: "10 songs",
    badge: "Best value",
  },
]);

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
  iapSoon: "In-app purchase connects after App Store setup. Preview the plans below.",
  webOnly: "Subscriptions and credit packs are available in the NabadAi iPhone app.",
});

export function songsFromCredits(credits) {
  const n = Number(credits);
  if (!Number.isFinite(n) || n <= 0) return "0 songs";
  const songs = Math.floor(n / FULL_SONG_CREDIT_COST);
  const rem = n % FULL_SONG_CREDIT_COST;
  if (songs <= 0) return "partial song";
  if (rem === 0) return songs === 1 ? "1 song" : `${songs} songs`;
  return songs === 1 ? "~1 song" : `~${songs} songs`;
}
