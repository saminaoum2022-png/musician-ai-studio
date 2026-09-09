/**
 * Nabad Vibe — admin-only Create tab (song vibe read).
 * Hidden until launch — dev phone: npm run run:ios:vibe
 */

import { NABAD_VIBE_PUBLIC_SHIPPED } from "./feature-flags.js";

let bridge = {};

function clientVibeUiBaked() {
  try {
    return Boolean(window.__NABAD_CLIENT_ENV__?.nabadVibeUi);
  } catch {
    return false;
  }
}

export function nabadVibeEnabled() {
  try {
    if (NABAD_VIBE_PUBLIC_SHIPPED) {
      return Boolean(typeof bridge.isAdmin === "function" && bridge.isAdmin());
    }
    return Boolean(
      clientVibeUiBaked()
      && typeof bridge.isAdmin === "function"
      && bridge.isAdmin(),
    );
  } catch {
    return false;
  }
}

export function configureNabadVibe(b) {
  bridge = b || {};
}

export function syncNabadVibeCreateTab() {
  const photoSolo = Boolean(document.body.getAttribute("data-photo-solo-challenge"));
  const show = nabadVibeEnabled() && !photoSolo;
  const tab = document.getElementById("createTabVibe");
  if (tab) {
    tab.hidden = !show;
    tab.style.display = show ? "" : "none";
    tab.setAttribute("aria-hidden", show ? "false" : "true");
  }
  if (!show) {
    const active = tab?.classList.contains("isActive");
    if (active && typeof bridge.setActiveCreateTab === "function") {
      bridge.setActiveCreateTab("lyrics");
      return;
    }
  }
  // Pane visibility is owned by setActiveCreateTab — re-sync so vibe unhide never leaks.
  if (typeof bridge.setActiveCreateTab === "function") {
    const mode =
      (typeof bridge.getActiveCreateTab === "function" && bridge.getActiveCreateTab())
      || document.querySelector(".createPanes")?.dataset?.mode
      || "lyrics";
    bridge.setActiveCreateTab(mode);
  }
}
