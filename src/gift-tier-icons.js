/**
 * Gift tier SVGs — shared between sheet preview and sent overlay.
 */

export const GIFT_TIER_DEFS = [
  { tier: 1, key: "mic", name: "Mic", creditsLabel: "1 credit" },
  { tier: 3, key: "pulse", name: "Pulse", creditsLabel: "3 credits" },
  { tier: 5, key: "star", name: "Star", creditsLabel: "5 credits" },
];

export const GIFT_TIER_OPTIONS = GIFT_TIER_DEFS.map((d) => ({
  ...d,
  icon: () => giftTierSvg(d.key, { context: "sheet" }),
}));

export function giftTierName(amount) {
  const hit = GIFT_TIER_DEFS.find((o) => o.tier === Number(amount));
  return hit?.name || "Gift";
}

export function giftTierKey(amount) {
  const hit = GIFT_TIER_DEFS.find((o) => o.tier === Number(amount));
  return hit?.key || "mic";
}

export function giftTierDef(amountOrKey) {
  const n = Number(amountOrKey);
  if (Number.isFinite(n)) {
    return GIFT_TIER_DEFS.find((o) => o.tier === n) || GIFT_TIER_DEFS[0];
  }
  return GIFT_TIER_DEFS.find((o) => o.key === amountOrKey) || GIFT_TIER_DEFS[0];
}

const MIC_PATHS = `
  <path d="M12 14.5a3.5 3.5 0 0 0 3.5-3.5V7a3.5 3.5 0 1 0-7 0v4a3.5 3.5 0 0 0 3.5 3.5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M12 18v2.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M9.5 20.5h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`;

const PULSE_PATH =
  'M3.5 12h3.6l1.9-3.6 2.3 7.2 2.3-4.8 1.7 3.4H20.5';

const STAR_PATH =
  "M12 3.8 14.2 9l5.4.4-4.1 3.3 1.3 5.2L12 15.6 7.2 17.9l1.3-5.2-4.1-3.3 5.4-.4L12 3.8Z";

/**
 * @param {"mic"|"pulse"|"star"} key
 * @param {{ context?: "sheet"|"overlay", className?: string, pulseDraw?: boolean, starSpin?: boolean }} opts
 */
export function giftTierSvg(key, opts = {}) {
  const ctx = opts.context === "overlay" ? "overlay" : "sheet";
  const cls =
    String(opts.className || "").trim() ||
    (ctx === "overlay" ? "giftSentSvg" : "giftSheetTierSvg");
  const prefix = ctx === "overlay" ? "giftSent" : "giftSheet";

  if (key === "mic") {
    return `<svg class="${cls} giftTierSvg--mic" viewBox="0 0 24 24" fill="none" aria-hidden="true">${MIC_PATHS}</svg>`;
  }

  if (key === "pulse") {
    const pathCls = opts.pulseDraw ? " giftSentPulsePath" : "";
    const extra = opts.pulseDraw ? ' pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"' : "";
    return `<svg class="${cls} giftTierSvg--pulse" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="${prefix}PulseGrad" x1="3" y1="12" x2="21" y2="12" gradientUnits="userSpaceOnUse">
          <stop stop-color="#7C5CFF"/>
          <stop offset="1" stop-color="#22E6D2"/>
        </linearGradient>
      </defs>
      <path class="giftTierPulseStroke${pathCls}" d="${PULSE_PATH}" stroke="url(#${prefix}PulseGrad)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${extra}/>
    </svg>`;
  }

  if (key === "star") {
    const spinCls = opts.starSpin ? " giftSentStarSvg" : "";
    return `<svg class="${cls} giftTierSvg--star${spinCls}" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="${prefix}StarGrad" x1="5" y1="4" x2="19" y2="18" gradientUnits="userSpaceOnUse">
          <stop stop-color="#FFD166"/>
          <stop offset="1" stop-color="#FF9F1C"/>
        </linearGradient>
      </defs>
      <path d="${STAR_PATH}" stroke="url(#${prefix}StarGrad)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }

  return giftTierSvg("mic", opts);
}

/** Sheet button icon markup with glow wrapper. */
export function giftTierSheetIconHtml(key) {
  return `
    <span class="giftSheetTierIcon giftSheetTierIcon--${key}">
      <span class="giftSheetTierGlow" aria-hidden="true"></span>
      ${giftTierSvg(key, { context: "sheet" })}
    </span>`;
}
