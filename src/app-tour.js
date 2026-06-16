/**
 * Spotlight tours — home (5 steps) + v2 mini-tours (Persona, Friends).
 */

export const HOME_TOUR_STORAGE_KEY = "nabadai_home_tour_v1_done";
export const HOME_TOUR_VERSION = "1.2";
export const MINI_TOUR_VERSION = "2.0";

const PERSONA_TOUR_STORAGE_KEY = "nabadai_persona_tour_v1_done";
const FRIENDS_TOUR_STORAGE_KEY = "nabadai_friends_tour_v1_done";

const HOME_TOUR_STEPS = [
  {
    id: "welcome",
    title: "Welcome to NabadAi",
    body: "Make full songs in your language — no studio needed. This quick tour shows where to start.",
    target: null,
    route: "challenges",
  },
  {
    id: "create",
    title: "Create a song",
    body: "Tap here to write lyrics, pick a style, or hum a melody. We handle the rest.",
    hint: "Persona — add your own voice to songs when you're ready.",
    target: '[data-home-card="song"]',
    pad: 10,
    route: "challenges",
  },
  {
    id: "templates",
    title: "Start from a vibe",
    body: "Use live events and templates when you are not sure about style — we pre-fill the mood for you.",
    target: "#campaignBannerBtn",
    fallbackTarget: '[data-home-seg="templates"]',
    pad: 8,
    route: "challenges",
  },
  {
    id: "discover",
    title: "Discover",
    body: "Listen to other creators. When you publish, your songs can show up here too.",
    hint: "Friends — find people and share songs with them.",
    target: '[data-route-link="discover"]',
    pad: 8,
    route: "challenges",
  },
  {
    id: "profile",
    title: "Your library",
    body: "Profile holds every song you make — play, share, publish, or open song details.",
    target: '[data-route-link="profile"]',
    pad: 8,
    route: "challenges",
  },
];

const PERSONA_TOUR_STEPS = [
  {
    id: "persona-card",
    title: "Meet Persona",
    body: "Save your voice once — NabadAi can sing new songs sounding like you.",
    target: '[data-home-card="persona"]',
    pad: 10,
    route: "challenges",
  },
  {
    id: "persona-create",
    title: "Use it when you create",
    body: "Before Generate, pick your persona here — or tap + to record a new voice.",
    target: "#singerVoicePanel",
    fallbackTarget: "#singerPersonaRow",
    pad: 8,
    route: "generate",
    prepareStep: "personaGenerate",
  },
];

const FRIENDS_TOUR_STEPS = [
  {
    id: "friends-feed",
    title: "Your circle",
    body: "Friends is where you see songs and voice moments from people you follow.",
    target: "#friendsPage .discoveryStudioHead",
    fallbackTarget: '[data-route-link="friends"]',
    pad: 8,
    route: "friends",
  },
  {
    id: "friends-share",
    title: "Share something",
    body: "Tap + to post a song, caption, or shout-out to your followers.",
    target: "#friendsComposeOpenBtn",
    pad: 10,
    route: "friends",
  },
];

const TOURS = {
  home: {
    id: "home",
    storageKey: HOME_TOUR_STORAGE_KEY,
    steps: HOME_TOUR_STEPS,
    doneToast: "You're ready to create.",
    prepare() {
      ensureHomePanelForTour();
    },
  },
  persona: {
    id: "persona",
    storageKey: PERSONA_TOUR_STORAGE_KEY,
    steps: PERSONA_TOUR_STEPS,
    doneToast: "Persona is ready when you are.",
    prepare() {
      ensureHomePanelForTour();
    },
  },
  friends: {
    id: "friends",
    storageKey: FRIENDS_TOUR_STORAGE_KEY,
    steps: FRIENDS_TOUR_STEPS,
    doneToast: "Have fun sharing with your circle.",
    prepare() {},
  },
};

let _activeTourId = "home";
let _step = 0;
let _open = false;
let _deps = null;
let _inited = false;
let _resizeTimer = 0;
let _tourOfferedThisSession = false;
let _personaTourOfferedThisSession = false;
let _friendsTourOfferedThisSession = false;
let _positionTimer = 0;

function currentAppRoute() {
  return String(document.body.getAttribute("data-route") || "").trim();
}

function isTourElementVisible(el, requiredRoute = "") {
  if (!el || el.closest("[hidden]")) return false;
  let node = el;
  while (node && node !== document.body) {
    const st = getComputedStyle(node);
    if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) return false;
    node = node.parentElement;
  }
  if (requiredRoute) {
    const routeRoot = el.closest(`[data-route="${requiredRoute}"]`);
    if (!routeRoot) return false;
    if (getComputedStyle(routeRoot).display === "none") return false;
  }
  const r = el.getBoundingClientRect();
  return r.width > 4 && r.height > 4;
}

