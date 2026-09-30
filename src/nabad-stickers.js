/**
 * Nabad Stickers — Pack 1 "Studio Pulse" (SVG glyphs, no emoji).
 * Hidden until launch — staging uses baked `nabadGoldUi` + admin (same as Gold cosmetics).
 */

import { NABAD_STICKERS_PUBLIC_SHIPPED } from "./feature-flags.js";

/** @typedef {"free"|"gold"} NabadStickerTier */

/**
 * Stable ids — never rename after ship.
 * @type {ReadonlyArray<{ id: string, label: string, tier: NabadStickerTier, anim?: boolean, wave?: boolean, inner: string }>}
 */
/** v1 core strip — 6 stickers; ids are stable once messages reference them. */
export const NABAD_STICKERS_STUDIO_PULSE = [
  {
    id: "note",
    label: "Music note",
    tier: "free",
    inner: '<path fill="#7c5cff" d="M14 4v12.5a3.5 3.5 0 1 1-2-3.2V6h8V4H14z"/>',
  },
  { id: "wave", label: "Sound wave", tier: "free", anim: true, wave: true, inner: "" },
  {
    id: "mic",
    label: "Mic",
    tier: "free",
    inner:
      '<rect x="9" y="3" width="6" height="11" rx="3" fill="#fff"/><path d="M6 12a6 6 0 0 0 12 0" stroke="#23d5ab" stroke-width="2" fill="none"/>',
  },
  {
    id: "heart",
    label: "Heart",
    tier: "free",
    anim: true,
    inner: '<path fill="#ff6b9d" d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.5 4.5 4.5 0 0 1 8 2.5c0 5.8-8 11-8 11z"/>',
  },
  {
    id: "headphones",
    label: "Headphones",
    tier: "free",
    inner:
      '<path d="M4 14v-2a8 8 0 0 1 16 0v2" stroke="#7c5cff" stroke-width="2" fill="none"/><rect x="2" y="14" width="5" height="7" rx="2" fill="#23d5ab"/><rect x="17" y="14" width="5" height="7" rx="2" fill="#23d5ab"/>',
  },
  {
    id: "trophy",
    label: "Champion",
    tier: "free",
    inner:
      '<path fill="#e2c178" d="M6 4h12v3a6 6 0 0 1-12 0V4zM8 18h8v2H8z"/><path fill="#c9a04a" d="M10 10h4v8h-4z"/>',
  },
];

const STICKER_BY_ID = new Map(NABAD_STICKERS_STUDIO_PULSE.map((s) => [s.id, s]));

let bridge = {};

export function configureNabadStickers(b) {
  bridge = b || {};
}

function clientGoldUiBaked() {
  try {
    return Boolean(window.__NABAD_CLIENT_ENV__?.nabadGoldUi);
  } catch {
    return false;
  }
}

/** Admin + staging bake until public launch; then everyone sees the picker. */
export function stickersUiEnabled() {
  try {
    if (NABAD_STICKERS_PUBLIC_SHIPPED) return true;
    const admin = typeof bridge.isAdmin === "function" && bridge.isAdmin();
    return Boolean(clientGoldUiBaked() && admin);
  } catch {
    return false;
  }
}

export function nabadStickerById(id) {
  return STICKER_BY_ID.get(String(id || "").trim()) || null;
}

export function nabadStickerLabel(id) {
  return nabadStickerById(id)?.label || "Sticker";
}

/** Whether the viewer may send this sticker (entitlement). */
export function canSendNabadSticker(id) {
  if (!stickersUiEnabled()) return false;
  const s = nabadStickerById(id);
  if (!s) return false;
  if (s.tier !== "gold") return true;
  const admin = typeof bridge.isAdmin === "function" && bridge.isAdmin();
  if (NABAD_STICKERS_PUBLIC_SHIPPED) {
    return Boolean(admin || (typeof bridge.isGold === "function" && bridge.isGold()));
  }
  return Boolean(clientGoldUiBaked() && admin);
}

export function buildNabadStickerDmBody(id) {
  const sid = String(id || "").trim();
  if (!nabadStickerById(sid)) return "";
  return JSON.stringify({ nabad_dm: "sticker", id: sid });
}

