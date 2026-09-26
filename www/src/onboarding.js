/**
 * Phase A — first-run onboarding (welcome + feature slides → auth / home).
 */

export const ONBOARDING_STORAGE_KEY = "nabadai_onboarding_v2_done";
export const ONBOARDING_ACTIVE_KEY = "nabadai_onboarding_active";

const SLIDE_COUNT = 3;
const AUTO_ADVANCE_MS = 6000;
export const FIRST_RUN_LANDING_KEY = "nabadai_first_run_landing";

let _step = 0;
let _deps = null;
let _inited = false;

function onboardingUserKey(userId) {
  return `${ONBOARDING_STORAGE_KEY}:${String(userId || "").trim()}`;
}

export function isOnboardingComplete(userId) {
  const uid = String(userId || "").trim();
  if (uid) {
    try {
      // Onboarding runs before sign-in now, so the device flag counts for the account too.
      return localStorage.getItem(onboardingUserKey(uid)) === "1"
        || localStorage.getItem(ONBOARDING_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  }
  try {
    return localStorage.getItem(ONBOARDING_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function shouldShowOnboardingForUser(userId) {
  const uid = String(userId || "").trim();
  if (!uid) return !isOnboardingComplete();
  return !isOnboardingComplete(uid);
}

export function isOnboardingActive() {
  try {
    return sessionStorage.getItem(ONBOARDING_ACTIVE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markOnboardingComplete(userId) {
  const uid = String(userId || "").trim();
  try {
    if (uid) localStorage.setItem(onboardingUserKey(uid), "1");
    else localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
  } catch {}
  try {
    sessionStorage.removeItem(ONBOARDING_ACTIVE_KEY);
  } catch {}
}

export function resetOnboarding(userId) {
  const uid = String(userId || "").trim();
  try {
    localStorage.removeItem(ONBOARDING_STORAGE_KEY);
    if (uid) localStorage.removeItem(onboardingUserKey(uid));
  } catch {}
  try {
    sessionStorage.removeItem(ONBOARDING_ACTIVE_KEY);
  } catch {}
  _step = 0;
}

/** Settings / debug — full intro + slides again. */
export function replayOnboarding(userId) {
  resetOnboarding(userId);
  try {
    sessionStorage.setItem(ONBOARDING_ACTIVE_KEY, "1");
  } catch {}
  _step = 0;
  setStep(0);
  try {
    location.hash = "#/onboarding";
  } catch {}
  try {
    _deps?.applyRoute?.();
  } catch {}
}

export function shouldSkipIntroOrOnboardingRoute(userId) {
  if (isOnboardingActive()) return false;
  const uid = String(userId || "").trim();
  if (uid) return isOnboardingComplete(uid);
  return isOnboardingComplete();
}

export function getPostOnboardingHash(getAuthSession) {
  const session = typeof getAuthSession === "function" ? getAuthSession() : null;
  if (session?.user?.id) return "#/challenges";
  try {
    if (localStorage.getItem("nabadai_guest_mode_v1") === "1") return "#/challenges";
  } catch {}
  return "#/auth";
}

export function getInitialBootHash(getAuthSession) {
  const session = typeof getAuthSession === "function" ? getAuthSession() : null;
  if (session?.user?.id && shouldShowOnboardingForUser(session.user.id)) {
    return "#/onboarding";
  }
  if (!session?.user?.id && shouldShowOnboardingForUser("")) {
    let guest = false;
    try { guest = localStorage.getItem("nabadai_guest_mode_v1") === "1"; } catch {}
    // First launch on this device, signed out: the tap-through pages come before sign-in.
    if (!guest) return "#/onboarding";
  }
  return getPostOnboardingHash(getAuthSession);
}

/** `#/onboarding` or `#/onboarding/2` → route key + step index. */
export function parseOnboardingRoute(route) {
  const raw = String(route || "").trim();
  if (raw === "onboarding") return { route: "onboarding", step: 0 };
  const m = raw.match(/^onboarding\/(\d+)$/);
  if (m) {
    const step = Math.max(0, Math.min(SLIDE_COUNT - 1, parseInt(m[1], 10) || 0));
    return { route: "onboarding", step };
  }
  return null;
}

function qs(sel, root = document) {
  return root.querySelector(sel);
}

function setStep(next) {
  _step = Math.max(0, Math.min(SLIDE_COUNT - 1, next));
  const root = qs("[data-onboarding-root]");
  if (!root) return;
  const last = _step >= SLIDE_COUNT - 1;
  root.querySelectorAll("[data-onboarding-slide]").forEach((el) => {
    const idx = Number(el.getAttribute("data-onboarding-slide"));
    const on = idx === _step;
    el.classList.toggle("is-active", on);
    el.setAttribute("aria-hidden", on ? "false" : "true");
  });
  root.querySelectorAll("[data-ob3-seg]").forEach((seg) => {
    const idx = Number(seg.getAttribute("data-ob3-seg"));
    seg.classList.remove("is-done", "is-current", "is-last");
    // Restart the fill animation on the current segment.
    if (idx < _step) seg.classList.add("is-done");
    else if (idx === _step) {
      void seg.offsetWidth;
      seg.classList.add(last ? "is-last" : "is-current");
    }
  });
  const skip = qs("#btnOnboardingSkip");
  if (skip) skip.hidden = last;
  const hint = qs("#ob3Hint");
  if (hint) hint.hidden = last;
  const cta = qs("#btnOnboardingGetStarted");
  if (cta) cta.hidden = !last;
  startAutoAdvance();
}

let _autoTimer = 0;
let _autoRemaining = AUTO_ADVANCE_MS;
let _autoStartedAt = 0;

function onboardingRouteIsActive() {
  return String(document.body.getAttribute("data-route") || "") === "onboarding";
}

function stopAutoAdvance() {
  if (_autoTimer) {
    clearTimeout(_autoTimer);
    _autoTimer = 0;
  }
}

/** Each page moves on by itself after about 6 s (not the last page, which waits for Get started). */
function startAutoAdvance(ms = AUTO_ADVANCE_MS) {
  stopAutoAdvance();
  _autoRemaining = ms;
  if (_step >= SLIDE_COUNT - 1) return;
  _autoStartedAt = Date.now();
  _autoTimer = window.setTimeout(() => {
    _autoTimer = 0;
    if (!onboardingRouteIsActive() || document.hidden) return;
    advanceOnboarding();
  }, ms);
}

function pauseAutoAdvance() {
  if (!_autoTimer) return;
  _autoRemaining = Math.max(400, _autoRemaining - (Date.now() - _autoStartedAt));
  stopAutoAdvance();
  qs("[data-onboarding-root] .ob3Inner")?.classList.add("is-paused");
}

function resumeAutoAdvance() {
  const inner = qs("[data-onboarding-root] .ob3Inner");
  inner?.classList.remove("is-paused");
  if (_step >= SLIDE_COUNT - 1) return;
  startAutoAdvance(_autoRemaining);
}

function syncOnboardingHash() {
  const hash = _step > 0 ? `#/onboarding/${_step}` : "#/onboarding";
  if (String(location.hash || "") !== hash) {
    try {
      history.replaceState(null, "", hash);
    } catch {
      try {
        location.hash = hash;
      } catch {}
    }
  }
}

function finishOnboarding() {
  stopAutoAdvance();
  const session = typeof _deps?.getAuthSession === "function" ? _deps.getAuthSession() : null;
  const uid = String(session?.user?.id || "").trim();
  markOnboardingComplete(uid);
  let hash = "#/auth";
  if (uid) {
    hash = "#/challenges";
  } else {
    // Signed out: sign in next, then land on the Create page.
    try { localStorage.setItem(FIRST_RUN_LANDING_KEY, "1"); } catch {}
    hash = getPostOnboardingHash(_deps?.getAuthSession);
  }
  try {
    location.hash = hash;
  } catch {}
  try {
    _deps?.applyRoute?.();
  } catch {}
}

/** True once, right after a first-run user signs in: send them to the Create page. */
export function consumeFirstRunLanding() {
  try {
    if (localStorage.getItem(FIRST_RUN_LANDING_KEY) !== "1") return false;
    localStorage.removeItem(FIRST_RUN_LANDING_KEY);
    return true;
  } catch {
    return false;
  }
}

function goToOnboarding() {
  try {
    sessionStorage.setItem(ONBOARDING_ACTIVE_KEY, "1");
  } catch {}
  _step = 0;
  setStep(0);
  try {
    location.hash = "#/onboarding";
  } catch {}
  try {
    _deps?.applyRoute?.();
  } catch {}
}

function advanceOnboarding() {
  if (_step >= SLIDE_COUNT - 1) return; // the last page waits for Get started

  setStep(_step + 1);
  syncOnboardingHash();
}

/**
 * @param {{ getAuthSession: () => object|null, applyRoute: () => void, queueSignupCoachWelcome?: (userId: string) => void }} deps
 */
export function initOnboarding(deps) {
  if (_inited) return;
  _inited = true;
  _deps = deps || null;

  const getStarted = qs("#btnIntroGetStarted");
  const doneBtn = qs("#btnOnboardingGetStarted");
  const skipBtn = qs("#btnOnboardingSkip");
  const replayBtn = qs("#btnSettingsReplayOnboarding");

  if (getStarted) {
    getStarted.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      goToOnboarding();
    });
  }
  if (doneBtn) {
    doneBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      finishOnboarding();
    });
  }
  if (skipBtn) {
    skipBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      finishOnboarding();
    });
  }
  if (replayBtn) {
    replayBtn.addEventListener("click", (e) => {
      e.preventDefault();
      try { replayBtn.blur(); } catch {}
      replayOnboarding(_deps?.getAuthSession?.()?.user?.id);
    });
  }

  // Tap the right two thirds for the next page, the left third for the previous one; hold to pause.
  const inner = qs("[data-onboarding-root] .ob3Inner");
  if (inner) {
    let downAt = 0;
    let downX = 0;
    let holdTimer = 0;
    let held = false;
    inner.addEventListener("pointerdown", (e) => {
      if (e.target.closest?.("button")) return;
      downAt = Date.now();
      downX = e.clientX;
      held = false;
      holdTimer = window.setTimeout(() => {
        held = true;
        pauseAutoAdvance();
      }, 220);
    });
    const release = (e, cancelled) => {
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = 0; }
      if (!downAt) return;
      const wasHeld = held;
      downAt = 0;
      held = false;
      if (wasHeld) {
        resumeAutoAdvance();
        return;
      }
      if (cancelled || e.target?.closest?.("button")) return;
      const w = inner.getBoundingClientRect().width || window.innerWidth || 1;
      if (downX < w / 3) {
        if (_step > 0) { setStep(_step - 1); syncOnboardingHash(); }
      } else {
        advanceOnboarding();
      }
    };
    inner.addEventListener("pointerup", (e) => release(e, false));
    inner.addEventListener("pointercancel", (e) => release(e, true));
  }
  document.addEventListener("visibilitychange", () => {
    if (!onboardingRouteIsActive()) return;
    if (document.hidden) pauseAutoAdvance();
    else resumeAutoAdvance();
  });

  setStep(0);
}

/** When route becomes onboarding, apply step from hash. */
export function onOnboardingRouteActive(routeRaw) {
  const parsed = parseOnboardingRoute(String(routeRaw || "onboarding").split(/[?#&]/)[0]);
  if (parsed) setStep(parsed.step);
  else setStep(_step);
  try {
    sessionStorage.setItem(ONBOARDING_ACTIVE_KEY, "1");
  } catch {}
  const panel = qs('[data-route="onboarding"]');
  if (panel) {
    panel.style.display = "flex";
  }
}
