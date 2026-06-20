/**
 * Post-signup music style preferences — personalization only (not generation).
 */

export const MUSIC_PREFS_DONE_KEY_PREFIX = "nabad_music_prefs_v1_done:";
export const MUSIC_PREFS_PENDING_KEY = "nabad_music_prefs_pending_v1";
export const MUSIC_PREFS_VOLUNTARY_KEY = "nabad_music_prefs_voluntary_v1";

export const MUSIC_PREFERENCE_GENRES = [
  { id: "arabic-pop", label: "Arabic Pop" },
  { id: "khaleeji", label: "Khaleeji" },
  { id: "dabke", label: "Dabke" },
  { id: "edm", label: "EDM" },
  { id: "house", label: "House" },
  { id: "deep-house", label: "Deep House" },
  { id: "rap", label: "Rap" },
  { id: "pop", label: "Pop" },
  { id: "rnb", label: "R&B" },
  { id: "tarab", label: "Tarab" },
  { id: "afro", label: "Afro" },
  { id: "lo-fi", label: "Lo-Fi" },
  { id: "rock", label: "Rock" },
  { id: "latin", label: "Latin" },
  { id: "tech-house", label: "Tech House" },
  { id: "melodic-house", label: "Melodic House" },
  { id: "country", label: "Country" },
  { id: "bollywood", label: "Bollywood" },
];

export const MUSIC_PREFS_MIN_SELECTION = 3;

let _deps = null;
let _inited = false;
let _selected = new Set();
let _gridMounted = false;

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

/** Settings — reopen the genre picker anytime after signup. */
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

function serializeMusicPreferences(labels) {
  return (labels || [])
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .join(",");
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

export function buildMusicPreferencesGenreGridHtml() {
  return MUSIC_PREFERENCE_GENRES.map((g) => `
    <button
      type="button"
      class="musicPrefsGenre"
      data-music-pref="${escapeAttr(g.id)}"
      aria-pressed="false"
    >
      <span class="musicPrefsGenreLabel">${escapeHtml(g.label)}</span>
      <span class="musicPrefsGenreCheck" aria-hidden="true">
        <svg viewBox="0 0 12 10" width="10" height="8" fill="none">
          <path d="M1 5.2 4.2 8.4 11 1.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
    </button>`).join("");
}

function ensureMusicPrefsGridMounted() {
  if (_gridMounted) return;
  const mount = qs("#musicPrefsGrid");
  if (!mount) return;
  mount.innerHTML = buildMusicPreferencesGenreGridHtml();
  _gridMounted = true;
}

function paintMusicPrefsSelection() {
  ensureMusicPrefsGridMounted();
  const root = qs("[data-music-prefs-root]");
  if (!root) return;
  root.querySelectorAll("[data-music-pref]").forEach((btn) => {
    const id = String(btn.getAttribute("data-music-pref") || "").trim();
    const on = _selected.has(id);
    btn.classList.toggle("is-selected", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
  const countEl = qs("#musicPrefsCount");
  const continueBtn = qs("#btnMusicPrefsContinue");
  const count = _selected.size;
  const ready = count >= MUSIC_PREFS_MIN_SELECTION;
  if (countEl) countEl.textContent = String(count);
  if (continueBtn) continueBtn.disabled = !ready;
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
  ensureMusicPrefsGridMounted();
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
  ensureMusicPrefsGridMounted();
  _selected.clear();
  const existing = typeof _deps?.getExistingLabels === "function" ? _deps.getExistingLabels() : [];
  for (const label of existing || []) {
    const id = musicPrefIdForLabel(label);
    if (id) _selected.add(id);
  }
  paintMusicPrefsSelection();
  const panel = qs('[data-route="music-preferences"]');
  if (panel) panel.style.display = "flex";
}
