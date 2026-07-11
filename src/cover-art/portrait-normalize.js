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
    const sw = Math.round(ih * TARGET_AR);
    return { sx: Math.round((iw - sw) / 2), sy: 0, sw, sh: ih };
  }
  const sh = Math.round(iw / TARGET_AR);
  const sy = ih > iw * 1.08 ? 0 : Math.round((ih - sh) / 2);
  return { sx: 0, sy, sw: iw, sh };
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
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, COVER_PORTRAIT_W, COVER_PORTRAIT_H);
  try {
    const webp = canvas.toDataURL("image/webp", 0.82);
    if (webp.startsWith("data:image/webp")) return webp;
  } catch {}
  return canvas.toDataURL("image/jpeg", 0.82);
}
