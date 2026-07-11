/** Shared 9:16 portrait crop — matches api/_lib/cover-portrait-normalize.js. */

export const COVER_PORTRAIT_W = 720;
export const COVER_PORTRAIT_H = 1280;
const TARGET_AR = COVER_PORTRAIT_W / COVER_PORTRAIT_H;

export function portrait916CropRect(w, h) {
  const iw = Number(w) || 0;
  const ih = Number(h) || 0;
  if (!iw || !ih) return { sx: 0, sy: 0, sw: iw, sh: ih };
  const srcAr = iw / ih;
  if (srcAr > TARGET_AR) {
    const sh = ih;
    const sw = Math.min(iw, Math.max(1, Math.floor(sh * TARGET_AR)));
    return { sx: Math.max(0, Math.floor((iw - sw) / 2)), sy: 0, sw, sh };
  }
  const sw = iw;
  const sh = Math.min(ih, Math.max(1, Math.floor(sw / TARGET_AR)));
  const sy = ih > iw * 1.08 ? 0 : Math.max(0, Math.floor((ih - sh) / 2));
  return { sx: 0, sy, sw, sh };
}

/** Draw source crop into dest using cover scaling — never non-uniform stretch. */
function drawCoverPortrait916(ctx, img, sx, sy, sw, sh) {
  const tw = COVER_PORTRAIT_W;
  const th = COVER_PORTRAIT_H;
  const scale = Math.max(tw / sw, th / sh);
  const dw = Math.round(sw * scale);
  const dh = Math.round(sh * scale);
  const dx = Math.round((tw - dw) / 2);
  const dy = 0;
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

/** Crop to 9:16 (never stretch) and resize to 720×1280. */
export async function normalizePortraitCoverDataUrl(dataUrl) {
  const src = String(dataUrl || "").trim();
  if (!src.startsWith("data:image/")) return src;
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Could not decode cover"));
    i.src = src;
  });
  const w = Number(img.width || 0);
  const h = Number(img.height || 0);
  if (!w || !h) return src;
  const { sx, sy, sw, sh } = portrait916CropRect(w, h);
  const canvas = document.createElement("canvas");
  canvas.width = COVER_PORTRAIT_W;
  canvas.height = COVER_PORTRAIT_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return src;
  drawCoverPortrait916(ctx, img, sx, sy, sw, sh);
  try {
    const webp = canvas.toDataURL("image/webp", 0.82);
    if (webp.startsWith("data:image/webp")) return webp;
  } catch {}
  return canvas.toDataURL("image/jpeg", 0.82);
}
