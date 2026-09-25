/**
 * Cover Studio — one full-screen place to make a song's cover.
 *
 *   Cover      drag + pinch the photo inside the 9:16 portrait frame
 *   Thumbnail  slide (and zoom) the square window that becomes the feed / library thumbnail
 *   Text       type on the cover: fonts (Latin + Arabic), colours, styles, drag / pinch / rotate
 *
 * Everything is drawn on canvas from one render function, so what you see is exactly what is saved.
 * The result is a flattened 9:16 image (text included) plus a square thumbnail, using the same
 * `thumbFrame { scale, offsetY }` shape the rest of the app already understands.
 */

/** Logical (export) size of the portrait cover. All layout maths is done in these units. */
const W = 1080;
const H = 1920;
const MAX_WORK_SIDE = 2400;
const MAX_DATA_URL_CHARS = 1_900_000;
const MAX_TEXTS = 5;

export const STUDIO_FONTS = [
  { id: "nabad", label: "Nabad", family: "csNabad", weight: 900, style: "normal", mul: 1, sample: "Aa" },
  { id: "modern", label: "Modern", family: "csModern", weight: 700, style: "normal", mul: 1, sample: "Aa" },
  { id: "serif", label: "Serif", family: "csSerif", weight: 800, style: "italic", mul: 1, sample: "Aa" },
  { id: "poster", label: "Poster", family: "csPoster", weight: 400, style: "normal", mul: 1.28, sample: "AA" },
  { id: "script", label: "Script", family: "csScript", weight: 400, style: "normal", mul: 1.2, sample: "Aa" },
  { id: "kufi", label: "Kufi", family: "csKufi", weight: 700, style: "normal", mul: 1, sample: "أب" },
  { id: "ruqaa", label: "Ruqaa", family: "csRuqaa", weight: 700, style: "normal", mul: 1.05, sample: "أب" },
  { id: "display", label: "Display", family: "csDisplay", weight: 400, style: "normal", mul: 1.1, sample: "أب" },
];

const COLORS = ["#ffffff", "#0b0b13", "#23d5ab", "#7c5cff", "#ff7a59", "#ffc45c", "#ff5fa2", "nabad"];
const BRAND_A = "#23d5ab";
const BRAND_B = "#7c5cff";
const STYLES = [
  { id: "fill", label: "Fill" },
  { id: "outline", label: "Outline" },
  { id: "glow", label: "Glow" },
  { id: "shadow", label: "Shadow" },
];
const GRADIENTS = [
  ["#23d5ab", "#7c5cff"],
  ["#ff7a59", "#7c5cff"],
  ["#141433", "#7c5cff"],
  ["#ffc45c", "#ff5fa2"],
  ["#0b1f2a", "#23d5ab"],
  ["#2b1055", "#d53369"],
];

const ICON = {
  crop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14"/></svg>',
  square: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 15l4-4 4 4 3-3 5 5"/></svg>',
  text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 6V4h14v2M12 4v16M9 20h6"/></svg>',
  image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
  alignC: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M7 12h10M5 17h14"/></svg>',
  alignL: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h10M4 17h14"/></svg>',
  alignR: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M10 12h10M6 17h14"/></svg>',
  small: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="8" y="8" width="8" height="8" rx="2"/></svg>',
  large: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="3.5"/></svg>',
  spark: '<span aria-hidden="true">✦</span>',
};

let bridge = {};
export function configureCoverStudio(b) {
  bridge = b || {};
}

/** @type {null | ReturnType<typeof freshState>} */
let S = null;
let dom = null;
let raf = 0;
let discardArmedAt = 0;

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const haptic = (k = "light") => { try { bridge.haptic?.(k); } catch {} };
const toast = (m, o) => { try { bridge.showToast?.(m, o); } catch {} };
const hasArabic = (t) => /[؀-ۿݐ-ݿࢠ-ࣿ]/.test(String(t || ""));
const fontById = (id) => STUDIO_FONTS.find((f) => f.id === id) || STUDIO_FONTS[0];

function freshState(opts) {
  return {
    trackId: String(opts.trackId || ""),
    title: String(opts.title || ""),
    handle: String(opts.handle || ""),
    canMagic: Boolean(opts.canMagic),
    onSave: opts.onSave,
    onMagic: opts.onMagic,
    onClose: opts.onClose,
    tab: "cover",
    photo: null,
    bg: null,
    cover: { scale: 1, px: 0, py: 0 },
    thumb: {
      scale: clamp(Number(opts.thumbFrame?.scale) || 1, 1, 2.5),
      offsetY: clamp(Number(opts.thumbFrame?.offsetY) || 0, -1, 1),
    },
    texts: [],
    sel: "",
    nextId: 1,
    style: { font: "nabad", color: "#ffffff", fx: "fill", align: "center" },
    dirtyMain: false,
    dirtyThumb: false,
    dragging: false,
    stageW: 0,
    stageH: 0,
    k: 1,
    editing: false,
  };
}

/* ───────────────────────────── DOM ───────────────────────────── */

