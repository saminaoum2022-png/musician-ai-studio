/**
 * Gold member cosmetics — avatar ring + emblem (crown, mic, note, …) (Phase 1).
 * Pure experience: no AI cost. Hidden until launch — staging bake: nabadGoldUi + admin.
 *
 * Data: one nullable `profiles.gold_style` jsonb ({ ring, topper }). It is read and written in its
 * OWN error-tolerant requests (never in the shared profile select/upsert), so a missing column
 * can never break profile loading or saving for anyone. The owner's choice is also kept locally,
 * so it works on the device that set it even before the SQL has been run.
 */

import { NABAD_GOLD_PUBLIC_SHIPPED } from "./feature-flags.js";

/** Ring catalog. `id` is stored in the DB — never rename an id once shipped. */
export const GOLD_RINGS = [
  { id: "gold", label: "Gold", swatch: "linear-gradient(135deg,#ffe27a,#d99a1c)" },
  { id: "royal", label: "Royal", swatch: "linear-gradient(135deg,#b58cff,#5b3df5)" },
  { id: "rose", label: "Rose gold", swatch: "linear-gradient(135deg,#ffc9c0,#d97a86)" },
  { id: "aurora", label: "Aurora", swatch: "linear-gradient(135deg,#45f0c8,#7c5cff,#ff6fd8)" },
  { id: "neon", label: "Neon", swatch: "linear-gradient(135deg,#39f5ff,#2b7bff)" },
  { id: "ember", label: "Ember", swatch: "linear-gradient(135deg,#ffb347,#ff3d2e)" },
];

const RING_IDS = new Set(GOLD_RINGS.map((r) => r.id));

/** Accent colour of each ring — emblems are tinted to match. */
const RING_ACCENT = {
  gold: "#ffd45a",
  royal: "#c9a8ff",
  rose: "#ffb3ba",
  aurora: "#7ff3d8",
  neon: "#7df7ff",
  ember: "#ffb347",
};
export function goldRingAccent(ringId) {
  return RING_ACCENT[String(ringId || "")] || RING_ACCENT.gold;
}

/**
 * Emblems that sit on top of the ring. One visual identity: solid glyph, ring colour, slight tilt.
 * `id` is stored in the DB — never rename an id once shipped.
 */
const svg = (inner) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor" stroke="none">${inner}</svg>`;
export const GOLD_TOPPERS = [
  {
    id: "crown",
    label: "Crown",
    svg: svg('<path d="M3 8.5 7.2 12 12 5l4.8 7L21 8.5 19 18H5L3 8.5Z"/><rect x="5" y="19.2" width="14" height="2" rx="1"/>'),
  },
  {
    id: "mic",
    label: "Mic",
    svg: svg(
      '<rect x="8.6" y="2" width="6.8" height="12.4" rx="3.4"/><path d="M5.2 11.2a6.8 6.8 0 0 0 13.6 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="11" y="18" width="2" height="2.6" rx="1"/><rect x="7.6" y="20.2" width="8.8" height="2" rx="1"/>',
    ),
  },
  {
    id: "note",
    label: "Note",
    svg: svg(
      '<path d="M8.8 5.4 19.8 3v3.9l-11 2.4z"/><rect x="8.4" y="6" width="2.1" height="11.6"/><rect x="18.3" y="4" width="2.1" height="11.6"/><circle cx="7.3" cy="17.6" r="3.1"/><circle cx="17.2" cy="15.6" r="3.1"/>',
    ),
  },
  {
    id: "headphones",
    label: "Phones",
    svg: svg(
      '<path d="M4.2 15.5V12a7.8 7.8 0 0 1 15.6 0v3.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><rect x="2.6" y="13.2" width="5" height="8" rx="2.4"/><rect x="16.4" y="13.2" width="5" height="8" rx="2.4"/>',
    ),
  },
  {
    id: "vinyl",
    label: "Vinyl",
    svg: svg(
      '<path fill-rule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 7.6a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8Z"/><circle cx="12" cy="12" r="6.3" fill="none" stroke="rgba(0,0,0,.4)" stroke-width="1"/><circle cx="12" cy="12" r="8.4" fill="none" stroke="rgba(0,0,0,.28)" stroke-width=".8"/>',
    ),
  },
  {
    id: "wave",
    label: "Wave",
    svg: svg(
      '<rect x="2.2" y="9.5" width="2.6" height="5" rx="1.3"/><rect x="6.4" y="6" width="2.6" height="12" rx="1.3"/><rect x="10.7" y="2.6" width="2.6" height="18.8" rx="1.3"/><rect x="15" y="7.5" width="2.6" height="9" rx="1.3"/><rect x="19.2" y="10.5" width="2.6" height="3" rx="1.3"/>',
    ),
  },
  {
    id: "star",
    label: "Star",
    svg: svg(
      '<path d="M12 2.6l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.1l-5.6 2.9 1.1-6.3L2.9 9.3l6.3-.9L12 2.6Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>',
    ),
  },
];
const TOPPER_BY_ID = new Map(GOLD_TOPPERS.map((t) => [t.id, t]));
const LS_PREFIX = "nabadGoldStyle:";

let bridge = {};
export function configureGoldStyle(b) {
  bridge = b || {};
}

function clientGoldUiBaked() {
  try {
    return Boolean(window.__NABAD_CLIENT_ENV__?.nabadGoldUi);
  } catch {
    return false;
  }
}

/** Hidden mode: admin on a staging-baked build. After launch: everyone can SEE rings; only Gold can set them. */
export function goldUiEnabled() {
  try {
    const admin = typeof bridge.isAdmin === "function" && bridge.isAdmin();
    if (NABAD_GOLD_PUBLIC_SHIPPED) return true;
    return Boolean(clientGoldUiBaked() && admin);
  } catch {
    return false;
  }
}

