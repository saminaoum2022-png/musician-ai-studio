/**
 * Phase A — first-run onboarding (welcome + feature slides → auth / home).
 */

export const ONBOARDING_STORAGE_KEY = "nabadai_onboarding_v2_done";
export const ONBOARDING_ACTIVE_KEY = "nabadai_onboarding_active";

const SLIDE_COUNT = 5;

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
      return localStorage.getItem(onboardingUserKey(uid)) === "1";
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
  if (!session?.user?.id && !isOnboardingComplete()) {
    return "#/onboarding";
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
  root.querySelectorAll("[data-onboarding-slide]").forEach((el) => {
    const idx = Number(el.getAttribute("data-onboarding-slide"));
    const on = idx === _step;
    el.classList.toggle("is-active", on);
    el.setAttribute("aria-hidden", on ? "false" : "true");
  });
  root.querySelectorAll("[data-onboarding-dot]").forEach((dot) => {
    const idx = Number(dot.getAttribute("data-onboarding-dot"));
    dot.classList.toggle("is-active", idx === _step);
    dot.setAttribute("aria-current", idx === _step ? "step" : "false");
  });
  const btn = qs("#btnOnboardingNext");
  if (btn) {
    btn.textContent = _step >= SLIDE_COUNT - 1 ? "Continue" : "Next";
  }
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
  const session = typeof _deps?.getAuthSession === "function" ? _deps.getAuthSession() : null;
  const uid = String(session?.user?.id || "").trim();
  markOnboardingComplete(uid);
  let hash = "#/auth";
  if (uid) {
    hash = "#/challenges";
    try { _deps?.queueSignupCoachWelcome?.(uid); } catch {}
  } else {
    hash = getPostOnboardingHash(_deps?.getAuthSession);
  }
  try {
    location.hash = hash;
  } catch {}
  try {
    _deps?.applyRoute?.();
  } catch {}
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
  if (_step >= SLIDE_COUNT - 1) {
    finishOnboarding();
    return;
  }
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
  const nextBtn = qs("#btnOnboardingNext");
  const skipBtn = qs("#btnOnboardingSkip");
  const replayBtn = qs("#btnSettingsReplayOnboarding");

  if (getStarted) {
    getStarted.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      goToOnboarding();
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener("click", (e) => {
      e.preventDefault();
      advanceOnboarding();
    });
  }
  if (skipBtn) {
    skipBtn.addEventListener("click", (e) => {
      e.preventDefault();
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

  document.querySelectorAll("[data-onboarding-dot]").forEach((dot) => {
    dot.addEventListener("click", () => {
      const idx = Number(dot.getAttribute("data-onboarding-dot"));
      if (Number.isFinite(idx)) {
        setStep(idx);
        syncOnboardingHash();
      }
    });
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