function ensureDom() {
  if (dom && document.body.contains(dom.root)) return dom;
  const root = document.createElement("div");
  root.id = "coverStudio";
  root.className = "csRoot";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", "Cover Studio");
  root.innerHTML = `
    <div class="csAmb" data-cs-amb></div><div class="csVeil"></div>
    <header class="csTop">
      <button type="button" class="csX csGlass" data-cs="close" aria-label="Close">✕</button>
      <div class="csTitle"><b>Cover Studio</b><small data-cs-sub></small></div>
      <button type="button" class="csSave" data-cs="save">Save</button>
    </header>
    <div class="csEditBar csGlass" data-cs-editbar hidden>
      <input class="csEditInput" data-cs-input type="text" maxlength="60" autocomplete="off" autocapitalize="sentences" enterkeyhint="done" placeholder="Type your title" />
      <button type="button" class="csEditDone" data-cs="edit-done">Done</button>
    </div>
    <div class="csBody">
      <div class="csStageWrap" data-cs-stagewrap>
        <div class="csStageBox" data-cs-stagebox>
          <canvas class="csStage" data-cs-stage></canvas>
          <div class="csStageActions" data-cs-stageactions>
            <button type="button" class="csPill csGlass" data-cs="photo">${ICON.image}<span>Photo</span></button>
            <button type="button" class="csPill csGlass csPillMagic" data-cs="magic" hidden>${ICON.spark}<span>Magic</span></button>
          </div>
          <button type="button" class="csPill csGlass csReset" data-cs="reset">Reset</button>
          <div class="csEmpty" data-cs-empty hidden>
            <div class="csEmptyIco">${ICON.image}</div>
            <div class="csEmptyTitle">Give this song a cover</div>
            <p class="csEmptySub">Pick a photo, add your title in style, and slide it into the thumbnail.</p>
            <button type="button" class="csSave csSaveBig" data-cs="photo">Choose a photo</button>
            <button type="button" class="csPill csGlass csPillWide" data-cs="magic" hidden>${ICON.spark}<span>Generate with AI</span></button>
          </div>
        </div>
      </div>
      <section class="csPanel" data-cs-panel="cover">
        <p class="csHint" data-cs-hint>Drag to move · Pinch to zoom</p>
        <label class="csSlider">${ICON.small}<input type="range" min="100" max="400" step="1" value="100" data-cs-range="cover" aria-label="Zoom photo" />${ICON.large}</label>
        <div class="csGradRow" data-cs-gradrow hidden>
          <span class="csLbl">Background</span>
          <div class="csGrads">${GRADIENTS.map((g, i) => `<button type="button" class="csGrad" data-cs-grad="${i}" style="background:linear-gradient(160deg,${g[0]},${g[1]})" aria-label="Gradient ${i + 1}"></button>`).join("")}</div>
        </div>
      </section>
      <section class="csPanel" data-cs-panel="thumb" hidden>
        <div class="csPreviewsHead"><span class="csLbl">How it looks</span><span class="csHint csHintInline">Slide the square · pinch to zoom</span></div>
        <div class="csPreviews">
          <figure class="csPrevFig"><canvas class="csPrevFeed" data-cs-prev="feed" width="192" height="192"></canvas><figcaption class="csLbl">Feed</figcaption></figure>
          <figure class="csPrevFig csPrevFigWide"><div class="csPrevRow csGlass"><canvas class="csPrevLib" data-cs-prev="lib" width="112" height="112"></canvas><div class="csPrevMeta"><b data-cs-prev-title>Your song</b><span data-cs-prev-handle></span></div></div><figcaption class="csLbl">Library</figcaption></figure>
        </div>
        <label class="csSlider">${ICON.small}<input type="range" min="100" max="250" step="1" value="100" data-cs-range="thumb" aria-label="Zoom thumbnail" />${ICON.large}</label>
      </section>
      <section class="csPanel csPanelText csGlass" data-cs-panel="text" hidden>
        <div class="csFonts" data-cs-fonts>${STUDIO_FONTS.map((f) => `<button type="button" class="csFont" data-cs-font="${f.id}"><span class="csFontAa" style="font-family:'${f.family}',sans-serif;font-weight:${f.weight};font-style:${f.style}">${f.sample}</span><span class="csFontName">${f.label}</span></button>`).join("")}</div>
        <div class="csSwatches" data-cs-swatches>${COLORS.map((c) => `<button type="button" class="csSwatch${c === "nabad" ? " csSwatchNabad" : ""}" data-cs-color="${c}" style="${c === "nabad" ? "" : `background:${c}`}" aria-label="Colour ${c}"></button>`).join("")}</div>
        <div class="csSeg" data-cs-styles>${STYLES.map((s) => `<button type="button" data-cs-fx="${s.id}">${s.label}</button>`).join("")}</div>
        <label class="csSlider csSliderTight" data-cs-sizerow>${ICON.small}<input type="range" min="40" max="320" step="1" value="100" data-cs-range="size" aria-label="Text size" />${ICON.large}</label>
        <div class="csActions">
          <button type="button" class="csPill csGlass csPillTall" data-cs="text-add">＋ Text</button>
          <button type="button" class="csPill csGlass csPillTall" data-cs="text-title">${ICON.spark}<span>Song title</span></button>
          <span class="csGrow"></span>
          <button type="button" class="csRound csGlass" data-cs="text-align" aria-label="Alignment"></button>
          <button type="button" class="csRound csGlass csRoundDanger" data-cs="text-delete" aria-label="Delete text">${ICON.trash}</button>
        </div>
      </section>
    </div>
    <nav class="csDock csGlass" role="tablist">
      <button type="button" role="tab" data-cs-tab="cover">${ICON.crop}<span>Cover</span></button>
      <button type="button" role="tab" data-cs-tab="thumb">${ICON.square}<span>Thumbnail</span></button>
      <button type="button" role="tab" data-cs-tab="text">${ICON.text}<span>Text</span></button>
    </nav>
    <input type="file" accept="image/*" hidden data-cs-file />`;
  document.body.appendChild(root);
  const q = (s) => root.querySelector(s);
  dom = {
    root,
    amb: q("[data-cs-amb]"),
    sub: q("[data-cs-sub]"),
    stageWrap: q("[data-cs-stagewrap]"),
    stageBox: q("[data-cs-stagebox]"),
    stage: q("[data-cs-stage]"),
    stageActions: q("[data-cs-stageactions]"),
    reset: q(".csReset"),
    empty: q("[data-cs-empty]"),
    editBar: q("[data-cs-editbar]"),
    input: q("[data-cs-input]"),
    file: q("[data-cs-file]"),
    hint: q("[data-cs-hint]"),
    gradRow: q("[data-cs-gradrow]"),
    prevFeed: q('[data-cs-prev="feed"]'),
    prevLib: q('[data-cs-prev="lib"]'),
    prevTitle: q("[data-cs-prev-title]"),
    prevHandle: q("[data-cs-prev-handle]"),
    rangeCover: q('[data-cs-range="cover"]'),
    rangeThumb: q('[data-cs-range="thumb"]'),
    rangeSize: q('[data-cs-range="size"]'),
    sizeRow: q("[data-cs-sizerow]"),
    save: q('[data-cs="save"]'),
    alignBtn: q('[data-cs="text-align"]'),
    comp: document.createElement("canvas"),
  };
  wireDom();
  return dom;
}

