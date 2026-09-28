/** Profile segment bar — icon-only tabs, white active / muted inactive. */
export function setProfileSegActive(segment) {
  const bar = document.querySelector(".profileSongsBlock .profileSegBar");
  if (!bar) return;
  const val = String(segment ?? "");
  // Library = drafts (Songs) + Playlists. Studio is its own top tab (mic).
  const inLibrary = val === "all" || val === "playlist";
  bar.querySelectorAll("[data-profile-songs-segment]").forEach((btn) => {
    const on = String(btn.getAttribute("data-profile-songs-segment") || "") === val;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });
  bar.querySelectorAll("[data-profile-lib-tab]").forEach((btn) => {
    btn.classList.toggle("is-active", inLibrary);
    btn.setAttribute("aria-selected", inLibrary ? "true" : "false");
  });
  document.querySelectorAll(".profileLibChips [data-profile-songs-segment]").forEach((btn) => {
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
  const active = document.querySelector(".profileSongsBlock .profileSegTab.is-active");
  const seg =
    active?.getAttribute("data-profile-songs-segment")
    || (active?.hasAttribute("data-profile-lib-tab") ? "all" : "")
    || "all";
  setProfileSegActive(seg);
}
