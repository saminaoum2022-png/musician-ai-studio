/**
 * Center-screen gift sent feedback — premium overlay with tier motion + sound.
 */

import { giftTierDef, giftTierKey, giftTierSvg } from "./gift-tier-icons.js";

/** Total overlay duration — sound + haptics run inside this window. */
export const OVERLAY_MS = 2650;

let overlayEl = null;
let hideTimer = null;
let fadeTimer = null;
let hapticTimers = [];
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
    <div class="giftSentDim" aria-hidden="true" data-gift-dismiss="1"></div>
    <div class="giftSentStage">
      <div class="giftSentIconStack">
        <div class="giftSentGlow giftSentGlow--base" aria-hidden="true"></div>
        <div class="giftSentGlow giftSentGlow--clash" aria-hidden="true"></div>
        <div class="giftSentIcon" aria-hidden="true"></div>
      </div>
      <p class="giftSentLabel"></p>
      <p class="giftSentSub" hidden></p>
      <div class="giftSentActions" hidden>
        <button type="button" class="giftSentAction giftSentAction--primary" data-gift-action="messages">Open Messages</button>
        <button type="button" class="giftSentAction giftSentAction--secondary" data-gift-action="reply">Reply</button>
      </div>
    </div>`;
  document.body.appendChild(overlayEl);
  overlayEl.addEventListener("click", (e) => {
    if (!overlayEl.classList.contains("giftSentOverlay--received")) return;
    if (!overlayEl.classList.contains("isReceivedReady")) return;
    if (e.target.closest("[data-gift-action]")) return;
    if (e.target.closest(".giftSentStage")) return;
    finishGiftReceivedReveal("dismiss");
  });
  overlayEl.querySelector('[data-gift-action="messages"]')?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    finishGiftReceivedReveal("messages");
  });
  overlayEl.querySelector('[data-gift-action="reply"]')?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    finishGiftReceivedReveal("reply");
  });
  return overlayEl;
}

let receivedRevealOpts = null;

function resetGiftOverlayModes(root) {
  root.classList.remove("giftSentOverlay--received", "isReceivedReady");
  const sub = root.querySelector(".giftSentSub");
  const actions = root.querySelector(".giftSentActions");
  if (sub) {
    sub.hidden = true;
    sub.textContent = "";
  }
  if (actions) actions.hidden = true;
  receivedRevealOpts = null;
}

function finishGiftReceivedReveal(action) {
  const onOpenMessages = receivedRevealOpts?.onOpenMessages;
  const onReply = receivedRevealOpts?.onReply;
  const onDismiss = receivedRevealOpts?.onDismiss;
  hideGiftSentOverlay();
  if (action === "messages") onOpenMessages?.();
  else if (action === "reply") onReply?.();
  else onDismiss?.();
}

function clearHapticTimers() {
  for (const id of hapticTimers) {
    try {
      clearTimeout(id);
    } catch {}
  }
  hapticTimers = [];
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
  clearHapticTimers();
}

function audioCtx() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!chimeCtx || chimeCtx.state === "closed") chimeCtx = new Ctx();
  void chimeCtx.resume().catch(() => {});
  return chimeCtx;
}

function tone(ctx, { freq, type = "sine", start, dur, vol = 0.05, slideTo = null }) {
  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol), start + 0.014);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + dur * 0.75);
  osc.connect(gain);
  osc.start(start);
  osc.stop(start + dur + 0.03);
}

function giftThump(ctx, start, vol = 0.07) {
  tone(ctx, { freq: 92, type: "sine", start, dur: 0.1, vol });
}

function giftShimmer(ctx, start, freq, dur, vol) {
  tone(ctx, { freq, type: "sine", start, dur, vol });
  tone(ctx, {
    freq: freq * 2.02,
    type: "triangle",
    start: start + 0.018,
    dur: dur * 0.55,
    vol: vol * 0.32,
  });
}

function fireGiftHaptic(style = "light") {
  try {
    const cap = window?.Capacitor?.Plugins?.Haptics;
    if (cap?.impact) {
      if (style === "heavy") void cap.impact({ style: "HEAVY" });
      else if (style === "medium") void cap.impact({ style: "MEDIUM" });
      else void cap.impact({ style: "LIGHT" });
      return;
    }
    if (cap?.notification && style === "success") {
      void cap.notification({ type: "SUCCESS" });
      return;
    }
    if (!("vibrate" in navigator)) return;
    if (style === "heavy") navigator.vibrate(16);
    else if (style === "medium") navigator.vibrate(11);
    else if (style === "success") navigator.vibrate([10, 28, 12]);
    else navigator.vibrate(7);
  } catch {}
}

function scheduleGiftHaptic(ms, style) {
  hapticTimers.push(
    setTimeout(() => {
      fireGiftHaptic(style);
    }, ms),
  );
}

/** Haptic pattern synced to overlay keyframes (~2650ms). */
function playGiftHapticRhythm(tierKey) {
  clearHapticTimers();
  const key = String(tierKey || "mic");

  scheduleGiftHaptic(0, "heavy");
  scheduleGiftHaptic(100, "medium");
  scheduleGiftHaptic(330, "light");

  if (key === "pulse") {
    scheduleGiftHaptic(180, "light");
    scheduleGiftHaptic(380, "medium");
    scheduleGiftHaptic(560, "light");
    scheduleGiftHaptic(820, "light");
    scheduleGiftHaptic(1080, "medium");
  } else if (key === "star") {
    scheduleGiftHaptic(460, "light");
    scheduleGiftHaptic(720, "medium");
    scheduleGiftHaptic(980, "light");
    scheduleGiftHaptic(1240, "medium");
    scheduleGiftHaptic(1520, "light");
  } else {
    scheduleGiftHaptic(540, "light");
    scheduleGiftHaptic(860, "medium");
    scheduleGiftHaptic(1180, "light");
  }

  scheduleGiftHaptic(1980, "light");
}

/** Tier-specific gift sounds — ~1.4–1.6s, unwrap / pulse / sparkle tails. */
export function playGiftSentSound(tierKey) {
  try {
    const ctx = audioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const key = String(tierKey || "mic");

    if (key === "mic") {
      giftThump(ctx, now, 0.072);
      giftShimmer(ctx, now + 0.07, 523.25, 0.62, 0.048);
      giftShimmer(ctx, now + 0.2, 659.25, 0.52, 0.036);
      tone(ctx, { freq: 784, type: "sine", start: now + 0.48, dur: 0.72, vol: 0.028 });
      tone(ctx, { freq: 523.25, type: "triangle", start: now + 1.05, dur: 0.58, vol: 0.016 });
      return;
    }

    if (key === "pulse") {
      giftThump(ctx, now, 0.064);
      tone(ctx, { freq: 196, type: "triangle", start: now + 0.1, dur: 0.16, vol: 0.042, slideTo: 294 });
      tone(ctx, { freq: 294, type: "triangle", start: now + 0.28, dur: 0.18, vol: 0.04, slideTo: 440 });
      tone(ctx, { freq: 440, type: "sine", start: now + 0.48, dur: 0.2, vol: 0.038, slideTo: 659 });
      tone(ctx, { freq: 659, type: "sine", start: now + 0.72, dur: 0.26, vol: 0.034, slideTo: 880 });
      giftShimmer(ctx, now + 1.02, 880, 0.55, 0.026);
      tone(ctx, { freq: 1174.7, type: "sine", start: now + 1.38, dur: 0.48, vol: 0.018 });
      return;
    }

    if (key === "star") {
      giftThump(ctx, now, 0.068);
      giftShimmer(ctx, now + 0.06, 523.25, 0.24, 0.042);
      giftShimmer(ctx, now + 0.2, 659.25, 0.26, 0.04);
      giftShimmer(ctx, now + 0.36, 783.99, 0.28, 0.038);
      giftShimmer(ctx, now + 0.54, 987.77, 0.32, 0.034);
      giftShimmer(ctx, now + 0.76, 1174.7, 0.38, 0.03);
      tone(ctx, { freq: 1318.5, type: "sine", start: now + 1.02, dur: 0.62, vol: 0.026 });
      tone(ctx, { freq: 1568, type: "triangle", start: now + 1.32, dur: 0.52, vol: 0.018 });
    }
  } catch {}
}

export function showGiftSentOverlay(amount, { haptic: _hapticDep } = {}) {
  void _hapticDep;
  const def = giftTierDef(amount);
  const key = def.key;
  const root = ensureOverlay();
  const stage = root.querySelector(".giftSentStage");
  const iconWrap = root.querySelector(".giftSentIcon");
  const label = root.querySelector(".giftSentLabel");
  if (!stage || !iconWrap || !label) return;

  resetGiftOverlayModes(root);
  stage.className = `giftSentStage giftSentStage--${key}`;
  iconWrap.innerHTML =
    key === "pulse"
      ? giftTierSvg("pulse", { context: "overlay", pulseDraw: true })
      : key === "star"
        ? giftTierSvg("star", { context: "overlay", starSpin: true })
        : giftTierSvg(key, { context: "overlay" });
  label.textContent = `${def.name} sent`;

  clearTimers();
  animToken += 1;
  const token = animToken;

  root.hidden = false;
  root.setAttribute("aria-hidden", "false");
  root.classList.remove("isActive", "isLeaving");
  void root.offsetWidth;
  root.classList.add("isActive");

  playGiftHapticRhythm(key);
  requestAnimationFrame(() => {
    playGiftSentSound(key);
  });

  hideTimer = setTimeout(() => {
    if (token !== animToken) return;
    /* Animations end at opacity 0 with fill-mode forwards — hide immediately.
       Do not remove isActive first; that resets base styles and flashes dim/icon. */
    root.hidden = true;
    root.setAttribute("aria-hidden", "true");
    root.classList.remove("isActive", "isLeaving");
    clearHapticTimers();
  }, OVERLAY_MS);
}

/**
 * Receiver reveal after tapping a gift activity notification.
 * @param {{
 *   amount: number,
 *   senderUsername?: string,
 *   detailLine?: string,
 *   onOpenMessages?: () => void,
 *   onReply?: () => void,
 *   onDismiss?: () => void,
 * }} opts
 */
export function showGiftReceivedReveal(opts = {}) {
  const amount = Number(opts.amount);
  if (!Number.isFinite(amount) || amount <= 0) return;
  const def = giftTierDef(amount);
  const key = def.key;
  const root = ensureOverlay();
  const stage = root.querySelector(".giftSentStage");
  const iconWrap = root.querySelector(".giftSentIcon");
  const label = root.querySelector(".giftSentLabel");
  const sub = root.querySelector(".giftSentSub");
  const actions = root.querySelector(".giftSentActions");
  if (!stage || !iconWrap || !label || !sub || !actions) return;

  resetGiftOverlayModes(root);
  receivedRevealOpts = opts;
  root.classList.add("giftSentOverlay--received");

  stage.className = `giftSentStage giftSentStage--${key}`;
  iconWrap.innerHTML =
    key === "pulse"
      ? giftTierSvg("pulse", { context: "overlay", pulseDraw: true })
      : key === "star"
        ? giftTierSvg("star", { context: "overlay", starSpin: true })
        : giftTierSvg(key, { context: "overlay" });

  const sender = String(opts.senderUsername || "").replace(/^@/, "").trim();
  label.textContent = sender ? `@${sender} sent you a ${def.name}` : `${def.name} received`;
  const detail = String(opts.detailLine || def.creditsLabel || "").trim();
  if (detail) {
    sub.textContent = detail;
    sub.hidden = false;
  }

  clearTimers();
  animToken += 1;
  const token = animToken;

  root.hidden = false;
  root.setAttribute("aria-hidden", "false");
  root.classList.remove("isLeaving", "isReceivedReady");
  void root.offsetWidth;
  root.classList.add("isActive");

  playGiftHapticRhythm(key);
  requestAnimationFrame(() => {
    playGiftSentSound(key);
  });

  hideTimer = setTimeout(() => {
    if (token !== animToken) return;
    root.classList.remove("isActive");
    root.classList.add("isReceivedReady");
    actions.hidden = false;
    clearHapticTimers();
  }, OVERLAY_MS);
}

/** Dismiss overlay early (e.g. send failed after optimistic play). */
export function hideGiftSentOverlay() {
  const root = overlayEl;
  if (!root || root.hidden) return;
  clearTimers();
  animToken += 1;
  resetGiftOverlayModes(root);
  root.classList.add("isLeaving");
  root.classList.remove("isActive", "isReceivedReady");
  fadeTimer = setTimeout(() => {
    root.hidden = true;
    root.setAttribute("aria-hidden", "true");
    root.classList.remove("isLeaving");
  }, 140);
}

/** Preview sent animation without spending credits — tier: 1|3|5 or mic|pulse|star */
export function previewGiftSent(tier, opts = {}) {
  const raw = String(tier ?? "").trim().toLowerCase();
  const map = { mic: 1, pulse: 3, star: 5 };
  const amount = map[raw] || Number(tier);
  if (!Number.isFinite(amount)) return;
  showGiftSentOverlay(amount, opts);
}

export { giftTierKey };
