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
  const show = nabadVibeEnabled();
  const tab = document.getElementById("createTabVibe");
  const pane = document.querySelector(".createPane--vibe");
  [tab, pane].forEach((el) => {
    if (!el) return;
    el.hidden = !show;
    el.style.display = show ? "" : "none";
    if (tab) tab.setAttribute("aria-hidden", show ? "false" : "true");
  });
  if (!show) {
    const active = document.getElementById("createTabVibe")?.classList.contains("isActive");
    if (active && typeof bridge.setActiveCreateTab === "function") {
      bridge.setActiveCreateTab("lyrics");
    }
  }
}
