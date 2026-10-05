/**
 * Nabad teal/violet wash — same look as `.coverArtLiveGlow` on the player, baked into cover pixels.
 */

/** @param {CanvasRenderingContext2D} ctx @param {number} w @param {number} h */
export function drawNabadColorWash(ctx, w, h, { strength = 1 } = {}) {
  const s = Math.max(0.35, Math.min(1.25, Number(strength) || 1));
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.38 * s;

  const teal = ctx.createRadialGradient(w * 0.5, h * 0.62, 0, w * 0.5, h * 0.62, w * 0.72);
  teal.addColorStop(0, "rgba(35, 213, 171, 0.55)");
  teal.addColorStop(0.68, "transparent");
  ctx.fillStyle = teal;
  ctx.fillRect(-w * 0.08, -h * 0.08, w * 1.16, h * 1.16);

  const violet = ctx.createRadialGradient(w * 0.4, h * 0.38, 0, w * 0.4, h * 0.38, w * 0.58);
  violet.addColorStop(0, "rgba(124, 92, 255, 0.48)");
  violet.addColorStop(0.72, "transparent");
  ctx.fillStyle = violet;
  ctx.fillRect(-w * 0.08, -h * 0.08, w * 1.16, h * 1.16);

  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "soft-light";
  ctx.globalAlpha = 0.14 * s;
  const grade = ctx.createLinearGradient(w * 0.15, 0, w * 0.85, h);
  grade.addColorStop(0, "#23d5ab");
  grade.addColorStop(0.55, "rgba(35, 213, 171, 0.15)");
  grade.addColorStop(1, "#7c5cff");
  ctx.fillStyle = grade;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode cover image"));
    img.src = src;
  });
}

/** Bake wash onto an existing cover data URL (Flux / photo exports). */
export async function applyNabadColorWashToDataUrl(dataUrl, opts = {}) {
  const src = String(dataUrl || "").trim();
  if (!src.startsWith("data:image/")) return src;
  try {
    const img = await loadImage(src);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return src;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return src;
    ctx.drawImage(img, 0, 0, w, h);
    drawNabadColorWash(ctx, w, h, opts);
    try {
      const webp = canvas.toDataURL("image/webp", 0.84);
      if (webp.startsWith("data:image/webp")) return webp;
    } catch {}
    return canvas.toDataURL("image/jpeg", 0.88);
  } catch {
    return src;
  }
}
