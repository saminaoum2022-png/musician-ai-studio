/**
 * Optional gentle high-shelf roll-off for in-app song playback.
 * Settings → Preferences → Warm playback.
 */

export const WARM_PLAYBACK_STORAGE_KEY = "mas:warmPlayback:v1";

const WARM_SHELF_HZ = 8200;
const WARM_SHELF_GAIN_DB = -3.4;
const WARM_SHELF_Q = 0.68;

/** @typedef {{ ctx: AudioContext, shelf: BiquadFilterNode }} WarmRoute */

/** @type {WeakMap<HTMLAudioElement, WarmRoute>} */
const routes = new WeakMap();
/** @type {Set<HTMLAudioElement>} */
const wiredElements = new Set();

function getAudioContextCtor() {
  return window.AudioContext || window.webkitAudioContext || null;
}

export function isWarmPlaybackEnabled() {
  try {
    return localStorage.getItem(WARM_PLAYBACK_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function applyShelfGain(shelf, enabled) {
  if (!shelf) return;
  shelf.gain.value = enabled ? WARM_SHELF_GAIN_DB : 0;
}

/** Same-origin / proxied URLs work with Web Audio + crossOrigin. */
export function urlAllowsWarmWebAudio(url) {
  const s = String(url || "").trim();
  if (!s) return false;
  if (s.startsWith("blob:") || s.startsWith("data:")) return true;
  try {
    const base = typeof location !== "undefined" ? location.href : "https://nabadai.com";
    const parsed = new URL(s, base);
    if (typeof location !== "undefined" && parsed.origin === location.origin) return true;
    if (parsed.pathname.includes("/api/suno/audio")) return true;
  } catch {}
  return false;
}

export function applyWarmPlaybackCrossOrigin(audio, url) {
  if (!audio || !isWarmPlaybackEnabled()) return;
  if (!urlAllowsWarmWebAudio(url)) {
    try {
      audio.removeAttribute("crossOrigin");
    } catch {}
    return;
  }
  try {
    audio.crossOrigin = "anonymous";
  } catch {}
}

/** Wire Web Audio once per element (MediaElementSource is one-shot). */
export function ensureWarmPlaybackRoute(audio) {
  if (!audio || !isWarmPlaybackEnabled()) return null;
  const existing = routes.get(audio);
  if (existing) {
    applyShelfGain(existing.shelf, true);
    return existing;
  }
  const Ctor = getAudioContextCtor();
  if (!Ctor) return null;
  try {
    const ctx = new Ctor();
    const source = ctx.createMediaElementSource(audio);
    const shelf = ctx.createBiquadFilter();
    shelf.type = "highshelf";
    shelf.frequency.value = WARM_SHELF_HZ;
    shelf.Q.value = WARM_SHELF_Q;
    applyShelfGain(shelf, true);
    source.connect(shelf);
    shelf.connect(ctx.destination);
    const route = { ctx, shelf };
    routes.set(audio, route);
    wiredElements.add(audio);
    return route;
  } catch {
    return null;
  }
}

export function syncWarmPlaybackRouteState() {
  const on = isWarmPlaybackEnabled();
  for (const audio of wiredElements) {
    const route = routes.get(audio);
    if (route) applyShelfGain(route.shelf, on);
  }
}

export function setWarmPlaybackEnabled(on) {
  const enabled = Boolean(on);
  try {
    localStorage.setItem(WARM_PLAYBACK_STORAGE_KEY, enabled ? "1" : "0");
  } catch {}
  syncWarmPlaybackRouteState();
}

export async function resumeWarmPlaybackContext(audio) {
  if (!audio || !isWarmPlaybackEnabled()) return;
  ensureWarmPlaybackRoute(audio);
  const route = routes.get(audio);
  if (!route?.ctx) return;
  try {
    if (route.ctx.state === "suspended") await route.ctx.resume();
  } catch {}
}

/** Call before assigning `audio.src` when warm playback may be active. */
export function prepareWarmPlaybackElement(audio, url) {
  if (!audio || !isWarmPlaybackEnabled()) return;
  applyWarmPlaybackCrossOrigin(audio, url);
  ensureWarmPlaybackRoute(audio);
}

export function initWarmPlaybackSettings(checkbox, { onChange } = {}) {
  if (!checkbox) return;
  checkbox.checked = isWarmPlaybackEnabled();
  checkbox.addEventListener("change", () => {
    setWarmPlaybackEnabled(checkbox.checked);
    if (typeof onChange === "function") onChange(checkbox.checked);
  });
}
