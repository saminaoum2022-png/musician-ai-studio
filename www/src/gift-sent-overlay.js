/**
 * Center-screen gift sent feedback — premium, minimal, ~1s overlay.
 */

import { giftTierName } from "./gift-tier-icons.js";

const OVERLAY_MS = 1000;

const TIER_META = {
  1: {
    key: "mic",
    label: "Mic sent",
    icon: () => `
      <svg class="giftSentSvg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 14.5a3.5 3.5 0 0 0 3.5-3.5V7a3.5 3.5 0 1 0-7 0v4a3.5 3.5 0 0 0 3.5 3.5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M12 18v2.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M9.5 20.5h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>`,
  },
  3: {
    key: "pulse",
    label: "Pulse sent",
    icon: () => `
      <svg class="giftSentSvg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="giftSentPulseGrad" x1="3" y1="12" x2="21" y2="12" gradientUnits="userSpaceOnUse">
            <stop stop-color="#7C5CFF"/>
            <stop offset="1" stop-color="#22E6D2"/>
          </linearGradient>
        </defs>
        <path d="M3.5 12h3.6l1.9-3.6 2.3 7.2 2.3-4.8 1.7 3.4H20.5" stroke="url(#giftSentPulseGrad)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
  },
  5: {
    key: "star",
    label: "Star sent",
    icon: () => `
      <svg class="giftSentSvg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="giftSentStarGrad" x1="5" y1="4" x2="19" y2="18" gradientUnits="userSpaceOnUse">
            <stop stop-color="#FFD166"/>
            <stop offset="1" stop-color="#FF9F1C"/>
          </linearGradient>
        </defs>
        <path d="M12 3.8 14.2 9l5.4.4-4.1 3.3 1.3 5.2L12 15.6 7.2 17.9l1.3-5.2-4.1-3.3 5.4-.4L12 3.8Z" stroke="url(#giftSentStarGrad)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
  },
};

let overlayEl = null;
let hideTimer = null;
let fadeTimer = null;
let animToken = 0;
let chimeCtx = null;

function ensureOverlay() {
  if (overlayEl) return overlayEl;
  overlayEl = document.createElement("div");
  overlayEl.id = "giftSentOverlay";
  overlayEl.className = "giftSentOverlay";
  overlayEl.hidden = true;
  overlayEl.setAttribute("aria-hidden", "true");
  overlayEl.setAttribute("aria-live", "polite");
  overlayEl.innerHTML = `
    <div class="giftSentStage">
      <div class="giftSentIconStack">
        <div class="giftSentGlow" aria-hidden="true"></div>
        <div class="giftSentIcon" aria-hidden="true"></div>
      </div>
      <p class="giftSentLabel"></p>
    </div>`;
  document.body.appendChild(overlayEl);
  return overlayEl;
}

function tierMeta(amount) {
  const tier = Number(amount);
  if (TIER_META[tier]) return TIER_META[tier];
  const name = giftTierName(tier);
  return {
    key: "mic",
    label: `${name} sent`,
    icon: TIER_META[1].icon,
  };
}

function clearTimers() {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  if (fadeTimer) {
    clearTimeout(fadeTimer);
    fadeTimer = null;
  }
}

/** Very short soft chime — Web Audio, no asset file. */
export function playGiftSentChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!chimeCtx || chimeCtx.state === "closed") chimeCtx = new Ctx();
    const ctx = chimeCtx;
    void ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.065, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(784, now);
    osc.frequency.exponentialRampToValueAtTime(988, now + 0.09);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.44);
  } catch {}
}

export function showGiftSentOverlay(amount, { haptic } = {}) {
  const meta = tierMeta(amount);
  const root = ensureOverlay();
  const stage = root.querySelector(".giftSentStage");
  const iconWrap = root.querySelector(".giftSentIcon");
  const label = root.querySelector(".giftSentLabel");
  if (!stage || !iconWrap || !label) return;

  stage.className = `giftSentStage giftSentStage--${meta.key}`;
  iconWrap.innerHTML = meta.icon();
  label.textContent = meta.label;

  clearTimers();
  animToken += 1;
  const token = animToken;

  root.hidden = false;
  root.setAttribute("aria-hidden", "false");
  root.classList.remove("isActive");
  void root.offsetWidth;
  root.classList.add("isActive");

  try {
    haptic?.("light");
  } catch {}
  playGiftSentChime();

  hideTimer = setTimeout(() => {
    if (token !== animToken) return;
    root.classList.remove("isActive");
    fadeTimer = setTimeout(() => {
      if (token !== animToken) return;
      root.hidden = true;
      root.setAttribute("aria-hidden", "true");
    }, 160);
  }, OVERLAY_MS);
}