function visibleTourTarget(primary, fallback, requiredRoute = "") {
  const trySel = (sel) => {
    if (!sel) return null;
    const nodes = document.querySelectorAll(sel);
    for (const el of nodes) {
      if (isTourElementVisible(el, requiredRoute)) return el;
    }
    return null;
  };
  return trySel(primary) || trySel(fallback);
}

function getTour(tourId = _activeTourId) {
  return TOURS[String(tourId || "home")] || TOURS.home;
}

function getActiveSteps() {
  return getTour().steps || HOME_TOUR_STEPS;
}

export function isHomeTourComplete() {
  return isTourComplete("home");
}

export function isTourComplete(tourId) {
  const tour = getTour(tourId);
  if (!tour?.storageKey) return false;
  try {
    return localStorage.getItem(tour.storageKey) === "1";
  } catch {
    return false;
  }
}

export function markHomeTourComplete() {
  markTourComplete("home");
}

function markTourComplete(tourId) {
  const tour = getTour(tourId);
  if (!tour?.storageKey) return;
  try {
    localStorage.setItem(tour.storageKey, "1");
  } catch {}
}

export function resetHomeTour() {
  resetTour("home");
}

function resetTour(tourId) {
  const tour = getTour(tourId);
  if (!tour?.storageKey) return;
  try {
    localStorage.removeItem(tour.storageKey);
  } catch {}
  if (_activeTourId === tourId) _step = 0;
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
        <button type="button" class="ghost appTourSkip" id="btnAppTourSkip">Don't show again</button>
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

function closeTour(markDone) {
  const closingId = _activeTourId;
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
  if (markDone) {
    markTourComplete(closingId);
    if (closingId === "home") {
      window.setTimeout(() => schedulePersonaTourIfNeeded(), 2800);
    }
  }
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
    ? visibleTourTarget(stepDef.target, stepDef.fallbackTarget, String(stepDef.route || "").trim())
    : null;

  root.classList.toggle("appTour--spot", Boolean(target));
  root.classList.toggle("appTour--welcome", !target);

  if (target) {
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

function prepareTourStep(stepDef) {
  const key = String(stepDef?.prepareStep || "").trim();
  if (!key) return;
  try {
    _deps?.onTourStepPrepare?.(_activeTourId, _step, key);
  } catch {}
}

function schedulePositionTourUi(stepDef) {
  clearTimeout(_positionTimer);
  const route = String(stepDef?.route || "").trim();
  const delay = route === "generate" ? 360 : route ? 140 : 80;
  _positionTimer = window.setTimeout(() => {
    if (!_open) return;
    const target = stepDef?.target
      ? visibleTourTarget(stepDef.target, stepDef.fallbackTarget, route)
      : null;
    if (target) {
      try {
        target.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
      } catch {
        try {
          target.scrollIntoView({ block: "center", inline: "nearest" });
        } catch {}
      }
    }
    window.requestAnimationFrame(() => {
      if (_open) positionTourUi(stepDef);
    });
  }, delay);
}

function renderTourStep() {
  const steps = getActiveSteps();
  const stepDef = steps[_step];
  if (!stepDef) return;
  const requiredRoute = String(stepDef.route || "").trim();
  if (requiredRoute && currentAppRoute() !== requiredRoute) {
    void ensureStepRoute(stepDef).then(() => renderTourStep());
    return;
  }
  prepareTourStep(stepDef);
  ensureHomeTourDom();
  const kicker = document.getElementById("appTourKicker");
  const title = document.getElementById("appTourTitle");
  const body = document.getElementById("appTourBody");
  const hint = ensureTourHintEl();
  const next = document.getElementById("btnAppTourNext");
  const skip = document.getElementById("btnAppTourSkip");
  const progress = document.getElementById("appTourProgress");
  const isLast = _step >= steps.length - 1;
  if (kicker) kicker.textContent = `Step ${_step + 1} of ${steps.length}`;
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
    progress.innerHTML = steps
      .map(
        (s, i) =>
          `<span class="appTourDot${i === _step ? " isActive" : i < _step ? " isDone" : ""}"></span>`,
      )
      .join("");
  }
  schedulePositionTourUi(stepDef);
}

function advanceTour() {
  const tour = getTour();
  const steps = tour.steps || [];
  if (_step >= steps.length - 1) {
    const toast = tour.doneToast || "You're ready to create.";
    closeTour(true);
    try {
      _deps?.haptic?.("light");
    } catch {}
    try {
      _deps?.showToast?.(toast, { icon: "✓", durationMs: 2600 });
    } catch {}
    return;
  }
  _step += 1;
  try {
    _deps?.haptic?.("light");
  } catch {}
  void ensureStepRoute(getActiveSteps()[_step]).then(() => renderTourStep());
}

function showTourOverlay({ tourId = _activeTourId, step = 0 } = {}) {
  _activeTourId = tourId;
  _step = step;
  _open = true;
  const root = ensureHomeTourDom();
  root.hidden = false;
  root.setAttribute("aria-hidden", "false");
  lockTourScroll();
  renderTourStep();
  root.classList.add("isOpen");
}

function routeHashFor(route) {
  const r = String(route || "").trim();
  return r ? `#/${r}` : "#/challenges";
}

function ensureStepRoute(stepDef) {
  const route = String(stepDef?.route || "").trim();
  if (!route) return Promise.resolve();
  try {
    location.hash = routeHashFor(route);
  } catch {}
  try {
    _deps?.applyRoute?.();
  } catch {}
  getTour().prepare?.();
  return new Promise((resolve) => {
    const stepDef = getActiveSteps()[_step];
    prepareTourStep(stepDef);
    window.requestAnimationFrame(() => {
      window.setTimeout(resolve, route === "generate" ? 320 : 120);
    });
  });
}

function ensureHomePanelForTour() {
  const startBtn = document.querySelector('[data-home-seg="start"]');
  if (startBtn && !startBtn.classList.contains("is-active")) {
    startBtn.click?.();
  }
}

function openTour(tourId, { force = false } = {}) {
  const tour = getTour(tourId);
  if (!tour) return;
  if (!force && isTourComplete(tourId)) return;
  if (_open) return;
  _activeTourId = tourId;
  _step = 0;
  void ensureStepRoute(tour.steps[0]).then(() => showTourOverlay({ tourId, step: 0 }));
}

export function openHomeTour(opts) {
  openTour("home", opts);
}

export function scheduleHomeTourIfNeeded() {
  if (_tourOfferedThisSession || isTourComplete("home")) return;
  if (typeof _deps?.shouldOfferHomeTour === "function" && !_deps.shouldOfferHomeTour()) return;
  const route = String(document.body.getAttribute("data-route") || "");
  if (route !== "challenges") return;
  _tourOfferedThisSession = true;
  window.requestAnimationFrame(() => {
    window.setTimeout(() => openTour("home", { force: false }), 520);
  });
}

export function schedulePersonaTourIfNeeded() {
  if (_open || _personaTourOfferedThisSession || isTourComplete("persona")) return;
  if (!isTourComplete("home")) return;
  if (typeof _deps?.shouldOfferHomeTour === "function" && !_deps.shouldOfferHomeTour()) return;
  const route = String(document.body.getAttribute("data-route") || "");
  if (route !== "challenges") return;
  _personaTourOfferedThisSession = true;
  window.setTimeout(() => openTour("persona", { force: false }), 400);
}

export function scheduleFriendsTourIfNeeded() {
  if (_open || _friendsTourOfferedThisSession || isTourComplete("friends")) return;
  if (!isTourComplete("home")) return;
  if (typeof _deps?.shouldOfferHomeTour === "function" && !_deps.shouldOfferHomeTour()) return;
  const route = String(document.body.getAttribute("data-route") || "");
  if (route !== "friends") return;
  _friendsTourOfferedThisSession = true;
  window.setTimeout(() => openTour("friends", { force: false }), 520);
}

export function replayHomeTour() {
  resetTour("home");
  _activeTourId = "home";
  showTourOverlay({ tourId: "home", step: 0 });
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

export function replayPersonaTour() {
  resetTour("persona");
  _activeTourId = "persona";
  _step = 0;
  _open = true;
  lockTourScroll();
  ensureHomeTourDom();
  const root = document.getElementById("appTour");
  if (root) {
    root.hidden = false;
    root.setAttribute("aria-hidden", "false");
    root.classList.add("isOpen");
  }
  try {
    location.hash = "#/challenges";
  } catch {}
  try {
    _deps?.applyRoute?.();
  } catch {}
  ensureHomePanelForTour();
  void ensureStepRoute(PERSONA_TOUR_STEPS[0]).then(() => renderTourStep());
}

export function replayFriendsTour() {
  resetTour("friends");
  _activeTourId = "friends";
  showTourOverlay({ tourId: "friends", step: 0 });
  try {
    location.hash = "#/friends";
  } catch {}
  try {
    _deps?.applyRoute?.();
  } catch {}
  window.requestAnimationFrame(() => {
    if (_open) renderTourStep();
  });
}

function onTourResize() {
  if (!_open) return;
  clearTimeout(_resizeTimer);
  _resizeTimer = window.setTimeout(() => {
    renderTourStep();
  }, 120);
}

/**
 * @param {{ applyRoute: () => void, haptic?: (kind: string) => void, showToast?: Function, shouldOfferHomeTour?: () => boolean, onTourStepPrepare?: (tourId: string, stepIndex: number, key: string) => void }} deps
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
      closeTour(true);
    });
  }
  if (next) {
    next.addEventListener("click", () => advanceTour());
  }
  window.addEventListener("resize", onTourResize, { passive: true });
  window.addEventListener("orientationchange", onTourResize, { passive: true });
}
