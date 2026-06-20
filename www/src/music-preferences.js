/**
 * Post-signup music style preferences — personalization only (not generation).
 */

export const MUSIC_PREFS_DONE_KEY_PREFIX = "nabad_music_prefs_v1_done:";
export const MUSIC_PREFS_PENDING_KEY = "nabad_music_prefs_pending_v1";
export const MUSIC_PREFS_VOLUNTARY_KEY = "nabad_music_prefs_voluntary_v1";

export const MUSIC_PREFERENCE_GENRES = [
  { id: "arabic-pop", label: "Arabic Pop", tone: "violet" },
  { id: "khaleeji", label: "Khaleeji", tone: "gold" },
  { id: "dabke", label: "Dabke", tone: "rose" },
  { id: "tarab", label: "Tarab", tone: "mint" },
  { id: "edm", label: "EDM", tone: "cyan" },
  { id: "afro", label: "Afro", tone: "gold" },
  { id: "rap", label: "Rap", tone: "rose" },
  { id: "rock", label: "Rock", tone: "violet" },
  { id: "lo-fi", label: "Lo-Fi", tone: "cyan" },
  { id: "latin", label: "Latin", tone: "gold" },
  { id: "country", label: "Country", tone: "mint" },
  { id: "bollywood", label: "Bollywood", tone: "rose" },
  { id: "pop", label: "Pop", tone: "violet" },
  { id: "rnb", label: "R&B", tone: "cyan" },
];

export const MUSIC_PREFS_MIN_SELECTION = 3;

let _deps = null;
let _inited = false;
let _selected = new Set();

function qs(sel, root = document) {
  return root.querySelector(sel);
}

function musicPrefsDoneKey(userId) {
  return `${MUSIC_PREFS_DONE_KEY_PREFIX}${String(userId || "").trim()}`;
}

