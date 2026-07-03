/** App Store / marketing screenshots — swap real @handles and display names for demo labels. */

const STORAGE_KEY = "nabad.screenshot.v1";

const DEMO_HANDLES = [
  "nabad_creator",
  "studio_artist",
  "musicmaker",
  "alexa_beats",
  "jam_session",
];

const DEMO_DISPLAY_NAMES = [
  "Nabad Creator",
  "Studio Artist",
  "Music Maker",
  "Alexa",
  "Jam Session",
];

let enabled = false;

function hashIndex(input, len) {
  const s = String(input || "").toLowerCase();
  if (!len) return 0;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % len;
}

export function isScreenshotMode() {
  return enabled;
}

export function initScreenshotMode() {
  try {
    const params = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
    if (params.get("screenshot") === "1") localStorage.setItem(STORAGE_KEY, "1");
    if (params.get("screenshot") === "0") localStorage.removeItem(STORAGE_KEY);
    const metaOn =
      typeof document !== "undefined" &&
      document.querySelector('meta[name="nabad-screenshot-mode"]')?.getAttribute("content") === "1";
    if (metaOn) localStorage.setItem(STORAGE_KEY, "1");
    enabled = localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    enabled = false;
  }

  if (!enabled) return false;

  try {
    document.documentElement.classList.add("screenshot-mode");
  } catch {}

  try {
    const hide = (id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = "none";
    };
    hide("footerBuild");
    hide("envBadge");
  } catch {}

  return true;
}

export function screenshotHandle(raw) {
  const h = String(raw || "").trim().replace(/^@+/, "");
  if (!enabled || !h || h === "guest") return h;
  return DEMO_HANDLES[hashIndex(h, DEMO_HANDLES.length)];
}

export function screenshotDisplayName(raw) {
  const name = String(raw || "").trim();
  if (!enabled || !name) return name;
  return DEMO_DISPLAY_NAMES[hashIndex(name, DEMO_DISPLAY_NAMES.length)];
}

export function applyScreenshotModeFromDeepLink(rawUrl) {
  const url = String(rawUrl || "").trim();
  if (!url) return false;
  let navigated = false;
  try {
    if (/[?&]screenshot=1(?:&|$|#)/.test(url) || url.includes("screenshot=1")) {
      localStorage.setItem(STORAGE_KEY, "1");
      initScreenshotMode();
    }
    const hashStart = url.indexOf("#/");
    if (hashStart >= 0) {
      const fragment = url.slice(hashStart + 1);
      if (typeof location !== "undefined" && fragment) {
        location.hash = fragment;
        navigated = true;
      }
    }
  } catch {}
  return navigated;
}

export function screenshotSanitizeCopy(text) {
  const raw = String(text || "");
  if (!enabled || !raw) return raw;
  return raw.replace(/@([a-z0-9_][a-z0-9_.]*)/gi, (_, handle) => `@${screenshotHandle(handle)}`);
}

export function screenshotProf(prof) {
  if (!enabled || !prof) return prof;
  const next = { ...prof };
  if (prof.username != null) next.username = screenshotHandle(prof.username);
  if (prof.displayName != null) next.displayName = screenshotDisplayName(prof.displayName);
  if (prof.display_name != null) next.display_name = screenshotDisplayName(prof.display_name);
  return next;
}
