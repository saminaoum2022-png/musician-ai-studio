/**
 * Default cover when the user did not describe artwork: random gradient + centered title.
 * Player portrait: title in upper third. Square thumb: title centered.
 */
import { COVER_PORTRAIT_W, COVER_PORTRAIT_H } from "./portrait-normalize.js";
import { drawNabadColorWash } from "./nabad-color-wash.js";
import { pickCoverStudioGradient } from "./cover-gradient-presets.js";

export const TITLE_GRADIENT_PLAYER_Y = 0.36;
export const TITLE_GRADIENT_THUMB_Y = 0.5;

const W = COVER_PORTRAIT_W;
const H = COVER_PORTRAIT_H;

function hasArabic(text) {
  return /[؀-ۿݐ-ݿࢠ-ࣿ]/.test(String(text || ""));
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function ensureFontsReady() {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  try {
    await Promise.all([
      document.fonts.load('700 64px "csKufi"'),
      document.fonts.load('900 64px "csNabad"'),
    ]);
  } catch {
    /* fall back to system fonts */
  }
}

function canvasFont(title, px) {
  const arabic = hasArabic(title);
  if (arabic) {
    return `700 ${Math.round(px)}px "csKufi", "SF Arabic", "Geeza Pro", sans-serif`;
  }
  return `900 ${Math.round(px)}px "csNabad", "SF Pro Display", -apple-system, sans-serif`;
}

function wrapLines(ctx, text, maxWidth) {
  const raw = String(text || "").replace(/\s+/g, " ").trim() || "Untitled";
  const words = raw.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const tryLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(tryLine).width <= maxWidth || !line) {
      line = tryLine;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : ["Untitled"];
}

function drawSpeckles(ctx, w, h, rng) {
  const n = 60 + Math.floor(rng() * 50);
  for (let i = 0; i < n; i += 1) {
    const x = rng() * w;
    const y = rng() * h;
    const a = 0.04 + rng() * 0.12;
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.fillRect(x, y, 1 + rng() * 1.5, 1 + rng() * 1.5);
  }
}

function drawBackground(ctx, w, h, rng) {
  const [c1, c2] = pickCoverStudioGradient(rng);
  const grad = ctx.createLinearGradient(w * 0.2, 0, w * 0.8, h);
  grad.addColorStop(0, c1);
  grad.addColorStop(1, c2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  drawSpeckles(ctx, w, h, rng);
  drawNabadColorWash(ctx, w, h, { strength: 1.05 });
}

function drawTitleBlock(ctx, title, w, h, titleY) {
  const maxTextW = w * 0.86;
  let fontPx = w * 0.14;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.direction = hasArabic(title) ? "rtl" : "ltr";
  ctx.fillStyle = "#ffffff";

  let lines = [];
  for (let pass = 0; pass < 8; pass += 1) {
    ctx.font = canvasFont(title, fontPx);
    lines = wrapLines(ctx, title, maxTextW);
    const lineH = fontPx * 1.14;
    const blockH = lineH * lines.length;
    if (blockH <= h * 0.32 && lines.every((ln) => ctx.measureText(ln).width <= maxTextW)) break;
    fontPx *= 0.88;
  }

  ctx.font = canvasFont(title, fontPx);
  const lineH = fontPx * 1.14;
  const blockH = lineH * lines.length;
  const cy = h * titleY;
  const startY = cy - blockH / 2 + lineH / 2;

  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = fontPx * 0.08;
  ctx.shadowOffsetY = fontPx * 0.04;
  lines.forEach((ln, i) => {
    ctx.fillText(ln, w / 2, startY + i * lineH);
  });
  ctx.shadowColor = "transparent";
}

function encodeCanvas(canvas) {
  try {
    const webp = canvas.toDataURL("image/webp", 0.84);
    if (webp.startsWith("data:image/webp")) return webp;
  } catch {}
  return canvas.toDataURL("image/jpeg", 0.88);
}

function resolveSeed(seed) {
  return Number.isFinite(Number(seed)) && Number(seed) > 0
    ? Math.floor(Number(seed)) % 2147483646
    : Math.floor(Math.random() * 2147483645) + 1;
}

/**
 * Default thumbFrame.offsetY so a square crop centers on title at `titleY` (Cover Studio 1080×1920 maths).
 */
export function defaultThumbOffsetYForTitleY(titleY = TITLE_GRADIENT_PLAYER_Y, scale = 1) {
  const logicalW = 1080;
  const logicalH = 1920;
  const sc = Math.max(1, Math.min(2.5, Number(scale) || 1));
  const side = logicalW / sc;
  const def = (logicalH - side) / 2;
  const syTarget = Math.max(0, Math.min(logicalH - side, titleY * logicalH - side / 2));
  if (syTarget <= def) {
    const travelUp = Math.max(1, def);
    return Math.max(-1, Math.min(0, (syTarget - def) / travelUp));
  }
  const travelDown = Math.max(1, logicalH - side - def);
  return Math.max(0, Math.min(1, (syTarget - def) / travelDown));
}

function renderTitleGradient({ title, seed, width, height, titleY }) {
  const seedNum = resolveSeed(seed);
  const rng = mulberry32(seedNum);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create cover canvas");
  drawBackground(ctx, width, height, rng);
  drawTitleBlock(ctx, title, width, height, titleY);
  return { canvas, seedNum };
}

/**
 * @param {{ title?: string, seed?: number }} opts
 * @returns {Promise<string>} data URL 720×1280
 */
export async function generateTitleGradientCoverDataUrl({ title = "Untitled", seed } = {}) {
  await ensureFontsReady();
  const { canvas } = renderTitleGradient({
    title,
    seed,
    width: W,
    height: H,
    titleY: TITLE_GRADIENT_PLAYER_Y,
  });
  return encodeCanvas(canvas);
}

/**
 * Square library / feed thumb — title centered (not center-crop of portrait).
 * @param {{ title?: string, seed?: number, size?: number }} opts
 */
export async function generateTitleGradientThumbDataUrl({ title = "Untitled", seed, size = 512 } = {}) {
  await ensureFontsReady();
  const side = Math.max(256, Math.round(Number(size) || 512));
  const { canvas } = renderTitleGradient({
    title,
    seed,
    width: side,
    height: side,
    titleY: TITLE_GRADIENT_THUMB_Y,
  });
  return encodeCanvas(canvas);
}
