/**
 * Post-sign-in first song activation — Coach welcome CTAs → Create.
 */

import { pickFirstSongSeed, FIRST_SONG_ICON_URLS } from "./first-song-seeds.js";

export { pickFirstSongSeed, FIRST_SONG_THEME_SEEDS, FIRST_SONG_ICON_URLS } from "./first-song-seeds.js";

export const FIRST_SONG_DONE_KEY_PREFIX = "nabad_first_song_v1_done:";

export const FIRST_SONG_TOPICS = [
  { id: "love", label: "Love", icon: FIRST_SONG_ICON_URLS.love },
  { id: "apology", label: "Apology", icon: FIRST_SONG_ICON_URLS.apology },
  { id: "dabke", label: "Dabke", icon: FIRST_SONG_ICON_URLS.dabke },
  { id: "custom", label: "My own prompt", icon: FIRST_SONG_ICON_URLS.custom },
];

let _deps = null;
let _inited = false;
let _selectedLang = "arabic";
let _selectedDialect = "lebanese";
let _selectedTopic = "love";

function qs(sel, root = document) {
  return root.querySelector(sel);
}

function firstSongDoneKey(userId) {
  return `${FIRST_SONG_DONE_KEY_PREFIX}${String(userId || "").trim()}`;
}

export function shouldShowFirstSongActivation(userId) {
  const uid = String(userId || "").trim();
  if (!uid) return false;
  try {
    if (localStorage.getItem(firstSongDoneKey(uid)) === "1") return false;
  } catch {}
  return true;
}

export function markFirstSongActivationDone(userId) {
  const uid = String(userId || "").trim();
  if (!uid) return;
  try {
    localStorage.setItem(firstSongDoneKey(uid), "1");
  } catch {}
}

export function isFirstSongPendingGeneration() {
  return false;
}

export function clearFirstSongPendingGeneration() {}

function selectedTopicMeta() {
  return FIRST_SONG_TOPICS.find((t) => t.id === _selectedTopic) || FIRST_SONG_TOPICS[0];
}