function wireDom() {
  const { root } = dom;
  root.addEventListener("click", (e) => {
    const t = e.target.closest("[data-cs],[data-cs-tab],[data-cs-font],[data-cs-color],[data-cs-fx],[data-cs-grad]");
    if (!t || !S) return;
    if (t.dataset.csTab) return setTab(t.dataset.csTab);
    if (t.dataset.csFont) return setTextProp({ font: t.dataset.csFont });
    if (t.dataset.csColor) return setTextProp({ color: t.dataset.csColor });
    if (t.dataset.csFx) return setTextProp({ fx: t.dataset.csFx });
    if (t.dataset.csGrad !== undefined) return setBackground(Number(t.dataset.csGrad));
    const a = t.dataset.cs;
    if (a === "close") return requestClose();
    if (a === "save") return void save();
    if (a === "photo") return dom.file.click();
    if (a === "magic") return magic();
    if (a === "reset") return resetFrame();
    if (a === "text-add") return addText("");
    if (a === "text-title") return addText(S.title || "Your title");
    if (a === "text-delete") return deleteSelected();
    if (a === "text-align") return cycleAlign();
    if (a === "edit-done") return closeEdit();
  });
  dom.file.addEventListener("change", () => {
    const f = dom.file.files?.[0];
    dom.file.value = "";
    if (f) void loadFile(f);
  });
  dom.rangeCover.addEventListener("input", () => {
    if (!S) return;
    S.cover.scale = clamp(Number(dom.rangeCover.value) / 100, 1, 4);
    clampCover();
    S.dirtyMain = true;
    requestRender();
  });
  dom.rangeThumb.addEventListener("input", () => {
    if (!S) return;
    S.thumb.scale = clamp(Number(dom.rangeThumb.value) / 100, 1, 2.5);
    S.dirtyThumb = true;
    requestRender();
  });
  dom.rangeSize.addEventListener("input", () => {
    const L = selected();
    if (!L) return;
    L.scale = clamp(Number(dom.rangeSize.value) / 100, 0.25, 3.2);
    S.dirtyMain = true;
    requestRender();
  });
  dom.input.addEventListener("input", () => {
    const L = selected();
    if (!L) return;
    L.text = dom.input.value;
    S.dirtyMain = true;
    requestRender();
  });
  dom.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      closeEdit();
    }
  });
  wireGestures();
  window.addEventListener("resize", () => { if (S) { fitStage(); requestRender(); } });
  window.addEventListener("orientationchange", () => { if (S) window.setTimeout(() => { fitStage(); requestRender(); }, 250); });
}

/* ───────────────────────────── Photo / background ───────────────────────────── */

function toWorkCanvas(img) {
  const w = Number(img.naturalWidth || img.width || 0);
  const h = Number(img.naturalHeight || img.height || 0);
  if (!w || !h) throw new Error("Could not read this image");
  const scale = Math.min(1, MAX_WORK_SIDE / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * scale));
  c.height = Math.max(1, Math.round(h * scale));
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

