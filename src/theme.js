/**
 * App appearance — dark theme only (no system/light toggle).
 */

export const THEME_STORAGE_KEY = "nabadai_theme_v1";

const DARK = { bg: "#05070d", text: "#eef4ff", scheme: "dark" };

export function applyTheme() {
  const html = document.documentElement;
  try {
    html.setAttribute("data-theme", "dark");
    html.style.background = DARK.bg;
    html.style.colorScheme = DARK.scheme;
  } catch {}
  try {
    document.body?.style?.setProperty?.("background-color", DARK.bg);
  } catch {}
  try {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", DARK.bg);
  } catch {}
  try {
    const appleBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (appleBar) appleBar.setAttribute("content", "black-translucent");
  } catch {}
  try {
    const critical = document.getElementById("themeCritical");
    if (critical) {
      critical.textContent =
        `html,body{background-color:${DARK.bg};color:${DARK.text};margin:0}` +
        `html{color-scheme:${DARK.scheme}}`;
    }
  } catch {}
}

export function initTheme() {
  try {
    localStorage.removeItem(THEME_STORAGE_KEY);
  } catch {}
  applyTheme();
}
