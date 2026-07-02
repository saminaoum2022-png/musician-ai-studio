/** Splash-screen gradient N mark — transparent PNG, no background plate. */
const SPLASH_MARK_URL = "./assets/icons/splash-mark.png";

let _markPromise = null;

function loadSplashMark() {
  if (!_markPromise) {
    _markPromise = new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not load splash mark"));
      img.src = SPLASH_MARK_URL;
    });
  }
  return _markPromise;
}

function loadCoverImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode cover image"));
    img.src = dataUrl;
  });
}

/**
 * Bake the splash N mark into the bottom-right of a generated cover.
 * @param {string} dataUrl
 * @returns {Promise<string>}
 */
export async function stampCoverWithSplashMark(dataUrl) {
  const src = String(dataUrl || "").trim();
  if (!src.startsWith("data:image/")) return src;

  try {
    const [cover, mark] = await Promise.all([loadCoverImage(src), loadSplashMark()]);
    const w = cover.naturalWidth || cover.width;
    const h = cover.naturalHeight || cover.height;
    if (!w || !h) return src;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return src;

    ctx.drawImage(cover, 0, 0, w, h);

    const markMax = Math.round(Math.min(w, h) * 0.085);
    const markScale = markMax / Math.max(mark.naturalWidth || mark.width, 1);
    const markW = Math.round((mark.naturalWidth || mark.width) * markScale);
    const markH = Math.round((mark.naturalHeight || mark.height) * markScale);
    const pad = Math.round(Math.min(w, h) * 0.042);
    const x = w - markW - pad;
    const y = h - markH - pad;

    ctx.save();
    ctx.globalAlpha = 0.88;
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = Math.max(4, Math.round(markW * 0.08));
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = Math.max(1, Math.round(markW * 0.02));
    ctx.drawImage(mark, x, y, markW, markH);
    ctx.restore();

    const mime = src.startsWith("data:image/png") ? "image/png" : "image/jpeg";
    const quality = mime === "image/jpeg" ? 0.92 : undefined;
    return canvas.toDataURL(mime, quality);
  } catch (e) {
    try {
      console.warn("[cover-art] splash mark stamp skipped:", e?.message || e);
    } catch {}
    return src;
  }
}