async function loadFile(file) {
  if (!file || !String(file.type || "").startsWith("image/")) {
    toast("Choose an image file.");
    return;
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Could not read this image"));
      i.src = url;
    });
    if (!S) return;
    S.photo = toWorkCanvas(img);
    S.bg = null;
    S.cover = { scale: 1, px: 0, py: 0 };
    S.dirtyMain = true;
    S.dirtyThumb = true;
    dom.rangeCover.value = "100";
    haptic("success");
    syncUi();
    requestRender();
  } catch (e) {
    toast(String(e?.message || "Could not read this image"), { durationMs: 2800 });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function loadSource(url) {
  const src = String(url || "").trim();
  if (!src || typeof bridge.loadImage !== "function") return;
  try {
    const img = await bridge.loadImage(src);
    if (!S) return;
    S.photo = toWorkCanvas(img);
  } catch (e) {
    toast("Couldn’t load the current cover — choose a photo.", { durationMs: 2800 });
  }
}

function setBackground(i) {
  if (!S || !GRADIENTS[i]) return;
  S.bg = { i };
  S.photo = null;
  S.dirtyMain = true;
  S.dirtyThumb = true;
  haptic("light");
  syncUi();
  requestRender();
}

/* ───────────────────────────── Geometry ───────────────────────────── */

function photoGeom() {
  const p = S.photo;
  const base = Math.max(W / p.width, H / p.height);
  const s = base * S.cover.scale;
  const dw = p.width * s;
  const dh = p.height * s;
  return { dw, dh, cx: W / 2 + S.cover.px * W, cy: H / 2 + S.cover.py * H };
}

function clampCover() {
  if (!S?.photo) return;
  const { dw, dh } = photoGeom();
  const maxX = Math.max(0, (dw - W) / 2) / W;
  const maxY = Math.max(0, (dh - H) / 2) / H;
  S.cover.px = clamp(S.cover.px, -maxX, maxX);
  S.cover.py = clamp(S.cover.py, -maxY, maxY);
}

/** The thumbnail window on the 1080×1920 cover — identical maths to the app's thumbFrameCropRect. */
function thumbRect(frame = S.thumb) {
  const side = W / clamp(frame.scale, 1, 2.5);
  const sx = (W - side) / 2;
  const def = (H - side) / 2;
  const sy = def + clamp(frame.offsetY, -1, 1) * def;
  return { sx, sy, side };
}

function offsetFromSy(sy, side) {
  const def = (H - side) / 2;
  return def > 0 ? clamp((sy - def) / def, -1, 1) : 0;
}

/* ───────────────────────────── Text layers ───────────────────────────── */

const selected = () => (S ? S.texts.find((t) => t.id === S.sel) || null : null);

function canvasFont(L, px) {
  const f = fontById(L.font);
  return `${f.style} ${f.weight} ${Math.round(px)}px "${f.family}", "SF Pro Display", -apple-system, "SF Arabic", "Geeza Pro", sans-serif`;
}

function layerMetrics(ctx, L) {
  const f = fontById(L.font);
  const px = W * 0.15 * f.mul * L.scale;
  ctx.font = canvasFont(L, px);
  const lines = String(L.text || " ").split("\n");
  const lineH = px * 1.16;
  let w = 0;
  for (const ln of lines) w = Math.max(w, ctx.measureText(ln || " ").width);
  return { px, lines, lineH, w: Math.max(w, px * 0.5), h: lineH * lines.length };
}

function drawLayer(ctx, L, m) {
  ctx.save();
  ctx.translate(L.x * W, L.y * H);
  ctx.rotate(L.rot);
  ctx.font = canvasFont(L, m.px);
  ctx.textBaseline = "middle";
  ctx.textAlign = L.align;
  ctx.direction = hasArabic(L.text) ? "rtl" : "ltr";
  ctx.lineJoin = "round";
  const ax = L.align === "left" ? -m.w / 2 : L.align === "right" ? m.w / 2 : 0;
  let fill = L.color;
  if (L.color === "nabad") {
    const g = ctx.createLinearGradient(-m.w / 2, -m.h / 2, m.w / 2, m.h / 2);
    g.addColorStop(0, BRAND_A);
    g.addColorStop(1, BRAND_B);
    fill = g;
  }
  const glowColor = L.color === "nabad" ? BRAND_B : L.color;
  m.lines.forEach((ln, i) => {
    const y = (i - (m.lines.length - 1) / 2) * m.lineH;
    if (L.fx === "outline") {
      ctx.strokeStyle = fill;
      ctx.lineWidth = Math.max(3, m.px * 0.055);
      ctx.strokeText(ln, ax, y);
    } else if (L.fx === "glow") {
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = m.px * 0.55;
      ctx.fillStyle = fill;
      ctx.fillText(ln, ax, y);
      ctx.shadowBlur = m.px * 0.2;
      ctx.fillText(ln, ax, y);
    } else if (L.fx === "shadow") {
      ctx.shadowColor = "rgba(0,0,0,.6)";
      ctx.shadowBlur = m.px * 0.22;
      ctx.shadowOffsetY = m.px * 0.07;
      ctx.fillStyle = fill;
      ctx.fillText(ln, ax, y);
    } else {
      ctx.fillStyle = fill;
      ctx.fillText(ln, ax, y);
    }
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  });
  ctx.restore();
}

function addText(text) {
  if (!S) return;
  if (S.texts.length >= MAX_TEXTS) {
    toast(`Up to ${MAX_TEXTS} text layers.`);
    return;
  }
  const L = {
    id: `t${S.nextId++}`,
    text: text || "Your title",
    font: S.style.font,
    color: S.style.color,
    fx: S.style.fx,
    align: S.style.align,
    x: 0.5,
    y: 0.4 + (S.texts.length % 4) * 0.09,
    scale: 1,
    rot: 0,
  };
  // Fit long text inside the cover.
  const c = dom.comp.getContext("2d");
  const m = layerMetrics(c, L);
  if (m.w > W * 0.82) L.scale = clamp((W * 0.82) / m.w, 0.3, 1);
  S.texts.push(L);
  S.sel = L.id;
  S.dirtyMain = true;
  haptic("light");
  syncUi();
  requestRender();
  if (!text) openEdit(true);
}

function deleteSelected() {
  if (!S?.sel) return;
  S.texts = S.texts.filter((t) => t.id !== S.sel);
  S.sel = "";
  S.dirtyMain = true;
  closeEdit();
  haptic("light");
  syncUi();
  requestRender();
}

function setTextProp(patch) {
  if (!S) return;
  Object.assign(S.style, patch);
  const L = selected();
  if (L) {
    Object.assign(L, patch);
    S.dirtyMain = true;
  }
  haptic("light");
  syncUi();
  requestRender();
}

function cycleAlign() {
  const order = ["center", "left", "right"];
  const cur = selected()?.align || S.style.align;
  setTextProp({ align: order[(order.indexOf(cur) + 1) % order.length] });
}

function openEdit(selectAll) {
  const L = selected();
  if (!L) return;
  S.editing = true;
  dom.editBar.hidden = false;
  dom.input.value = L.text;
  dom.input.dir = hasArabic(L.text) ? "rtl" : "ltr";
  window.setTimeout(() => {
    try {
      dom.input.focus();
      if (selectAll) dom.input.select();
    } catch {}
  }, 30);
}

function closeEdit() {
  if (!S) return;
  const L = selected();
  if (L && !String(L.text || "").trim()) {
    S.texts = S.texts.filter((t) => t.id !== L.id);
    S.sel = "";
  }
  S.editing = false;
  dom.editBar.hidden = true;
  try { dom.input.blur(); } catch {}
  syncUi();
  requestRender();
}

/* ───────────────────────────── Render ───────────────────────────── */

function requestRender() {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    if (S) drawAll();
  });
}

