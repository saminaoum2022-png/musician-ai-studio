/**
 * Pollinations may return the wrong aspect (e.g. ~3:4 for a portrait request).
 * Top-biased cover-crop to true 9:16 — never non-uniform stretch.
 */
const sharp = require("sharp");

const TARGET_W = 720;
const TARGET_H = 1280;
const TARGET_AR = TARGET_W / TARGET_H;

function cropRectForPortrait916(w, h) {
  const iw = Number(w) || 0;
  const ih = Number(h) || 0;
  if (!iw || !ih) return { left: 0, top: 0, width: iw, height: ih };
  const srcAr = iw / ih;
  if (srcAr > TARGET_AR) {
    const cropW = Math.round(ih * TARGET_AR);
    return { left: Math.round((iw - cropW) / 2), top: 0, width: cropW, height: ih };
  }
  const cropH = Math.round(iw / TARGET_AR);
  const top = ih > iw * 1.08 ? 0 : Math.round((ih - cropH) / 2);
  return { left: 0, top, width: iw, height: cropH };
}

/** @returns {Promise<{ buf: Buffer, mime: string, width: number, height: number }>} */
async function normalizeCoverPortraitBuffer(inputBuf) {
  const src = Buffer.from(inputBuf || []);
  if (!src.length) {
    return { buf: src, mime: "image/jpeg", width: 0, height: 0 };
  }

  const img = sharp(src, { failOn: "none" });
  const meta = await img.metadata();
  const w = Number(meta.width) || 0;
  const h = Number(meta.height) || 0;
  if (!w || !h) {
    return { buf: src, mime: "image/jpeg", width: w, height: h };
  }

  const out = await img
    .resize(TARGET_W, TARGET_H, { fit: "cover", position: "north" })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();

  return { buf: out, mime: "image/jpeg", width: TARGET_W, height: TARGET_H };
}

module.exports = {
  normalizeCoverPortraitBuffer,
  cropRectForPortrait916,
  COVER_PORTRAIT_W: TARGET_W,
  COVER_PORTRAIT_H: TARGET_H,
};
