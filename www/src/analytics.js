/**
 * Product analytics — Vercel Web Analytics custom events + admin funnel store.
 * Event names use nabad_{category}_{action} for the admin Web funnel tab.
 */

const ALLOWED = new Set([
  "nabad_cta_click",
  "nabad_app_store_click",
  "nabad_blog_cta_click",
  "nabad_signup_complete",
  "nabad_signin_complete",
  "nabad_coach_welcome_open",
  "nabad_song_plan_start",
  "nabad_song_plan_complete",
  "nabad_first_generate",
  "nabad_route_view",
  "nabad_pro_view",
  "nabad_pro_trial_start",
  "nabad_discover_publish",
]);

const MAX_DATA_KEYS = 8;
const MAX_STR = 120;

function sanitizeData(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw)) {
    if (Object.keys(out).length >= MAX_DATA_KEYS) break;
    const key = String(k || "").trim().slice(0, 64);
    if (!key) continue;
    if (typeof v === "string") out[key] = v.slice(0, MAX_STR);
    else if (typeof v === "number" && Number.isFinite(v)) out[key] = v;
    else if (typeof v === "boolean") out[key] = v;
  }
  return out;
}

function pagePath() {
  try {
    const p = String(location.pathname || "/");
    const h = String(location.hash || "").split("?")[0];
    return (p + h).slice(0, 240);
  } catch {
    return "";
  }
}

function sourceLabel() {
  try {
    const cap = globalThis.Capacitor;
    if (cap?.isNativePlatform?.()) return "native";
  } catch {}
  return "web";
}

function sendToAdmin(name, data) {
  try {
    const payload = JSON.stringify({
      name,
      data,
      page: pagePath(),
      source: sourceLabel(),
    });
    const blob = new Blob([payload], { type: "application/json" });
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon("/api/analytics/event", blob);
      return;
    }
    fetch("/api/analytics/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
      credentials: "omit",
    }).catch(() => null);
  } catch {}
}

/**
 * @param {string} name
 * @param {Record<string, string|number|boolean>} [data]
 */
export function trackNabad(name, data = {}) {
  const eventName = String(name || "").trim();
  if (!ALLOWED.has(eventName)) return;
  const clean = sanitizeData(data);
  try {
    if (typeof window !== "undefined" && typeof window.va === "function") {
      window.va("event", { name: eventName, data: clean });
    }
  } catch {}
  sendToAdmin(eventName, clean);
}

if (typeof window !== "undefined") {
  window.trackNabad = trackNabad;
}