function paintFirstSongLangs() {
  const root = qs("[data-first-song-root]");
  if (!root) return;
  root.querySelectorAll("[data-first-song-lang]").forEach((btn) => {
    const id = String(btn.getAttribute("data-first-song-lang") || "").trim();
    const on = id === _selectedLang;
    btn.classList.toggle("isActive", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
  const dialectBlock = qs("#firstSongDialectBlock");
  const showDialect = _selectedLang === "arabic";
  if (dialectBlock) {
    dialectBlock.hidden = !showDialect;
    dialectBlock.setAttribute("aria-hidden", showDialect ? "false" : "true");
  }
}

function paintFirstSongDialects() {
  const root = qs("[data-first-song-root]");
  if (!root) return;
  root.querySelectorAll("[data-first-song-dialect]").forEach((btn) => {
    const id = String(btn.getAttribute("data-first-song-dialect") || "").trim();
    const on = id === _selectedDialect;
    btn.classList.toggle("isActive", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function paintFirstSongTopics() {
  const root = qs("[data-first-song-root]");
  if (!root) return;
  root.querySelectorAll("[data-first-song-topic]").forEach((btn) => {
    const id = String(btn.getAttribute("data-first-song-topic") || "").trim();
    const on = id === _selectedTopic;
    btn.classList.toggle("isActive", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function paintFirstSongCredits() {
  const el = qs("#firstSongCreditsValue");
  if (!el) return;
  const bal = typeof _deps?.getCreditsBalance === "function" ? Number(_deps.getCreditsBalance()) : 0;
  const display = typeof _deps?.formatCreditsAmount === "function"
    ? _deps.formatCreditsAmount(bal)
    : String(bal);
  el.textContent = display;
}

function finishFirstSongExplore() {
  const uid = String(_deps?.getUserId?.() || "").trim();
  markFirstSongActivationDone(uid);
  try { location.hash = "#/challenges"; } catch {}
  try { _deps?.applyRoute?.(); } catch {}
}

function proceedToCreateFromActivation() {
  const topic = selectedTopicMeta();
  const uid = String(_deps?.getUserId?.() || "").trim();
  markFirstSongActivationDone(uid);
  try { _deps?.haptic?.("impact"); } catch {}
  const seed = topic.id === "custom" ? null : pickFirstSongSeed(topic.id, _selectedLang);
  try {
    _deps?.launchFirstSongActivation?.({
      language: _selectedLang,
      dialect: _selectedLang === "arabic" ? _selectedDialect : "",
      topic,
      seed,
    });
  } catch (e) {
    console.warn("[first-song] handoff failed", e);
    try {
      _deps?.showToast?.("Couldn't open Create — try the Create tab.", {
        icon: "!",
        durationMs: 4200,
      });
    } catch {}
    try { location.hash = "#/generate"; } catch {}
    try { _deps?.applyRoute?.(); } catch {}
  }
}

function bindFirstSongOnce() {
  const root = qs("[data-first-song-root]");
  if (!root || root.dataset.boundFirstSong === "1") return;
  root.dataset.boundFirstSong = "1";

  root.addEventListener("click", (e) => {
    const langBtn = e.target?.closest?.("[data-first-song-lang]");
    if (langBtn && root.contains(langBtn)) {
      e.preventDefault();
      _selectedLang = String(langBtn.getAttribute("data-first-song-lang") || "auto").trim() || "auto";
      paintFirstSongLangs();
      try { _deps?.haptic?.("light"); } catch {}
      return;
    }
    const dialectBtn = e.target?.closest?.("[data-first-song-dialect]");
    if (dialectBtn && root.contains(dialectBtn)) {
      e.preventDefault();
      _selectedDialect = String(dialectBtn.getAttribute("data-first-song-dialect") || "lebanese").trim() || "lebanese";
      paintFirstSongDialects();
      try { _deps?.haptic?.("light"); } catch {}
      return;
    }
    const topicBtn = e.target?.closest?.("[data-first-song-topic]");
    if (topicBtn && root.contains(topicBtn)) {
      e.preventDefault();
      _selectedTopic = String(topicBtn.getAttribute("data-first-song-topic") || "love").trim() || "love";
      paintFirstSongTopics();
      try { _deps?.haptic?.("light"); } catch {}
      return;
    }
  });

  qs("#btnFirstSongSkip")?.addEventListener("click", (e) => {
    e.preventDefault();
    finishFirstSongExplore();
  });

  qs("#btnFirstSongMake")?.addEventListener("click", (e) => {
    e.preventDefault();
    proceedToCreateFromActivation();
  });
}

function resetFirstSongForm() {
  _selectedLang = "arabic";
  _selectedDialect = "lebanese";
  _selectedTopic = "love";
  paintFirstSongLangs();
  paintFirstSongDialects();
  paintFirstSongTopics();
}

/**
 * @param {{
 *   getUserId: () => string,
 *   getCreditsBalance: () => number,
 *   formatCreditsAmount?: (n: number) => string,
 *   launchFirstSongActivation: (payload: object) => void,
 *   applyRoute: () => void,
 *   haptic?: (kind: string) => void,
 *   showToast?: (msg: string, opts?: object) => void,
 * }} deps
 */
export function initFirstSong(deps) {
  if (_inited) return;
  _inited = true;
  _deps = deps || null;
  bindFirstSongOnce();
  resetFirstSongForm();
}

export function resetFirstSongActivation(userId) {
  const uid = String(userId || "").trim();
  if (!uid) return;
  try {
    localStorage.removeItem(firstSongDoneKey(uid));
  } catch {}
}

export function openFirstSongPreview() {
  resetFirstSongForm();
  try { location.hash = "#/first-song"; } catch {}
  try { _deps?.applyRoute?.(); } catch {}
  onFirstSongRouteActive();
}

export function onFirstSongRouteActive() {
  paintFirstSongLangs();
  paintFirstSongDialects();
  paintFirstSongTopics();
  paintFirstSongCredits();
  const panel = qs('[data-route="first-song"]');
  if (panel) {
    panel.hidden = false;
    panel.setAttribute("aria-hidden", "false");
    panel.style.display = "flex";
  }
}
