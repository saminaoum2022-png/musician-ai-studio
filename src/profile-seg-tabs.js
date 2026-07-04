/** Profile segment bar — icon-only tabs, white active / muted inactive. */
export function setProfileSegActive(segment) {
  const bar = document.querySelector(".profileSongsBlock .profileSegBar");
  if (!bar) return;
  const val = String(segment ?? "");
  bar.querySelectorAll("[data-profile-songs-segment]").forEach((btn) => {
    const on = String(btn.getAttribute("data-profile-songs-segment") || "") === val;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });
}

export function setUserPublicSegActive(segment) {
  const bar = document.getElementById("userPublicSegBar");
  if (!bar) return;
  const val = String(segment ?? "");
  bar.querySelectorAll("[data-user-public-segment]").forEach((btn) => {
    const on = String(btn.getAttribute("data-user-public-segment") || "") === val;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });
}

export function initProfileSegTabsOnce() {
  setProfileSegActive(
    document.querySelector(".profileSongsBlock .profileSegTab.is-active")?.getAttribute("data-profile-songs-segment") || "activities",
  );
}
