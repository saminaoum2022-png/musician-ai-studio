/**
 * Optional gentle high-shelf roll-off for in-app song playback.
 * Settings → Preferences → Warm playback.
 *
 * MediaElementSource is one-shot and CORS-sensitive: crossOrigin must be
 * set before src, and we must never wire a playing element mid-stream.
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

/** Set crossOrigin before assigning audio.src (required for Web Audio). */
export function applyWarmCrossOriginBeforeSrc(audio, url) {
  if (!audio || !isWarmPlaybackEnabled()) return false;
  if (!urlAllowsWarmWebAudio(url)) return false;
  try {
    audio.crossOrigin = "anonymous";
    return true;
  } catch {
    return false;
  }
}

export function isWarmRouted(audio) {
  return Boolean(audio && wiredElements.has(audio));
}

export function dropWarmRouteRecord(audio) {
  if (!audio) return;
  const route = routes.get(audio);
  if (route?.ctx) {
    try {
      route.ctx.close();
    } catch {}
  }
  routes.delete(audio);
  wiredElements.delete(audio);
}

function ensureWarmPlaybackRoute(audio) {
  if (!audio) return null;
  const existing = routes.get(audio);
  if (existing) {
    applyShelfGain(existing.shelf, isWarmPlaybackEnabled());
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
    applyShelfGain(shelf, isWarmPlaybackEnabled());
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

/** Wire the shelf at play() time — after src is set with crossOrigin. */
export async function wireWarmPlaybackAtPlay(audio, url) {
  if (!audio || !isWarmPlaybackEnabled()) return false;
  if (!urlAllowsWarmWebAudio(url)) return false;
  const route = ensureWarmPlaybackRoute(audio);
  if (!route?.ctx) return false;
  try {
    if (route.ctx.state === "suspended") await route.ctx.resume();
  } catch {}
  return true;
}

export function initWarmPlaybackSettings(checkbox, { onChange } = {}) {
  if (!checkbox) return;
  checkbox.checked = isWarmPlaybackEnabled();
  checkbox.addEventListener("change", () => {
    setWarmPlaybackEnabled(checkbox.checked);
    if (typeof onChange === "function") onChange(checkbox.checked);
  });
}