export function parseMusicPreferencesFromProfile(profile) {
  const raw = String(profile?.genres || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isMusicPreferencesComplete(userId, profile) {
  const uid = String(userId || "").trim();
  if (!uid) return true;
  try {
    if (localStorage.getItem(musicPrefsDoneKey(uid)) === "1") return true;
  } catch {}
  const prefs = parseMusicPreferencesFromProfile(profile);
  return prefs.length > 0;
}

export function markMusicPreferencesPending() {
  try {
    sessionStorage.setItem(MUSIC_PREFS_PENDING_KEY, "1");
  } catch {}
}

export function clearMusicPreferencesPending() {
  try {
    sessionStorage.removeItem(MUSIC_PREFS_PENDING_KEY);
  } catch {}
}

export function isMusicPreferencesPending() {
  try {
    return sessionStorage.getItem(MUSIC_PREFS_PENDING_KEY) === "1";
  } catch {
    return false;
  }
}

export function markMusicPreferencesComplete(userId) {
  const uid = String(userId || "").trim();
  if (!uid) return;
  try {
    localStorage.setItem(musicPrefsDoneKey(uid), "1");
  } catch {}
  clearMusicPreferencesPending();
}

export function shouldShowMusicPreferencesScreen(userId, profile) {
  const uid = String(userId || "").trim();
  if (!uid) return false;
  if (isMusicPreferencesComplete(uid, profile)) return false;
  return isMusicPreferencesPending();
}

export function isMusicPreferencesVoluntary() {
  try {
    return sessionStorage.getItem(MUSIC_PREFS_VOLUNTARY_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearMusicPreferencesVoluntary() {
  try {
    sessionStorage.removeItem(MUSIC_PREFS_VOLUNTARY_KEY);
  } catch {}
}

/** Settings / Profile — open the genre picker anytime after signup. */
export function openMusicPreferencesEditor() {
  try {
    sessionStorage.setItem(MUSIC_PREFS_VOLUNTARY_KEY, "1");
  } catch {}
  try {
    location.hash = "#/music-preferences";
  } catch {}
  try {
    _deps?.applyRoute?.();
  } catch {}
}

function musicPrefIdForLabel(label) {
  const needle = String(label || "").trim().toLowerCase();
  if (!needle) return "";
  const match = MUSIC_PREFERENCE_GENRES.find((g) => g.label.toLowerCase() === needle);
  return match?.id || "";
}

function syncMusicPrefsChrome() {
  const voluntary = isMusicPreferencesVoluntary();
  const skipBtn = qs("#btnMusicPrefsSkip");
  if (skipBtn) skipBtn.textContent = voluntary ? "Cancel" : "Skip";
}

function serializeMusicPreferences(labels) {
  return (labels || [])
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .join(",");
}

function paintMusicPrefsSelection() {
  const root = qs("[data-music-prefs-root]");
  if (!root) return;
  root.querySelectorAll("[data-music-pref]").forEach((btn) => {
    const id = String(btn.getAttribute("data-music-pref") || "").trim();
    const on = _selected.has(id);
    btn.classList.toggle("is-selected", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
  const continueBtn = qs("#btnMusicPrefsContinue");
  const hint = qs("#musicPrefsHint");
  const count = _selected.size;
  const ready = count >= MUSIC_PREFS_MIN_SELECTION;
  if (continueBtn) {
    continueBtn.disabled = !ready;
    const voluntary = isMusicPreferencesVoluntary();
    continueBtn.textContent = ready
      ? (voluntary ? `Save (${count})` : `Continue (${count})`)
      : `Pick ${MUSIC_PREFS_MIN_SELECTION - count} more`;
  }
  if (hint) {
    hint.textContent = ready
      ? `${count} styles selected — you're good to go.`
      : `Select at least ${MUSIC_PREFS_MIN_SELECTION} styles (${count}/${MUSIC_PREFS_MIN_SELECTION}).`;
  }
}

function toggleMusicPref(id) {
  const key = String(id || "").trim();
  if (!key) return;
  if (_selected.has(key)) _selected.delete(key);
  else _selected.add(key);
  paintMusicPrefsSelection();
}

async function persistMusicPreferences({ skipped = false } = {}) {
  const uid = _deps?.getUserId?.();
  if (!uid) throw new Error("Sign in required");
  const labels = skipped
    ? []
    : MUSIC_PREFERENCE_GENRES.filter((g) => _selected.has(g.id)).map((g) => g.label);
  const genres = serializeMusicPreferences(labels);
  markMusicPreferencesComplete(uid);
  await _deps?.saveProfileGenres?.(genres);
}

async function finishMusicPreferences({ skipped = false } = {}) {
  const voluntary = isMusicPreferencesVoluntary();
  if (voluntary && skipped) {
    clearMusicPreferencesVoluntary();
    _selected.clear();
    paintMusicPrefsSelection();
    try { _deps?.returnFromMusicPrefs?.(); } catch {}
    try { _deps?.applyRoute?.(); } catch {}
    return;
  }
  try {
    await persistMusicPreferences({ skipped });
    if (!skipped) {
      try {
        _deps?.showToast?.("Music styles saved.", { icon: "♪", durationMs: 2600 });
      } catch {}
    }
  } catch (e) {
    console.warn("[music-prefs] save failed", e);
    markMusicPreferencesComplete(_deps?.getUserId?.());
  }
  clearMusicPreferencesVoluntary();
  _selected.clear();
  paintMusicPrefsSelection();
  if (voluntary) {
    try { _deps?.returnFromMusicPrefs?.(); } catch {}
  } else {
    try { _deps?.openDiscoverForYou?.(); } catch {}
  }
  try { _deps?.applyRoute?.(); } catch {}
}

function bindMusicPrefsGridOnce() {
  const root = qs("[data-music-prefs-root]");
  if (!root || root.dataset.boundMusicPrefs === "1") return;
  root.dataset.boundMusicPrefs = "1";
  root.addEventListener("click", (e) => {
    const chip = e.target?.closest?.("[data-music-pref]");
    if (chip && root.contains(chip)) {
      e.preventDefault();
      toggleMusicPref(chip.getAttribute("data-music-pref"));
      try { _deps?.haptic?.("light"); } catch {}
    }
  });
}

/**
 * @param {{
 *   getUserId: () => string,
 *   saveProfileGenres: (genres: string) => Promise<void>|void,
 *   openDiscoverForYou: () => void,
 *   returnFromMusicPrefs?: () => void,
 *   getExistingLabels?: () => string[],
 *   applyRoute: () => void,
 *   haptic?: (kind: string) => void,
 *   showToast?: (msg: string, opts?: object) => void,
 * }} deps
 */
export function initMusicPreferences(deps) {
  if (_inited) return;
  _inited = true;
  _deps = deps || null;
  bindMusicPrefsGridOnce();

  const skipBtn = qs("#btnMusicPrefsSkip");
  const continueBtn = qs("#btnMusicPrefsContinue");
  if (skipBtn) {
    skipBtn.addEventListener("click", (e) => {
      e.preventDefault();
      void finishMusicPreferences({ skipped: true });
    });
  }
  if (continueBtn) {
    continueBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (_selected.size < MUSIC_PREFS_MIN_SELECTION) return;
      void finishMusicPreferences({ skipped: false });
    });
  }
  paintMusicPrefsSelection();
}

export function onMusicPreferencesRouteActive() {
  _selected.clear();
  const existing = typeof _deps?.getExistingLabels === "function" ? _deps.getExistingLabels() : [];
  for (const label of existing || []) {
    const id = musicPrefIdForLabel(label);
    if (id) _selected.add(id);
  }
  syncMusicPrefsChrome();
  paintMusicPrefsSelection();
  const panel = qs('[data-route="music-preferences"]');
  if (panel) panel.style.display = "flex";
  try {
    qs("#btnMusicPrefsContinue")?.scrollIntoView?.({ block: "nearest" });
  } catch {}
}

export function buildMusicPreferencesGenreGridHtml() {
  return MUSIC_PREFERENCE_GENRES.map((g) => `
    <button
      type="button"
      class="musicPrefsGenre musicPrefsGenre--${g.tone}"
      data-music-pref="${escapeAttr(g.id)}"
      aria-pressed="false"
    >${escapeHtml(g.label)}</button>`).join("");
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}