function drawBackground(ctx) {
  ctx.fillStyle = "#0b0b13";
  ctx.fillRect(0, 0, W, H);
  if (S.photo) {
    const { dw, dh, cx, cy } = photoGeom();
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(S.photo, cx - dw / 2, cy - dh / 2, dw, dh);
  } else if (S.bg) {
    const [a, b] = GRADIENTS[S.bg.i];
    const g = ctx.createLinearGradient(W * 0.2, 0, W * 0.8, H);
    g.addColorStop(0, a);
    g.addColorStop(1, b);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawComposite(ctx) {
  drawBackground(ctx);
  for (const L of S.texts) drawLayer(ctx, L, layerMetrics(ctx, L));
}

function syncRangeFills() {
  for (const r of [dom.rangeCover, dom.rangeThumb, dom.rangeSize]) {
    const pct = ((Number(r.value) - Number(r.min)) / (Number(r.max) - Number(r.min))) * 100;
    r.style.setProperty("--p", `${clamp(pct, 0, 100)}%`);
  }
}

function drawAll() {
  syncRangeFills();
  const { stage, comp } = dom;
  if (!stage.width || !stage.height) return;
  const k = S.k;
  const cctx = comp.getContext("2d");
  cctx.setTransform(k, 0, 0, k, 0, 0);
  cctx.clearRect(0, 0, W, H);
  drawComposite(cctx);

  const ctx = stage.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, stage.width, stage.height);
  ctx.drawImage(comp, 0, 0);
  ctx.setTransform(k, 0, 0, k, 0, 0);

  if (S.tab === "cover" && S.dragging && (S.photo || S.bg)) {
    ctx.strokeStyle = "rgba(255,255,255,.28)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (const f of [1 / 3, 2 / 3]) {
      ctx.moveTo(W * f, 0); ctx.lineTo(W * f, H);
      ctx.moveTo(0, H * f); ctx.lineTo(W, H * f);
    }
    ctx.stroke();
  }
  if (S.tab === "thumb" && (S.photo || S.bg)) drawThumbOverlay(ctx);
  if (S.tab === "text") drawTextOverlay(ctx);
  drawPreviews();
}

