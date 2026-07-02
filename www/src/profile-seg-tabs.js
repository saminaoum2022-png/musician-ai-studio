/** Profile segment bar — icon-only tabs, white active / muted inactive. */
export function setProfileSegActive(segment) {
  const bar = document.querySelector(".profileSegBar");
  if (!bar) return;
  const val = String(segment ?? "");
  bar.querySelectorAll("[data-profile-songs-segment]").forEach((btn) => {
    const on = String(btn.getAttribute("data-profile-songs-segment") || "") === val;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });
}

export function initProfileSegTabsOnce() {
  setProfileSegActive(document.querySelector(".profileSegTab.is-active")?.getAttribute("data-profile-songs-segment") || "activities");
}
