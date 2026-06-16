/**
 * Premium home spotlight tour — dim overlay + highlighted target, Next / Skip.
 */

export const HOME_TOUR_STORAGE_KEY = "nabadai_home_tour_v1_done";
export const HOME_TOUR_VERSION = "1.2";

const HOME_TOUR_STEPS = [
  {
    id: "welcome",
    title: "Welcome to NabadAi",
    body: "Make full songs in your language — no studio needed. This quick tour shows where to start.",
    target: null,
  },
  {
    id: "create",
    title: "Create a song",
    body: "Tap here to write lyrics, pick a style, or hum a melody. We handle the rest.",
    hint: "Persona — add your own voice to songs when you're ready.",
    target: '[data-home-card="song"]',
    pad: 10,
  },
  {
    id: "templates",
    title: "Start from a vibe",
    body: "Use live events and templates when you are not sure about style — we pre-fill the mood for you.",
    target: "#campaignBannerBtn",
    fallbackTarget: '[data-home-seg="templates"]',
    pad: 8,
  },
  {
    id: "discover",
    title: "Discover",
    body: "Listen to other creators. When you publish, your songs can show up here too.",
    hint: "Friends — find people and share songs with them.",
    target: '[data-route-link="discover"]',
    pad: 8,
  },
  {
    id: "profile",
    title: "Your library",
    body: "Profile holds every song you make — play, share, publish, or open song details.",
    target: '[data-route-link="profile"]',
    pad: 8,
  },
];

let _step = 0;
let _open = false;
let _deps = null;
let _inited = false;
let _resizeTimer = 0;