/** Whether the current user may EDIT their Gold style (admin while hidden). */
export function goldCanEdit() {
  try {
    const admin = typeof bridge.isAdmin === "function" && bridge.isAdmin();
    if (NABAD_GOLD_PUBLIC_SHIPPED) return Boolean(admin || (typeof bridge.isGold === "function" && bridge.isGold()));
    return Boolean(clientGoldUiBaked() && admin);
  } catch {
    return false;
  }
}

/** Accepts anything, returns a safe `{ ring, topper }` or null. */
export function sanitizeGoldStyle(raw) {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== "object") return null;
  const ring = RING_IDS.has(String(v.ring || "")) ? String(v.ring) : "";
  // `crown: true` is the original (pre-emblem) format — still read, never written.
  const topper = TOPPER_BY_ID.has(String(v.topper || "")) ? String(v.topper) : v.crown === true ? "crown" : "";
  if (!ring && !topper) return null;
  return { ring, topper };
}

/* ── Local (per device, per account) ───────────────────────────────────────── */

export function readLocalGoldStyle(uid) {
  const id = String(uid || "").trim();
  if (!id) return null;
  try {
    return sanitizeGoldStyle(localStorage.getItem(LS_PREFIX + id));
  } catch {
    return null;
  }
}

export function writeLocalGoldStyle(uid, style) {
  const id = String(uid || "").trim();
  if (!id) return;
  try {
    const s = sanitizeGoldStyle(style);
    if (s) localStorage.setItem(LS_PREFIX + id, JSON.stringify(s));
    else localStorage.removeItem(LS_PREFIX + id);
  } catch {}
}

/* ── Cloud (tolerant: any failure = "no style", never an error) ───────────── */

const cloudCache = new Map(); // userId -> { style, at }
const CLOUD_TTL_MS = 5 * 60 * 1000;

export function invalidateGoldStyle(uid) {
  cloudCache.delete(String(uid || "").trim());
}

/** Fetch Gold styles for many users in one request. Missing column / offline / RLS → empty map. */
export async function fetchGoldStyles(userIds) {
  const out = new Map();
  const now = Date.now();
  const missing = [];
  for (const raw of userIds || []) {
    const uid = String(raw || "").trim();
    if (!uid || out.has(uid)) continue;
    const hit = cloudCache.get(uid);
    if (hit && now - hit.at < CLOUD_TTL_MS) out.set(uid, hit.style);
    else missing.push(uid);
  }
  if (!missing.length || typeof bridge.restFetch !== "function") return out;
  try {
    const inClause = missing.map((id) => encodeURIComponent(id)).join(",");
    const r = await bridge.restFetch(`profiles?user_id=in.(${inClause})&select=user_id,gold_style`);
    if (!r || !r.ok) {
      // Column not created yet (or any error): remember briefly so we don't spam the network.
      for (const uid of missing) cloudCache.set(uid, { style: null, at: now });
      return out;
    }
    const rows = await r.json().catch(() => []);
    const seen = new Set();
    for (const row of Array.isArray(rows) ? rows : []) {
      const uid = String(row?.user_id || "").trim();
      if (!uid) continue;
      seen.add(uid);
      const style = sanitizeGoldStyle(row?.gold_style);
      cloudCache.set(uid, { style, at: now });
      out.set(uid, style);
    }
    for (const uid of missing) {
      if (!seen.has(uid)) cloudCache.set(uid, { style: null, at: now });
    }
  } catch {
    for (const uid of missing) cloudCache.set(uid, { style: null, at: now });
  }
  return out;
}

/** Save the owner's style. Returns { ok, cloud } — `cloud:false` just means "this device only for now". */
export async function saveOwnGoldStyle(uid, style) {
  const id = String(uid || "").trim();
  const clean = sanitizeGoldStyle(style);
  if (!id) return { ok: false, cloud: false };
  writeLocalGoldStyle(id, clean);
  cloudCache.set(id, { style: clean, at: Date.now() });
  if (typeof bridge.restPatchOwnProfile !== "function") return { ok: true, cloud: false };
  try {
    const r = await bridge.restPatchOwnProfile(id, { gold_style: clean });
    return { ok: true, cloud: Boolean(r && r.ok) };
  } catch {
    return { ok: true, cloud: false };
  }
}

/* ── Rendering ─────────────────────────────────────────────────────────────── */

/** Paint (or clear) the ring + emblem on an avatar wrapper. Safe to call repeatedly. */
export function applyGoldToAvatarWrap(wrap, style) {
  if (!wrap) return;
  const s = goldUiEnabled() ? sanitizeGoldStyle(style) : null;
  let layer = wrap.querySelector(":scope > .goldRingLayer");
  if (!s) {
    if (layer) layer.remove();
    wrap.removeAttribute("data-gold-ring");
    wrap.classList.remove("hasGold", "hasGoldTopper");
    return;
  }
  if (!layer) {
    layer = document.createElement("span");
    layer.className = "goldRingLayer";
    layer.setAttribute("aria-hidden", "true");
    wrap.appendChild(layer);
  }
  wrap.classList.add("hasGold");
  wrap.classList.toggle("hasGoldTopper", Boolean(s.topper));
  if (s.ring) wrap.setAttribute("data-gold-ring", s.ring);
  else wrap.removeAttribute("data-gold-ring");
  if ((layer.dataset.topper || "") !== s.topper) {
    layer.dataset.topper = s.topper;
    const t = TOPPER_BY_ID.get(s.topper);
    layer.innerHTML = t ? `<span class="goldTopper" data-topper="${t.id}">${t.svg}</span>` : "";
  }
}
