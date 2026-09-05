/**
 * Product funnel analytics — allowlisted events stored for admin dashboard.
 */

const ALLOWED_EVENTS = new Set([
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

function sanitizeEventData(raw) {
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

function normalizeEvent(body = {}) {
  const name = String(body.name || body.event || "").trim();
  if (!ALLOWED_EVENTS.has(name)) return null;
  const page = String(body.page || body.page_path || "").trim().slice(0, 240);
  const source = String(body.source || "web").trim().slice(0, 32) || "web";
  const data = sanitizeEventData(body.data && typeof body.data === "object" ? body.data : body);
  delete data.name;
  delete data.event;
  delete data.page;
  delete data.page_path;
  delete data.source;
  return { event_name: name, event_data: data, page_path: page || null, source };
}

module.exports = {
  ALLOWED_EVENTS,
  normalizeEvent,
  sanitizeEventData,
};
