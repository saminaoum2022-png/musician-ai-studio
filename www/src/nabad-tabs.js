/** Shared minimal text-only tab bar — active tab highlighted in white. */
export const NABAD_TAB_ACTIVE_CLASS = "is-active";

export function getNabadTabsTrack(navEl) {
  if (!navEl) return null;
  return navEl.querySelector(".nabadTabsTrack") || navEl;
}

function scrollActiveTabIntoView(navEl) {
  const track = getNabadTabsTrack(navEl);
  if (!track || track.scrollWidth <= track.clientWidth) return;
  const active =
    track.querySelector(".nabadTabsTab.is-active") ||
    track.querySelector(".nabadTabsTab.isActive") ||
    track.querySelector('[role="tab"].is-active') ||
    track.querySelector('[role="tab"].isActive');
  if (!active) return;
  try {
    const tabLeft = active.offsetLeft;
    const tabRight = tabLeft + active.offsetWidth;
    const viewLeft = track.scrollLeft;
    const viewRight = viewLeft + track.clientWidth;
    if (tabLeft < viewLeft) {
      track.scrollTo({ left: Math.max(0, tabLeft - 8), behavior: "smooth" });
    } else if (tabRight > viewRight) {
      track.scrollTo({ left: tabRight - track.clientWidth + 8, behavior: "smooth" });
    }
  } catch {}
}

export function setNabadTabsActiveByAttr(navEl, activeValue, attrName) {
  if (!navEl || !attrName) return;
  const val = String(activeValue ?? "");
  navEl.querySelectorAll(`[${attrName}]`).forEach((btn) => {
    const on = String(btn.getAttribute(attrName) || "") === val;
    btn.classList.toggle(NABAD_TAB_ACTIVE_CLASS, on);
    btn.classList.remove("isActive");
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });
  scrollActiveTabIntoView(navEl);
}