export function isHomeTourComplete() {
  try {
    return localStorage.getItem(HOME_TOUR_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markHomeTourComplete() {
  try {
    localStorage.setItem(HOME_TOUR_STORAGE_KEY, "1");
  } catch {}
}

export function resetHomeTour() {
  try {
    localStorage.removeItem(HOME_TOUR_STORAGE_KEY);
  } catch {}
  _step = 0;
}

function qs(sel, root = document) {
  return root.querySelector(sel);
}

function visibleTourTarget(primary, fallback) {
  const trySel = (sel) => {
    if (!sel) return null;
    const nodes = document.querySelectorAll(sel);
    for (const el of nodes) {
      if (!el || el.closest("[hidden]")) continue;
      const st = getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 4 && r.height > 4) return el;
    }
    return null;
  };
  return trySel(primary) || trySel(fallback);
}

function ensureHomeTourDom() {
  let root = document.getElementById("appTour");
  if (root && !root.querySelector(".appTourDimFill")) {
    root.remove();
    root = null;
  }
  if (root) return root;
  root = document.createElement("div");
  root.id = "appTour";
  root.className = "appTour";
  root.hidden = true;
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = `
    <div class="appTourDim" aria-hidden="true">
      <div class="appTourDimFill"></div>
      <div class="appTourDimShard appTourDimTop"></div>
      <div class="appTourDimShard appTourDimLeft"></div>
      <div class="appTourDimShard appTourDimRight"></div>
      <div class="appTourDimShard appTourDimBottom"></div>
    </div>
    <div id="appTourSpot" class="appTourSpot" aria-hidden="true"></div>
    <div class="appTourCard" role="dialog" aria-modal="true" aria-labelledby="appTourTitle">
      <div class="appTourGrab" aria-hidden="true"></div>
      <p id="appTourKicker" class="appTourKicker">Step 1 of 5</p>
      <h3 id="appTourTitle" class="appTourTitle">Welcome</h3>
      <p id="appTourBody" class="appTourBody"></p>
      <p id="appTourHint" class="appTourHint" hidden></p>
      <div class="appTourProgress" id="appTourProgress" aria-hidden="true"></div>
      <div class="appTourActions">
        <button type="button" class="ghost appTourSkip" id="btnAppTourSkip">Skip tour</button>
        <button type="button" class="primary appTourNext" id="btnAppTourNext">Next</button>
      </div>
    </div>
  `;
  document.body.appendChild(root);
  return root;
}

function lockTourScroll() {
  document.body.classList.add("appTourOpen");
  try {
    document.body.style.overflow = "hidden";
  } catch {}
}

function unlockTourScroll() {
  document.body.classList.remove("appTourOpen");
  try {
    document.body.style.overflow = "";
  } catch {}
}

function closeHomeTour(markDone) {
  _open = false;
  const root = document.getElementById("appTour");
  if (root) {
    root.classList.remove("isOpen");
    root.hidden = true;
    root.setAttribute("aria-hidden", "true");
  }
  const spot = document.getElementById("appTourSpot");
  if (spot) spot.hidden = true;
  unlockTourScroll();
  if (markDone) markHomeTourComplete();
}

function positionDimCutout(top, left, width, height) {
  const root = document.getElementById("appTour");
  if (!root) return;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const topEl = root.querySelector(".appTourDimTop");
  const leftEl = root.querySelector(".appTourDimLeft");
  const rightEl = root.querySelector(".appTourDimRight");
  const bottomEl = root.querySelector(".appTourDimBottom");
  if (topEl) {
    topEl.style.top = "0";
    topEl.style.left = "0";
    topEl.style.width = "100%";
    topEl.style.height = `${Math.max(0, top)}px`;
  }
  if (bottomEl) {
    bottomEl.style.top = `${top + height}px`;
    bottomEl.style.left = "0";
    bottomEl.style.width = "100%";
    bottomEl.style.height = `${Math.max(0, vh - top - height)}px`;
  }
  if (leftEl) {
    leftEl.style.top = `${top}px`;
    leftEl.style.left = "0";
    leftEl.style.width = `${Math.max(0, left)}px`;
    leftEl.style.height = `${height}px`;
  }
  if (rightEl) {
    rightEl.style.top = `${top}px`;
    rightEl.style.left = `${left + width}px`;
    rightEl.style.width = `${Math.max(0, vw - left - width)}px`;
    rightEl.style.height = `${height}px`;
  }
}

function positionTourUi(stepDef) {
  const root = ensureHomeTourDom();
  const spot = document.getElementById("appTourSpot");
  const card = root.querySelector(".appTourCard");
  if (!spot || !card) return;

  const pad = Number(stepDef?.pad || 10);
  const margin = 12;
  const gap = 14;
  const target = stepDef?.target
    ? visibleTourTarget(stepDef.target, stepDef.fallbackTarget)
    : null;

  root.classList.toggle("appTour--spot", Boolean(target));
  root.classList.toggle("appTour--welcome", !target);

  if (target) {
    try {
      target.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    } catch {}
    const r = target.getBoundingClientRect();
    const top = Math.max(8, r.top - pad);
    const left = Math.max(8, r.left - pad);
    const width = Math.min(window.innerWidth - 16, r.width + pad * 2);
    const height = Math.min(window.innerHeight - 16, r.height + pad * 2);
    positionDimCutout(top, left, width, height);
    spot.hidden = false;
    spot.style.top = `${top}px`;
    spot.style.left = `${left}px`;
    spot.style.width = `${width}px`;
    spot.style.height = `${height}px`;
    spot.style.borderRadius = `${Math.min(22, Math.max(14, height * 0.18))}px`;

    const cardWidth = Math.min(420, window.innerWidth - margin * 2);
    card.style.width = `${cardWidth}px`;
    card.style.maxWidth = `${cardWidth}px`;
    card.style.right = "auto";
    card.style.bottom = "auto";
    card.style.transform = "none";
    card.classList.remove("appTourCard--center");

    const cardH = card.offsetHeight || 200;
    const inBottomNav = Boolean(target.closest?.(".mobileTabbar"));
    const targetMidX = left + width / 2;
    let cardLeft = targetMidX - cardWidth / 2;
    cardLeft = Math.max(margin, Math.min(cardLeft, window.innerWidth - cardWidth - margin));

    let cardTop;
    if (inBottomNav || top + height > window.innerHeight * 0.52) {
      cardTop = top - cardH - gap;
      if (cardTop < margin) cardTop = margin;
    } else {
      cardTop = top + height + gap;
      if (cardTop + cardH > window.innerHeight - margin) {
        cardTop = Math.max(margin, top - cardH - gap);
      }
    }

    card.style.top = `${cardTop}px`;
    card.style.left = `${cardLeft}px`;
  } else {
    spot.hidden = true;
    card.style.width = "";
    card.style.maxWidth = "";
    card.style.top = "";
    card.style.left = "";
    card.style.right = "";
    card.style.bottom = "";
    card.style.transform = "";
    card.classList.add("appTourCard--center");
  }
}

function ensureTourHintEl() {
  let hint = document.getElementById("appTourHint");
  if (hint) return hint;
  const body = document.getElementById("appTourBody");
  if (!body) return null;
  hint = document.createElement("p");
  hint.id = "appTourHint";
  hint.className = "appTourHint";
  hint.hidden = true;
  body.insertAdjacentElement("afterend", hint);
  return hint;
}

function renderTourStep() {
  const stepDef = HOME_TOUR_STEPS[_step];
  if (!stepDef) return;
  ensureHomeTourDom();
  const kicker = document.getElementById("appTourKicker");
  const title = document.getElementById("appTourTitle");
  const body = document.getElementById("appTourBody");
  const hint = ensureTourHintEl();
  const next = document.getElementById("btnAppTourNext");
  const skip = document.getElementById("btnAppTourSkip");
  const progress = document.getElementById("appTourProgress");
  const isLast = _step >= HOME_TOUR_STEPS.length - 1;
  if (kicker) kicker.textContent = `Step ${_step + 1} of ${HOME_TOUR_STEPS.length}`;
  if (title) title.textContent = stepDef.title;
  if (body) body.textContent = stepDef.body;
  if (hint) {
    const hintText = String(stepDef.hint || "").trim();
    hint.textContent = hintText;
    hint.hidden = !hintText;
  }
  if (next) next.textContent = isLast ? "Done" : "Next";
  if (skip) {
    skip.hidden = !isLast;
    skip.textContent = "Don't show again";
  }
  const actions = skip?.closest?.(".appTourActions");
  if (actions) actions.classList.toggle("appTourActions--solo", !isLast);
  if (progress) {
    progress.innerHTML = HOME_TOUR_STEPS.map((s, i) =>
      `<span class="appTourDot${i === _step ? " isActive" : i < _step ? " isDone" : ""}"></span>`,
    ).join("");
  }
  window.requestAnimationFrame(() => {
    positionTourUi(stepDef);
    window.requestAnimationFrame(() => positionTourUi(stepDef));
  });
}

function advanceHomeTour() {
  if (_step >= HOME_TOUR_STEPS.length - 1) {
    closeHomeTour(true);
    try {
      _deps?.haptic?.("light");
    } catch {}
    try {
      _deps?.showToast?.("You're ready to create.", { icon: "✓", durationMs: 2600 });
    } catch {}
    return;
  }
  _step += 1;
  try {
    _deps?.haptic?.("light");
  } catch {}
  renderTourStep();
}

function showHomeTourOverlay({ step = 0 } = {}) {
  _step = step;
  _open = true;
  const root = ensureHomeTourDom();
  root.hidden = false;
  root.setAttribute("aria-hidden", "false");
  lockTourScroll();
  renderTourStep();
  root.classList.add("isOpen");
}

export function openHomeTour({ force = false } = {}) {
  if (!force && isHomeTourComplete()) return;
  if (_open) return;
  const route = String(document.body.getAttribute("data-route") || "");
  if (route !== "challenges") return;

  ensureHomePanelForTour();
  showHomeTourOverlay({ step: 0 });
}

function finishHomeTourNavigation() {
  try {
    location.hash = "#/challenges";
  } catch {}
  try {
    _deps?.applyRoute?.();
  } catch {}
  window.requestAnimationFrame(() => {
    ensureHomePanelForTour();
    if (_open) renderTourStep();
  });
}

function ensureHomePanelForTour() {
  const startBtn = document.querySelector('[data-home-seg="start"]');
  if (startBtn && !startBtn.classList.contains("is-active")) {
    startBtn.click?.();
  }
}

let _tourOfferedThisSession = false;

export function scheduleHomeTourIfNeeded() {
  if (_tourOfferedThisSession || isHomeTourComplete()) return;
  if (typeof _deps?.shouldOfferHomeTour === "function" && !_deps.shouldOfferHomeTour()) return;
  _tourOfferedThisSession = true;
  window.requestAnimationFrame(() => {
    window.setTimeout(() => openHomeTour({ force: false }), 520);
  });
}

export function replayHomeTour() {
  resetHomeTour();
  showHomeTourOverlay({ step: 0 });
  finishHomeTourNavigation();
}

function onTourResize() {
  if (!_open) return;
  clearTimeout(_resizeTimer);
  _resizeTimer = window.setTimeout(() => {
    renderTourStep();
  }, 120);
}

/**
 * @param {{ applyRoute: () => void, haptic?: (kind: string) => void, showToast?: Function, shouldOfferHomeTour?: () => boolean }} deps
 */
export function initAppTour(deps) {
  if (_inited) return;
  _inited = true;
  _deps = deps || null;
  ensureHomeTourDom();
  const skip = document.getElementById("btnAppTourSkip");
  const next = document.getElementById("btnAppTourNext");
  if (skip) {
    skip.addEventListener("click", () => {
      try {
        _deps?.haptic?.("light");
      } catch {}
      closeHomeTour(true);
    });
  }
  if (next) {
    next.addEventListener("click", () => advanceHomeTour());
  }
  window.addEventListener("resize", onTourResize, { passive: true });
  window.addEventListener("orientationchange", onTourResize, { passive: true });
}
