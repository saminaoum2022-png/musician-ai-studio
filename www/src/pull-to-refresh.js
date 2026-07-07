/**
 * Native-feeling pull-to-refresh for window-scrolled routes.
 * Moves scrollable content with the finger; spinner rides on the content block.
 */

export const PTR_REFRESH_OFFSET_PX = 44;
export const PTR_MAX_CONTENT_OFFSET_PX = 52;
export const PTR_MIN_SPIN_MS = 900;

/** Rubber-band: content follows finger, caps near 52px. */
export function ptrContentOffset(rawPullPx) {
  const t = Math.max(0, Number(rawPullPx) || 0);
  const max = PTR_MAX_CONTENT_OFFSET_PX;
  if (t <= max) return t * 0.94;
  const over = t - max;
  return max * 0.94 + max * 0.06 * (1 - Math.exp(-over / 36));
}

/**
 * @param {{
 *   triggerTabRefresh: (route: string, opts?: object) => boolean,
 *   getRoute: () => string,
 *   isRouteEnabled: () => boolean,
 *   isRefreshInFlight: (route: string) => boolean,
 *   haptic?: (style?: string) => void,
 * }} deps
 */
export function initPullToRefresh(deps) {
  const {
    triggerTabRefresh,
    getRoute,
    isRouteEnabled,
    isRefreshInFlight,
    haptic,
  } = deps;

  if (document.documentElement.dataset.ptrWired === "1") return;
  document.documentElement.dataset.ptrWired = "1";

  ensurePtrShells();

  let touchId = null;
  let startY = 0;
  let startX = 0;
  let pulling = false;
  let rawPull = 0;
  let contentOffset = 0;
  let refreshing = false;
  let verticalIntent = false;
  let activeMovable = null;

  function getMovable(route = getRoute()) {
    return document.querySelector(`.ptrMovable[data-ptr-route="${route}"]`);
  }

  function ensureSpinnerAnchor(movable) {
    if (!movable || movable.querySelector(".ptrSpinnerAnchor")) return;
    const anchor = document.createElement("div");
    anchor.className = "ptrSpinnerAnchor";
    anchor.setAttribute("aria-hidden", "true");
    anchor.innerHTML = `<span class="ptrSpinnerRing"></span>`;
    movable.insertBefore(anchor, movable.firstChild);
  }

  /** Skip PTR when the touch starts inside a nested scroll container (e.g. DM thread). */
  function ptrNestedScrollContainer(target) {
    let node = target instanceof Element ? target : null;
    while (node && node !== document.body && node !== document.documentElement) {
      const style = window.getComputedStyle(node);
      const oy = style.overflowY;
      if (
        (oy === "auto" || oy === "scroll" || oy === "overlay")
        && node.scrollHeight > node.clientHeight + 2
      ) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }

  function ensurePtrShells() {
    wrapDiscoverFeedBody();
    wrapSiblingsAfter(
      document.getElementById("friendsPage"),
      ".discoveryStudioHead",
      "friends",
    );
    wrapSiblingsAfter(
      document.getElementById("activityPage"),
      "#activityFilterTabs",
      "activity",
    );

    wrapProfileBody();
  }

  function wrapProfileBody() {
    const section = document.querySelector('section[data-route="profile"]');
    if (!section) return;

    // Legacy shell placed spinner above posts — unwrap if present.
    const legacy = section.querySelector('.profileSongsBlock .ptrMovable[data-ptr-route="profile"]');
    if (legacy) {
      const parent = legacy.parentNode;
      while (legacy.firstChild) parent.insertBefore(legacy.firstChild, legacy);
      legacy.remove();
    }

    if (section.querySelector(':scope > .ptrMovable[data-ptr-route="profile"]')) return;

    const aura = document.getElementById("profileAura");
    if (!aura) return;

    const wrap = document.createElement("div");
    wrap.className = "ptrMovable ptrMovable--profile";
    wrap.dataset.ptrRoute = "profile";
    section.insertBefore(wrap, aura);

    let node = aura;
    while (node) {
      const next = node.nextElementSibling;
      wrap.appendChild(node);
      node = next;
    }

    ensureSpinnerAnchor(wrap);
  }

  function wrapDiscoverFeedBody() {
    const main = document.getElementById("discoveryMainContent");
    if (!main || main.querySelector('.ptrMovable[data-ptr-route="discover"]')) return;
    const mount = document.getElementById("discoverFeedMount");
    if (!mount) return;
    const wrap = document.createElement("div");
    wrap.className = "ptrMovable";
    wrap.dataset.ptrRoute = "discover";
    mount.before(wrap);
    wrap.appendChild(mount);
    const status = document.getElementById("discoveryFeedStatus");
    if (status) wrap.appendChild(status);
    const list = document.getElementById("discoveryFeedList");
    if (list) wrap.appendChild(list);
    ensureSpinnerAnchor(wrap);
  }

  function wrapSiblingsAfter(section, afterSelector, route) {
    if (!section || section.querySelector(`.ptrMovable[data-ptr-route="${route}"]`)) return;
    const after = section.querySelector(afterSelector);
    if (!after) return;
    const wrap = document.createElement("div");
    wrap.className = "ptrMovable";
    wrap.dataset.ptrRoute = route;
    let node = after.nextElementSibling;
    while (node) {
      const next = node.nextElementSibling;
      wrap.appendChild(node);
      node = next;
    }
    if (!wrap.childElementCount) return;
    after.insertAdjacentElement("afterend", wrap);
    ensureSpinnerAnchor(wrap);
  }

  function setContentOffset(offsetPx, { animate = false, refreshing: isRefreshing = false } = {}) {
    contentOffset = Math.max(0, offsetPx);
    const route = getRoute();
    activeMovable = getMovable(route);
    if (!activeMovable) return;

    activeMovable.classList.toggle("isPtrSnapping", animate);
    activeMovable.classList.toggle("isPtrPulling", pulling && !isRefreshing && contentOffset > 2);
    activeMovable.classList.toggle("isPtrReady", contentOffset >= PTR_REFRESH_OFFSET_PX);
    activeMovable.classList.toggle("isPtrRefreshing", isRefreshing);

    activeMovable.style.setProperty("--ptr-offset", `${contentOffset}px`);
    const rotate = Math.min(300, (contentOffset / PTR_REFRESH_OFFSET_PX) * 300);
    activeMovable.style.setProperty("--ptr-rotate", `${rotate}deg`);

    if (animate) {
      window.setTimeout(() => {
        activeMovable?.classList.remove("isPtrSnapping");
      }, 380);
    }
  }

  function resetPull(animate = true) {
    pulling = false;
    touchId = null;
    rawPull = 0;
    verticalIntent = false;
    setContentOffset(0, { animate, refreshing: false });
    document.querySelectorAll(".ptrMovable.isPtrRefreshing").forEach((el) => {
      el.classList.remove("isPtrRefreshing", "isPtrPulling", "isPtrReady");
      el.style.removeProperty("--ptr-rotate");
      el.style.setProperty("--ptr-offset", "0px");
    });
  }

  async function waitForRefreshDone(route) {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (!isRefreshInFlight(route)) break;
      await new Promise((r) => window.setTimeout(r, 80));
    }
    await new Promise((r) => window.setTimeout(r, 120));
  }

  async function finishRefresh() {
    const route = getRoute();
    activeMovable = getMovable(route);
    if (!activeMovable) {
      refreshing = false;
      return;
    }

    pulling = false;
    activeMovable.classList.remove("isPtrSnapping", "isPtrPulling");
    activeMovable.classList.add("isPtrRefreshing");
    activeMovable.style.removeProperty("--ptr-rotate");
    setContentOffset(PTR_REFRESH_OFFSET_PX, { animate: true, refreshing: true });

    try {
      haptic?.("light");
    } catch {}

    const started = triggerTabRefresh(route, { source: "pull" });
    if (!started) {
      refreshing = false;
      resetPull(true);
      return;
    }

    const spinMin = new Promise((r) => window.setTimeout(r, PTR_MIN_SPIN_MS));
    await Promise.all([waitForRefreshDone(route), spinMin]);
    refreshing = false;
    resetPull(true);
  }

  document.addEventListener(
    "touchstart",
    (e) => {
      if (refreshing || pulling) return;
      if (!isRouteEnabled()) return;
      if (window.scrollY > 2) return;
      if (e.touches.length !== 1) return;
      if (ptrNestedScrollContainer(e.target)) return;
      ensurePtrShells();
      activeMovable = getMovable();
      if (!activeMovable) return;
      touchId = e.touches[0].identifier;
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      pulling = true;
      rawPull = 0;
      verticalIntent = false;
      activeMovable.classList.remove("isPtrSnapping");
    },
    { passive: true },
  );

  document.addEventListener(
    "touchmove",
    (e) => {
      if (!pulling || refreshing) return;
      if (!isRouteEnabled()) return;
      const touch = Array.from(e.touches).find((t) => t.identifier === touchId);
      if (!touch) return;
      if (window.scrollY > 2) {
        pulling = false;
        resetPull(false);
        return;
      }
      const dy = touch.clientY - startY;
      const dx = touch.clientX - startX;
      if (!verticalIntent) {
        if (Math.abs(dx) > Math.abs(dy) + 6) {
          pulling = false;
          resetPull(false);
          return;
        }
        if (dy > 8) verticalIntent = true;
      }
      if (dy <= 0) {
        rawPull = 0;
        setContentOffset(0);
        return;
      }
      e.preventDefault();
      rawPull = dy;
      setContentOffset(ptrContentOffset(dy));
    },
    { passive: false },
  );

  document.addEventListener(
    "touchend",
    (e) => {
      if (!pulling || refreshing) return;
      const ended = Array.from(e.changedTouches).some((t) => t.identifier === touchId);
      if (!ended) return;
      pulling = false;
      if (contentOffset >= PTR_REFRESH_OFFSET_PX) {
        refreshing = true;
        void finishRefresh();
      } else {
        resetPull(true);
      }
    },
    { passive: true },
  );

  document.addEventListener(
    "touchcancel",
    () => {
      if (pulling && !refreshing) resetPull(true);
    },
    { passive: true },
  );
}
