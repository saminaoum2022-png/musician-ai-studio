/**
 * Fetch Suno cover art and apply Nabad brand grade (teal/violet, vignette, sharpen).
 */
const sharp = require("sharp");
const { normalizeCoverPortraitBuffer, COVER_PORTRAIT_W, COVER_PORTRAIT_H } = require("./cover-portrait-normalize");

function sanitizeCoverImageUrl(url) {
  const u = String(url || "").trim();
  if (!/^https:\/\//i.test(u)) return "";
  if (/localhost|127\.0\.0\.1|0\.0\.0\.0|169\.254\.|10\.\d+\.|192\.168\./i.test(u)) return "";
  return u.slice(0, 800);
}

async function fetchImageBuffer(url) {
  const safe = sanitizeCoverImageUrl(url);
  if (!safe) throw new Error("Invalid cover image URL.");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 18000);
  try {
    const r = await fetch(safe, {
      signal: ctrl.signal,
      headers: { Accept: "image/*" },
    });
    if (!r.ok) throw new Error(`Cover fetch failed (${r.status})`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length || buf.length < 256) throw new Error("Cover image is empty.");
    if (buf.length > 6 * 1024 * 1024) throw new Error("Cover image is too large.");
    return buf;
  } finally {
    clearTimeout(timer);
  }
}

function brandOverlaySvg() {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${COVER_PORTRAIT_W}" height="${COVER_PORTRAIT_H}">
      <defs>
        <linearGradient id="b" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="rgb(35,213,171)" stop-opacity="0.11"/>
          <stop offset="100%" stop-color="rgb(124,92,255)" stop-opacity="0.13"/>
        </linearGradient>
        <radialGradient id="v" cx="50%" cy="42%" r="68%">
          <stop offset="55%" stop-color="black" stop-opacity="0"/>
          <stop offset="100%" stop-color="rgb(5,7,13)" stop-opacity="0.52"/>
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#b)"/>
      <rect width="100%" height="100%" fill="url(#v)"/>
    </svg>`,
  );
}

/** @returns {Promise<Buffer>} JPEG buffer at 720×1280 */
async function gradeSunoCoverBuffer(inputBuf) {
  const { buf: portraitBuf } = await normalizeCoverPortraitBuffer(inputBuf);
  return sharp(portraitBuf)
    .modulate({ brightness: 1.04, saturation: 1.1 })
    .sharpen({ sigma: 0.65, m1: 1.0, m2: 0.45 })
    .composite([{ input: brandOverlaySvg(), blend: "overlay" }])
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
}

async function processSunoCoverFromUrl(imageUrl) {
  const raw = await fetchImageBuffer(imageUrl);
  const graded = await gradeSunoCoverBuffer(raw);
  return {
    buf: graded,
    mime: "image/jpeg",
    width: COVER_PORTRAIT_W,
    height: COVER_PORTRAIT_H,
  };
}

module.exports = {
  sanitizeCoverImageUrl,
  processSunoCoverFromUrl,
};
