/**
 * App appearance: system / light / dark. Persists in localStorage.
 * Apply early from index.html inline script to avoid flash.
 */

export const THEME_STORAGE_KEY = "nabadai_theme_v1";

/** @typedef {"system" | "light" | "dark"} ThemePreference */
/** @typedef {"light" | "dark"} ResolvedTheme */

const THEME_COLORS = {
  dark: { bg: "#05070d", text: "#eef4ff", scheme: "dark" },
  light: { bg: "#ecf0f7", text: "#0f1728", scheme: "light" },
};

/** @returns {ThemePreference} */
export function getThemePreference() {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {}
  return "system";
}

/** @param {ThemePreference} pref */
export function setThemePreference(pref) {
  const next = pref === "light" || pref === "dark" ? pref : "system";
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {}
  applyTheme(resolveTheme(next));
  syncThemePickerUi(next);
}

/** @param {ThemePreference} [pref] */
export function resolveTheme(pref = getThemePreference()) {
  if (pref === "light") return "light";
  if (pref === "dark") return "dark";
  try {
    if (window.matchMedia("(prefers-color-scheme: light)").matches) return "light";
  } catch {}
  return "dark";
}

/** @param {ResolvedTheme} resolved */
export function applyTheme(resolved) {
  const theme = resolved === "light" ? "light" : "dark";
  const colors = THEME_COLORS[theme];
  const html = document.documentElement;
  try {
    html.setAttribute("data-theme", theme);
    html.style.background = colors.bg;
    html.style.colorScheme = colors.scheme;
  } catch {}
  try {
    document.body?.style?.setProperty?.("background-color", colors.bg);
  } catch {}
  try {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", colors.bg);
  } catch {}
  try {
    const appleBar = document.querySelector(
      'meta[name="apple-mobile-web-app-status-bar-style"]'
    );
    if (appleBar) {
      appleBar.setAttribute(
        "content",
        theme === "light" ? "default" : "black-translucent"
      );
    }
  } catch {}
  try {
    const critical = document.getElementById("themeCritical");
    if (critical) {
      critical.textContent =
        `html,body{background-color:${colors.bg};color:${colors.text};margin:0}` +
        `html{color-scheme:${colors.scheme}}`;
    }
  } catch {}
}

/** Inline boot — same logic without module load. */
export function applyThemeBootInline() {
  const pref = getThemePreference();
  applyTheme(resolveTheme(pref));
}

function syncThemePickerUi(pref = getThemePreference()) {
  const root = document.getElementById("settingsThemePicker");
  if (!root) return;
  root.querySelectorAll("[data-theme-pref]").forEach((btn) => {
    const active = btn.getAttribute("data-theme-pref") === pref;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

let _systemMq = null;

export function initTheme() {
  applyTheme(resolveTheme());
  syncThemePickerUi();

  try {
    _systemMq = window.matchMedia("(prefers-color-scheme: light)");
    const onSystemChange = () => {
      if (getThemePreference() === "system") applyTheme(resolveTheme("system"));
    };
    if (_systemMq.addEventListener) _systemMq.addEventListener("change", onSystemChange);
    else if (_systemMq.addListener) _systemMq.addListener(onSystemChange);
  } catch {}

  const picker = document.getElementById("settingsThemePicker");
  if (picker && !picker.dataset.wired) {
    picker.dataset.wired = "1";
    picker.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-theme-pref]");
      if (!btn) return;
      const pref = btn.getAttribute("data-theme-pref");
      if (pref === "light" || pref === "dark" || pref === "system") {
        setThemePreference(pref);
      }
    });
  }
}