function drawThumbOverlay(ctx) {
  const r = thumbRect();
  ctx.fillStyle = "rgba(6,6,12,.66)";
  ctx.fillRect(0, 0, W, r.sy);
  ctx.fillRect(0, r.sy + r.side, W, H - r.sy - r.side);
  ctx.fillRect(0, r.sy, r.sx, r.side);
  ctx.fillRect(r.sx + r.side, r.sy, W - r.sx - r.side, r.side);
  ctx.save();
  ctx.shadowColor = "rgba(35,213,171,.55)";
  ctx.shadowBlur = 46;
  ctx.strokeStyle = BRAND_A;
  ctx.lineWidth = 7;
  ctx.strokeRect(r.sx + 3.5, r.sy + 3.5, r.side - 7, r.side - 7);
  ctx.restore();
  // grab handle
  const hw = 250;
  const hh = 84;
  const hx = W / 2 - hw / 2;
  const hy = r.sy + r.side - hh / 2;
  ctx.fillStyle = "rgba(20,22,32,.78)";
  ctx.strokeStyle = "rgba(255,255,255,.28)";
  ctx.lineWidth = 3;
  roundRect(ctx, hx, hy, hw, hh, 42);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = '700 40px -apple-system, "SF Pro Text", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.direction = "ltr";
  ctx.fillText("▲  Slide  ▼", W / 2, hy + hh / 2 + 2);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const PAD = 34;

function handlePos(m) {
  return { x: m.w / 2 + PAD, y: m.h / 2 + PAD };
}

function drawTextOverlay(ctx) {
  // safe zone: where the player's title / controls sit
  const sz = H * 0.66;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,.28)";
  ctx.fillRect(0, sz, W, H - sz);
  ctx.setLineDash([22, 16]);
  ctx.strokeStyle = "rgba(255,255,255,.45)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, sz);
  ctx.lineTo(W, sz);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(255,255,255,.7)";
  ctx.font = '700 30px -apple-system, "SF Pro Text", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.direction = "ltr";
  ctx.fillText("PLAYER CONTROLS SIT HERE", W / 2, sz + (H - sz) / 2);
  ctx.restore();
  const L = selected();
  if (!L || S.editing) return;
  const m = layerMetrics(ctx, L);
  ctx.save();
  ctx.translate(L.x * W, L.y * H);
  ctx.rotate(L.rot);
  ctx.setLineDash([18, 12]);
  ctx.strokeStyle = "rgba(255,255,255,.92)";
  ctx.lineWidth = 4;
  ctx.strokeRect(-m.w / 2 - PAD, -m.h / 2 - PAD, m.w + PAD * 2, m.h + PAD * 2);
  ctx.setLineDash([]);
  const corners = [[-1, -1], [1, -1], [-1, 1]];
  ctx.fillStyle = "#fff";
  for (const [cx, cy] of corners) {
    ctx.beginPath();
    ctx.arc(cx * (m.w / 2 + PAD), cy * (m.h / 2 + PAD), 15, 0, Math.PI * 2);
    ctx.fill();
  }
  const h = handlePos(m);
  ctx.fillStyle = BRAND_A;
  ctx.beginPath();
  ctx.arc(h.x, h.y, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#0b0b13";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.restore();
}

function drawPreviews() {
  if (S.tab !== "thumb" || !(S.photo || S.bg)) return;
  const r = thumbRect();
  const k = S.k;
  for (const c of [dom.prevFeed, dom.prevLib]) {
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(dom.comp, r.sx * k, r.sy * k, r.side * k, r.side * k, 0, 0, c.width, c.height);
  }
}

/* ───────────────────────────── Gestures ───────────────────────────── */

function wireGestures() {
  const el = dom.stage;
  el.style.touchAction = "none";
  const P = new Map();
  let g = null;
  let moved = false;
  let pinched = false; // a two-finger gesture happened: lifting the last finger is not a tap

  const toLogical = (e) => {
    const r = el.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const two = () => {
    const [a, b] = [...P.values()];
    return { d: Math.hypot(b.x - a.x, b.y - a.y) || 1, ang: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };

  const hit = (pt) => {
    const c = dom.comp.getContext("2d");
    // selected layer's resize/rotate handle first
    const sel = selected();
    if (sel) {
      const m = layerMetrics(c, sel);
      const h = handlePos(m);
      const cos = Math.cos(sel.rot);
      const sin = Math.sin(sel.rot);
      const hx = sel.x * W + h.x * cos - h.y * sin;
      const hy = sel.y * H + h.x * sin + h.y * cos;
      if (Math.hypot(pt.x - hx, pt.y - hy) < 70) return { L: sel, handle: true };
    }
    for (let i = S.texts.length - 1; i >= 0; i -= 1) {
      const L = S.texts[i];
      const m = layerMetrics(c, L);
      const dx = pt.x - L.x * W;
      const dy = pt.y - L.y * H;
      const lx = dx * Math.cos(L.rot) + dy * Math.sin(L.rot);
      const ly = -dx * Math.sin(L.rot) + dy * Math.cos(L.rot);
      if (Math.abs(lx) <= m.w / 2 + PAD + 14 && Math.abs(ly) <= Math.max(m.h / 2 + PAD, 70)) return { L, handle: false };
    }
    return null;
  };

  const begin = () => {
    moved = false;
    if (P.size >= 2) {
      pinched = true;
      const t = two();
      g = {
        mode: "pinch",
        d0: t.d, a0: t.ang, m0: { x: t.mx, y: t.my },
        cover0: { ...S.cover }, thumb0: { ...S.thumb },
        L0: selected() ? { id: S.sel, scale: selected().scale, rot: selected().rot } : null,
      };
      return;
    }
    const pt = [...P.values()][0];
    if (!pt) { g = null; return; }
    if (S.tab === "text") {
      const h = hit(pt);
      if (h) {
        const wasSel = S.sel === h.L.id;
        S.sel = h.L.id;
        syncUi();
        if (h.handle) {
          const dx = pt.x - h.L.x * W;
          const dy = pt.y - h.L.y * H;
          g = { mode: "handle", id: h.L.id, d0: Math.hypot(dx, dy) || 1, a0: Math.atan2(dy, dx), s0: h.L.scale, r0: h.L.rot };
        } else {
          g = { mode: "move", id: h.L.id, x0: pt.x, y0: pt.y, lx0: h.L.x, ly0: h.L.y, wasSel };
        }
      } else {
        if (S.sel) { S.sel = ""; syncUi(); requestRender(); }
        g = null;
      }
    } else if (S.tab === "cover") {
      g = S.photo ? { mode: "pan", x0: pt.x, y0: pt.y, px0: S.cover.px, py0: S.cover.py } : null;
    } else {
      const r = thumbRect();
      g = { mode: "slide", y0: pt.y, sy0: r.sy, side: r.side };
    }
    S.dragging = Boolean(g);
  };

  el.addEventListener("pointerdown", (e) => {
    if (!S || S.editing) return;
    try { el.setPointerCapture(e.pointerId); } catch {}
    P.set(e.pointerId, toLogical(e));
    begin();
    requestRender();
  });
  el.addEventListener("pointermove", (e) => {
    if (!S || !P.has(e.pointerId)) return;
    P.set(e.pointerId, toLogical(e));
    if (!g) return;
    moved = true;
    if (g.mode === "pinch" && P.size >= 2) {
      const t = two();
      const ratio = t.d / g.d0;
      if (S.tab === "cover" && S.photo) {
        S.cover.scale = clamp(g.cover0.scale * ratio, 1, 4);
        S.cover.px = g.cover0.px + (t.mx - g.m0.x) / W;
        S.cover.py = g.cover0.py + (t.my - g.m0.y) / H;
        clampCover();
        dom.rangeCover.value = String(Math.round(S.cover.scale * 100));
        S.dirtyMain = true;
      } else if (S.tab === "thumb") {
        const r0 = thumbRect(g.thumb0);
        S.thumb.scale = clamp(g.thumb0.scale * ratio, 1, 2.5);
        const side = W / S.thumb.scale;
        S.thumb.offsetY = offsetFromSy(r0.sy + r0.side / 2 - side / 2, side);
        dom.rangeThumb.value = String(Math.round(S.thumb.scale * 100));
        S.dirtyThumb = true;
      } else if (S.tab === "text" && g.L0) {
        const L = S.texts.find((x) => x.id === g.L0.id);
        if (L) {
          L.scale = clamp(g.L0.scale * ratio, 0.25, 3.2);
          L.rot = g.L0.rot + (t.ang - g.a0);
          dom.rangeSize.value = String(Math.round(L.scale * 100));
          S.dirtyMain = true;
        }
      }
    } else if (P.size === 1) {
      const pt = P.get(e.pointerId);
      if (g.mode === "pan") {
        S.cover.px = g.px0 + (pt.x - g.x0) / W;
        S.cover.py = g.py0 + (pt.y - g.y0) / H;
        clampCover();
        S.dirtyMain = true;
      } else if (g.mode === "slide") {
        const sy = clamp(g.sy0 + (pt.y - g.y0), 0, H - g.side);
        S.thumb.offsetY = offsetFromSy(sy, g.side);
        S.dirtyThumb = true;
      } else if (g.mode === "move") {
        const L = S.texts.find((x) => x.id === g.id);
        if (L) {
          L.x = clamp(g.lx0 + (pt.x - g.x0) / W, 0.02, 0.98);
          L.y = clamp(g.ly0 + (pt.y - g.y0) / H, 0.02, 0.98);
          S.dirtyMain = true;
        }
      } else if (g.mode === "handle") {
        const L = S.texts.find((x) => x.id === g.id);
        if (L) {
          const dx = pt.x - L.x * W;
          const dy = pt.y - L.y * H;
          L.scale = clamp(g.s0 * ((Math.hypot(dx, dy) || 1) / g.d0), 0.25, 3.2);
          L.rot = g.r0 + (Math.atan2(dy, dx) - g.a0);
          dom.rangeSize.value = String(Math.round(L.scale * 100));
          S.dirtyMain = true;
        }
      }
    }
    requestRender();
  });
  const end = (e) => {
    if (!P.has(e.pointerId)) return;
    const wasMove = g?.mode === "move" && !moved && g.wasSel && !pinched;
    const id = g?.id;
    P.delete(e.pointerId);
    try { el.releasePointerCapture(e.pointerId); } catch {}
    if (P.size === 0) {
      if (wasMove && id === S.sel) openEdit(false);
      g = null;
      pinched = false;
      S.dragging = false;
    } else {
      begin();
    }
    syncUi(true);
    requestRender();
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
  el.addEventListener("wheel", (e) => {
    if (!S) return;
    e.preventDefault();
    const f = Math.exp(-e.deltaY * 0.0022);
    if (S.tab === "cover" && S.photo) {
      S.cover.scale = clamp(S.cover.scale * f, 1, 4);
      clampCover();
      dom.rangeCover.value = String(Math.round(S.cover.scale * 100));
      S.dirtyMain = true;
    } else if (S.tab === "thumb") {
      const r0 = thumbRect();
      S.thumb.scale = clamp(S.thumb.scale * f, 1, 2.5);
      const side = W / S.thumb.scale;
      S.thumb.offsetY = offsetFromSy(r0.sy + r0.side / 2 - side / 2, side);
      dom.rangeThumb.value = String(Math.round(S.thumb.scale * 100));
      S.dirtyThumb = true;
    } else if (S.tab === "text" && selected()) {
      const L = selected();
      L.scale = clamp(L.scale * f, 0.25, 3.2);
      dom.rangeSize.value = String(Math.round(L.scale * 100));
      S.dirtyMain = true;
    }
    requestRender();
  }, { passive: false });
}

/* ───────────────────────────── UI state ───────────────────────────── */

function setTab(tab) {
  if (!S || S.tab === tab) return;
  closeEdit();
  S.tab = tab;
  haptic("light");
  syncUi();
  window.requestAnimationFrame(() => { fitStage(); requestRender(); });
}

function syncUi() {
  if (!S) return;
  const { root } = dom;
  const hasArt = Boolean(S.photo || S.bg);
  root.dataset.tab = S.tab;
  root.classList.toggle("csIsEmpty", !hasArt);
  dom.empty.hidden = hasArt;
  dom.stage.style.visibility = hasArt ? "visible" : "hidden";
  dom.stageActions.hidden = !(hasArt && S.tab === "cover");
  dom.reset.hidden = !(hasArt && S.tab !== "text");
  root.querySelectorAll("[data-cs-tab]").forEach((b) => {
    const on = b.dataset.csTab === S.tab;
    b.classList.toggle("on", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  root.querySelectorAll("[data-cs-panel]").forEach((p) => { p.hidden = p.dataset.csPanel !== S.tab; });
  root.querySelectorAll('[data-cs="magic"]').forEach((b) => { b.hidden = !S.canMagic; });
  dom.save.disabled = !hasArt;
  dom.save.classList.toggle("off", !hasArt);
  dom.gradRow.hidden = !(S.bg || !S.photo);
  dom.gradRow.querySelectorAll("[data-cs-grad]").forEach((b) => b.classList.toggle("on", S.bg && Number(b.dataset.csGrad) === S.bg.i));
  dom.hint.textContent = S.photo ? "Drag to move · Pinch to zoom" : "Pick a background, or choose a photo";
  const L = selected();
  const cur = L || S.style;
  root.querySelectorAll("[data-cs-font]").forEach((b) => b.classList.toggle("on", b.dataset.csFont === cur.font));
  root.querySelectorAll("[data-cs-color]").forEach((b) => b.classList.toggle("on", b.dataset.csColor === cur.color));
  root.querySelectorAll("[data-cs-fx]").forEach((b) => b.classList.toggle("on", b.dataset.csFx === cur.fx));
  dom.alignBtn.innerHTML = cur.align === "left" ? ICON.alignL : cur.align === "right" ? ICON.alignR : ICON.alignC;
  root.querySelector('[data-cs="text-delete"]').disabled = !L;
  dom.sizeRow.classList.toggle("csDisabled", !L);
  dom.rangeSize.disabled = !L;
  if (L) dom.rangeSize.value = String(Math.round(L.scale * 100));
  dom.rangeCover.value = String(Math.round(S.cover.scale * 100));
  dom.rangeThumb.value = String(Math.round(S.thumb.scale * 100));
  dom.rangeCover.disabled = !S.photo;
  dom.rangeCover.closest(".csSlider").hidden = !S.photo;
  for (const r of [dom.rangeCover, dom.rangeThumb, dom.rangeSize]) {
    const pct = ((Number(r.value) - Number(r.min)) / (Number(r.max) - Number(r.min))) * 100;
    r.style.setProperty("--p", `${clamp(pct, 0, 100)}%`);
  }
  dom.sub.textContent = S.title || "";
  dom.prevTitle.textContent = S.title || "Your song";
  dom.prevHandle.textContent = S.handle ? `@${S.handle}` : "";
}

function fitStage() {
  if (!S) return;
  const wr = dom.stageWrap.getBoundingClientRect();
  let h = wr.height;
  let w = (h * 9) / 16;
  if (w > wr.width) {
    w = wr.width;
    h = (w * 16) / 9;
  }
  S.stageW = Math.max(60, Math.floor(w));
  S.stageH = Math.max(106, Math.floor(h));
  const dpr = Math.min(3, window.devicePixelRatio || 2);
  dom.stageBox.style.width = `${S.stageW}px`;
  dom.stageBox.style.height = `${S.stageH}px`;
  dom.stage.style.width = `${S.stageW}px`;
  dom.stage.style.height = `${S.stageH}px`;
  dom.stage.width = Math.round(S.stageW * dpr);
  dom.stage.height = Math.round(S.stageH * dpr);
  dom.comp.width = dom.stage.width;
  dom.comp.height = dom.stage.height;
  S.k = dom.stage.width / W;
}

function resetFrame() {
  if (!S) return;
  if (S.tab === "thumb") {
    S.thumb = { scale: 1, offsetY: 0 };
    S.dirtyThumb = true;
  } else {
    S.cover = { scale: 1, px: 0, py: 0 };
    S.dirtyMain = true;
  }
  haptic("light");
  syncUi();
  requestRender();
}

function magic() {
  if (!S) return;
  const cb = S.onMagic;
  closeStudio({ silent: true });
  try { cb?.(); } catch {}
}

/* ───────────────────────────── Save ───────────────────────────── */

function renderExport(width) {
  const w = Math.round(width);
  const h = Math.round((width * 16) / 9);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  const k = w / W;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  drawComposite(ctx);
  return c;
}

function encode(canvas, quality) {
  try {
    const webp = canvas.toDataURL("image/webp", quality);
    if (webp.startsWith("data:image/webp")) return webp;
  } catch {}
  return canvas.toDataURL("image/jpeg", quality);
}

async function ensureFonts() {
  if (!document.fonts?.load) return;
  const loads = STUDIO_FONTS.map((f) => document.fonts.load(`${f.style} ${f.weight} 64px "${f.family}"`, `${f.sample} Aa أب`));
  await Promise.race([Promise.allSettled(loads), new Promise((r) => setTimeout(r, 2500))]);
}

async function save() {
  if (!S || !(S.photo || S.bg)) return;
  if (!S.dirtyMain && !S.dirtyThumb) {
    closeStudio({ silent: true });
    return;
  }
  dom.save.disabled = true;
  dom.save.textContent = "Saving…";
  try {
    closeEdit();
    await ensureFonts();
    let mainDataUrl = "";
    let full = null;
    for (const [w, q] of [[1080, 0.9], [1080, 0.82], [900, 0.82], [720, 0.8]]) {
      full = renderExport(w);
      mainDataUrl = encode(full, q);
      if (mainDataUrl.length <= MAX_DATA_URL_CHARS) break;
    }
    // Thumbnail: the square window, taken from the final cover (text included).
    const r = thumbRect();
    const k = full.width / W;
    const out = clamp(Math.round(r.side * k), 512, 1080);
    const tc = document.createElement("canvas");
    tc.width = out;
    tc.height = out;
    tc.getContext("2d").drawImage(full, r.sx * k, r.sy * k, r.side * k, r.side * k, 0, 0, out, out);
    const thumbDataUrl = encode(tc, 0.88);
    const result = {
      mainDataUrl: S.dirtyMain ? mainDataUrl : "",
      thumbDataUrl,
      thumbFrame: { scale: S.thumb.scale, offsetY: S.thumb.offsetY },
      mainChanged: S.dirtyMain,
    };
    const cb = S.onSave;
    closeStudio({ silent: true });
    await cb?.(result);
  } catch (e) {
    toast(`Couldn’t save the cover: ${e?.message || e}`, { durationMs: 3200 });
    if (S) {
      dom.save.disabled = false;
      dom.save.textContent = "Save";
    }
  }
}

/* ───────────────────────────── Open / close ───────────────────────────── */

function requestClose() {
  if (!S) return;
  if (S.editing) return closeEdit();
  if ((S.dirtyMain || S.dirtyThumb) && Date.now() - discardArmedAt > 2600) {
    discardArmedAt = Date.now();
    toast("Tap ✕ again to discard your changes", { durationMs: 2400 });
    haptic("light");
    return;
  }
  closeStudio({});
}

function closeStudio({ silent } = {}) {
  if (!S) return;
  const cb = S.onClose;
  S = null;
  discardArmedAt = 0;
  if (dom) {
    dom.root.classList.remove("is-open");
    const root = dom.root;
    window.setTimeout(() => { if (!S) root.hidden = true; }, 260);
    document.body.classList.remove("coverStudioOpen");
    dom.save.textContent = "Save";
  }
  if (!silent) { try { cb?.(); } catch {} }
}

export function isCoverStudioOpen() {
  return Boolean(S);
}

/**
 * @param {{trackId:string,title?:string,handle?:string,sourceUrl?:string,thumbFrame?:{scale:number,offsetY:number},
 *   canMagic?:boolean,onSave:(r:{mainDataUrl:string,thumbDataUrl:string,thumbFrame:{scale:number,offsetY:number},mainChanged:boolean})=>any,
 *   onMagic?:()=>any,onClose?:()=>any}} opts
 */
export async function openCoverStudio(opts = {}) {
  ensureDom();
  if (S) closeStudio({ silent: true });
  S = freshState(opts);
  const { root } = dom;
  root.hidden = false;
  document.body.classList.add("coverStudioOpen");
  syncUi();
  window.requestAnimationFrame(() => {
    root.classList.add("is-open");
    fitStage();
    requestRender();
  });
  await ensureFonts().catch(() => {});
  if (!S) return;
  if (opts.sourceUrl) {
    dom.root.classList.add("csLoading");
    await loadSource(opts.sourceUrl);
    dom.root.classList.remove("csLoading");
    if (!S) return;
  }
  syncUi();
  fitStage();
  requestRender();
  // soft ambient glow behind the stage: a tiny copy of the photo
  try {
    if (S.photo) {
      const a = document.createElement("canvas");
      a.width = 48;
      a.height = 85;
      a.getContext("2d").drawImage(S.photo, 0, 0, a.width, a.height);
      dom.amb.style.backgroundImage = `url("${a.toDataURL("image/jpeg", 0.6)}")`;
    } else {
      dom.amb.style.backgroundImage = "";
    }
  } catch {}
}
