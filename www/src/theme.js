/**
 * App appearance — dark, light, or match system.
 */

export const THEME_STORAGE_KEY = "nabadai_theme_v1";
export const THEME_PREFS = ["dark", "light", "system"];

const PALETTE = {
  dark: { bg: "#05070d", text: "#eef4ff", scheme: "dark", statusBar: "black-translucent" },
  light: { bg: "#F6F7FB", text: "#15171C", scheme: "light", statusBar: "default" },
};

let systemMq = null;
let systemListener = null;

export function normalizeThemePreference(raw) {
  const v = String(raw || "").trim().toLowerCase();
  return THEME_PREFS.includes(v) ? v : "dark";
}

export function getThemePreference() {
  try {
    return normalizeThemePreference(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "dark";
  }
}

export function getSystemTheme() {
  try {
    return window.matchMedia?.("(prefers-color-scheme: light)")?.matches ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function resolveEffectiveTheme(pref = getThemePreference()) {
  const p = normalizeThemePreference(pref);
  return p === "system" ? getSystemTheme() : p;
}

function themePreferenceSub(pref) {
  if (pref === "light") return "Light mode";
  if (pref === "system") return "Matches your device appearance";
  return "Dark mode";
}

export function applyTheme(effective = resolveEffectiveTheme()) {
  const theme = effective === "light" ? "light" : "dark";
  const pal = PALETTE[theme];
  const html = document.documentElement;
  try {
    html.setAttribute("data-theme", theme);
    html.style.background = pal.bg;
    html.style.colorScheme = pal.scheme;
  } catch {}
  try {
    document.body?.style?.setProperty?.("background-color", pal.bg);
  } catch {}
  try {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", pal.bg);
  } catch {}
  try {
    const appleBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (appleBar) appleBar.setAttribute("content", pal.statusBar);
  } catch {}
  try {
    const critical = document.getElementById("themeCritical");
    if (critical) {
      critical.textContent =
        `html,body{background-color:${pal.bg};color:${pal.text};margin:0}` +
        `html{color-scheme:${pal.scheme}}` +
        `body.booting{background:${pal.bg};overflow:hidden}` +
        `body.booting #bootSplash{background:${pal.bg}}`;
    }
  } catch {}
}

export function setThemePreference(pref) {
  const p = normalizeThemePreference(pref);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, p);
  } catch {}
  applyTheme(resolveEffectiveTheme(p));
  syncSettingsThemePicker(p);
}

function bindSystemThemeListener() {
  if (systemListener || typeof window.matchMedia !== "function") return;
  systemMq = window.matchMedia("(prefers-color-scheme: light)");
  systemListener = () => {
    if (getThemePreference() === "system") applyTheme();
  };
  try {
    if (systemMq.addEventListener) systemMq.addEventListener("change", systemListener);
    else if (systemMq.addListener) systemMq.addListener(systemListener);
  } catch {}
}

export function syncSettingsThemePicker(pref = getThemePreference()) {
  const p = normalizeThemePreference(pref);
  const root = document.getElementById("settingsThemePicker");
  const sub = document.getElementById("settingsThemeSub");
  if (root) {
    root.querySelectorAll("[data-theme-pref]").forEach((btn) => {
      const active = String(btn.getAttribute("data-theme-pref") || "") === p;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-checked", active ? "true" : "false");
    });
  }
  if (sub) sub.textContent = themePreferenceSub(p);
}

export function wireSettingsThemeOnce() {
  const root = document.getElementById("settingsThemePicker");
  if (!root || root.dataset.boundTheme === "1") return;
  root.dataset.boundTheme = "1";
  root.addEventListener("click", (ev) => {
    const btn = ev.target?.closest?.("[data-theme-pref]");
    if (!btn || !root.contains(btn)) return;
    ev.preventDefault();
    const pref = String(btn.getAttribute("data-theme-pref") || "").trim();
    if (!pref || pref === getThemePreference()) return;
    try {
      if (typeof haptic === "function") haptic("light");
    } catch {}
    setThemePreference(pref);
  });
}

export function initTheme() {
  applyTheme();
  bindSystemThemeListener();
  wireSettingsThemeOnce();
  syncSettingsThemePicker();
}
