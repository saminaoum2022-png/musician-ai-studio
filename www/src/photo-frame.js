/**
 * Photo framing — a small full-screen sheet to position a profile photo inside the square that becomes the
 * profile header. Drag to move, pinch or use the slider to zoom. The result is baked into a single PNG at
 * a resolution sharp enough for the full-bleed cover header without being wasteful on tiny feed/chat avatars.
 * PNG (not JPEG) because JPEG's compression ripples in smooth areas like skin and backgrounds read as a
 * permanent wavy "still loading" shimmer once the photo is blown up to full-bleed cover size.
 * (There used to be a separate small/HD pair with an async "upgrade" swap; that added a failure mode where
 * older or HD-less photos got stuck showing the blurry small copy forever. One size, uploaded once, no swap.)
 */

const AVATAR_SIZE = 1080;
const MAX_ZOOM = 4;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load the photo"));
    img.src = src;
  });
}

function renderSquare(img, crop, size) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#0b0c12";
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(img, crop.x, crop.y, crop.size, crop.size, 0, 0, size, size);
  return canvas.toDataURL("image/png");
}

/**
 * @param {{ src: string, title?: string, doneLabel?: string, mode?: "cover" | "circle", guideLabel?: string }} opts
 * @returns {Promise<{ avatar: string } | null>} null when cancelled
 */
export function openPhotoFrame({
  src,
  title = "Frame your photo",
  doneLabel = "Done",
  mode = "cover",
  guideLabel,
} = {}) {
  return new Promise(async (resolve) => {
    let img;
    try {
      img = await loadImage(src);
    } catch {
      resolve(null);
      return;
    }
    const circle = mode === "circle";
    const guideText = guideLabel
      || (circle ? "Artist ring preview" : "Your name sits here");
    const root = document.createElement("div");
    root.className = "pfRoot";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.innerHTML = `
      <div class="pfTop">
        <button type="button" class="pfBtn pfBtn--ghost" data-pf="cancel">Cancel</button>
        <strong class="pfTitle">${title}</strong>
        <button type="button" class="pfBtn pfBtn--done" data-pf="done">${doneLabel}</button>
      </div>
      <div class="pfStageWrap">
        <div class="pfStage${circle ? " pfStage--circle" : ""}" data-pf="stage">
          <img class="pfImg" alt="" draggable="false" />
          ${circle ? `<div class="pfCircleMask" aria-hidden="true"></div>` : ""}
          <div class="pfGuide${circle ? " pfGuide--circle" : ""}" aria-hidden="true">
            <span class="pfGuideName">${guideText}</span>
          </div>
        </div>
      </div>
      <p class="pfHint">Drag to move · pinch or slide to zoom</p>
      <div class="pfZoomRow">
        <span class="pfZoomIco" aria-hidden="true">−</span>
        <input class="pfZoom" type="range" min="1" max="${MAX_ZOOM}" step="0.01" value="1" aria-label="Zoom" />
        <span class="pfZoomIco" aria-hidden="true">+</span>
      </div>
      <button type="button" class="pfReset" data-pf="reset">Reset</button>`;
    document.body.appendChild(root);
    document.body.classList.add("pfOpen");

    const stage = root.querySelector(".pfStage");
    const view = root.querySelector(".pfImg");
    const slider = root.querySelector(".pfZoom");
    view.src = img.src;

    const V = () => stage.clientWidth || 320;
    let zoom = 1;
    let tx = 0; // top-left of the image inside the stage, in px
    let ty = 0;
    const base = () => Math.max(V() / img.naturalWidth, V() / img.naturalHeight);
    const scale = () => base() * zoom;

    function clampPos() {
      const s = scale();
      const w = img.naturalWidth * s;
      const h = img.naturalHeight * s;
      tx = clamp(tx, V() - w, 0);
      ty = clamp(ty, V() - h, 0);
    }
    function apply() {
      clampPos();
      view.style.width = `${img.naturalWidth}px`;
      view.style.height = `${img.naturalHeight}px`;
      view.style.transform = `translate(${tx}px, ${ty}px) scale(${scale()})`;
    }
    function reset() {
      zoom = 1;
      slider.value = "1";
      const s = scale();
      tx = (V() - img.naturalWidth * s) / 2;
      ty = (V() - img.naturalHeight * s) / 2;
      // Portraits: start a little above centre so faces aren't cut off.
      if (img.naturalHeight > img.naturalWidth) ty = (V() - img.naturalHeight * s) * 0.22;
      apply();
    }
    /** Zoom about a point in stage coordinates. */
    function zoomAt(next, px, py) {
      const z = clamp(next, 1, MAX_ZOOM);
      const s0 = scale();
      const ix = (px - tx) / s0;
      const iy = (py - ty) / s0;
      zoom = z;
      slider.value = String(z);
      const s1 = scale();
      tx = px - ix * s1;
      ty = py - iy * s1;
      apply();
    }

    const pointers = new Map();
    let startDist = 0;
    let startZoom = 1;
    stage.addEventListener("pointerdown", (e) => {
      try { stage.setPointerCapture(e.pointerId); } catch {}
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        startDist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        startZoom = zoom;
      }
    });
    stage.addEventListener("pointermove", (e) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (pointers.size === 1) {
        tx += dx;
        ty += dy;
        apply();
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const r = stage.getBoundingClientRect();
        zoomAt(startZoom * (dist / startDist), (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      }
    });
    const up = (e) => { pointers.delete(e.pointerId); };
    stage.addEventListener("pointerup", up);
    stage.addEventListener("pointercancel", up);
    stage.addEventListener("wheel", (e) => {
      e.preventDefault();
      const r = stage.getBoundingClientRect();
      zoomAt(zoom * (e.deltaY < 0 ? 1.08 : 0.92), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    slider.addEventListener("input", () => {
      const c = V() / 2;
      zoomAt(Number(slider.value), c, c);
    });

    function close(result) {
      document.body.classList.remove("pfOpen");
      root.remove();
      resolve(result);
    }
    root.addEventListener("click", (e) => {
      const act = e.target.closest?.("[data-pf]")?.getAttribute("data-pf");
      if (act === "cancel") close(null);
      else if (act === "reset") reset();
      else if (act === "done") {
        const s = scale();
        const size = V() / s; // side of the visible square, in source pixels
        const crop = { x: -tx / s, y: -ty / s, size };
        try {
          close({ avatar: renderSquare(img, crop, AVATAR_SIZE) });
        } catch {
          close(null); // e.g. a tainted canvas: keep whatever the caller already had
        }
      }
    });
    requestAnimationFrame(reset);
  });
}
