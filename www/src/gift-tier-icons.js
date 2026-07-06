/**
 * Gift sheet tier icons — Mic, Pulse, Star (stroke-only, matches interaction bar language).
 */

function svgWrap(klass, inner) {
  const cls = String(klass || "giftSheetTierSvg").trim() || "giftSheetTierSvg";
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" aria-hidden="true">${inner}</svg>`;
}

/** Mic — small support for the creator (1 credit). */
export function giftTierIconMic(klass = "giftSheetTierSvg") {
  return svgWrap(
    klass,
    `<path d="M12 14.5a3.5 3.5 0 0 0 3.5-3.5V7a3.5 3.5 0 1 0-7 0v4a3.5 3.5 0 0 0 3.5 3.5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 18v2.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M9.5 20.5h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  );
}

/** Pulse — Nabad-style creative energy (3 credits). */
export function giftTierIconPulse(klass = "giftSheetTierSvg") {
  return svgWrap(
    klass,
    `<path d="M3.5 12h3.6l1.9-3.6 2.3 7.2 2.3-4.8 1.7 3.4H20.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  );
}

/** Star — highest appreciation (5 credits). */
export function giftTierIconStar(klass = "giftSheetTierSvg") {
  return svgWrap(
    klass,
    `<path d="M12 3.8 14.2 9l5.4.4-4.1 3.3 1.3 5.2L12 15.6 7.2 17.9l1.3-5.2-4.1-3.3 5.4-.4L12 3.8Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  );
}

export const GIFT_TIER_OPTIONS = [
  { tier: 1, name: "Mic", creditsLabel: "1 credit", icon: giftTierIconMic },
  { tier: 3, name: "Pulse", creditsLabel: "3 credits", icon: giftTierIconPulse },
  { tier: 5, name: "Star", creditsLabel: "5 credits", icon: giftTierIconStar },
];

export function giftTierName(amount) {
  const hit = GIFT_TIER_OPTIONS.find((o) => o.tier === Number(amount));
  return hit?.name || "Gift";
}