/**
 * @returns {{ type: "sticker", stickerId: string } | null}
 */
export function parseNabadStickerDmBody(raw) {
  const body = String(raw || "").replace(/^\uFEFF/, "").trim();
  if (!body) return null;
  const token = body.match(/^\[nabad-sticker:([a-z0-9_-]+)\]$/i);
  if (token) {
    const id = String(token[1] || "").trim();
    if (id) return { type: "sticker", stickerId: id };
    return null;
  }
  if (!body.startsWith("{")) return null;
  try {
    const data = JSON.parse(body);
    if (data?.nabad_dm !== "sticker") return null;
    const id = String(data.id || "").trim();
    if (!id) return null;
    return { type: "sticker", stickerId: id };
  } catch {
    return null;
  }
}

function waveBarsHtml() {
  return '<span class="nabadStickerWave" aria-hidden="true"><span></span><span></span><span></span><span></span></span>';
}

function animClassForSticker(s, { reducedMotion }) {
  if (reducedMotion || !s?.anim) return "";
  if (s.wave) return " nabadStickerGlyph--wave";
  if (s.id === "vinyl") return " nabadStickerGlyph--vinyl";
  if (s.id === "live") return " nabadStickerGlyph--pulse";
  if (s.id === "heart") return " nabadStickerGlyph--pulse";
  if (s.id === "ember") return " nabadStickerGlyph--ember";
  if (s.id === "spark") return " nabadStickerGlyph--spark";
  if (s.id === "fan") return " nabadStickerGlyph--pulse";
  return "";
}

function prefersReducedMotion() {
  try {
    return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  } catch {
    return false;
  }
}

/**
 * Inline SVG (or wave bars) for picker, bubbles, etc.
 * @param {string} id
 * @param {{ size?: number, className?: string, animate?: boolean }} [opts]
 */
export function nabadStickerMarkup(id, opts = {}) {
  const s = nabadStickerById(id);
  if (!s) return "";
  const size = Number(opts.size) > 0 ? Number(opts.size) : 48;
  const cls = String(opts.className || "nabadStickerGlyph").trim();
  const reduced = !opts.animate || prefersReducedMotion();
  const animCls = animClassForSticker(s, { reducedMotion: reduced });
  if (s.wave) {
    return `<span class="${cls} nabadStickerWaveHost${animCls}" style="width:${size}px;height:${size}px">${waveBarsHtml()}</span>`;
  }
  return `<svg class="${cls}${animCls}" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false">${s.inner}</svg>`;
}

export function nabadStickerPickerCellHtml(s, { locked = false } = {}) {
  const lockCls = locked ? " nabadStickerPickerCell--locked" : "";
  const tierCls = s.tier === "gold" ? " nabadStickerPickerCell--gold" : "";
  const animBadge = s.anim ? '<span class="nabadStickerPickerBadge">Anim</span>' : "";
  return `<button type="button" class="nabadStickerPickerCell${lockCls}${tierCls}" data-nabad-sticker-id="${s.id}" aria-label="${s.label}${locked ? " (locked)" : ""}"${locked ? " disabled" : ""}>${nabadStickerMarkup(s.id, { size: 62, animate: true })}${animBadge}</button>`;
}

export function nabadStickerPickerGridHtml() {
  return NABAD_STICKERS_STUDIO_PULSE.map((s) => {
    const locked = !canSendNabadSticker(s.id);
    return nabadStickerPickerCellHtml(s, { locked });
  }).join("");
}

export function nabadStickerBubbleInnerHtml(stickerId) {
  const id = String(stickerId || "").trim();
  const known = nabadStickerById(id);
  const label = known ? known.label : "Sticker";
  const glyph = nabadStickerMarkup(id, {
    size: 72,
    className: "nabadStickerGlyph nabadStickerGlyph--bubble",
    animate: true,
  });
  const inner = glyph || `<span class="nabadStickerBubbleFallback" aria-hidden="true">♪</span>`;
  return `<div class="nabadStickerBubble${known ? "" : " nabadStickerBubble--legacy"}" role="img" aria-label="${label}">${inner}</div>`;
}
