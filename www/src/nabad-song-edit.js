/**
 * Nabad Edit — admin-only Create tab (ElevenLabs song inpaint / section rewrite).
 * Hidden until launch — staging bake: nabadSongEditUi.
 */

import { NABAD_SONG_EDIT_PUBLIC_SHIPPED } from "./feature-flags.js";

let bridge = {};

function clientSongEditUiBaked() {
  try {
    return Boolean(window.__NABAD_CLIENT_ENV__?.nabadSongEditUi);
  } catch {
    return false;
  }
}

export function nabadSongEditEnabled() {
  try {
    if (NABAD_SONG_EDIT_PUBLIC_SHIPPED) {
      return Boolean(typeof bridge.isAdmin === "function" && bridge.isAdmin());
    }
    return Boolean(
      clientSongEditUiBaked()
      && typeof bridge.isAdmin === "function"
      && bridge.isAdmin(),
    );
  } catch {
    return false;
  }
}

export function configureNabadSongEdit(b) {
  bridge = b || {};
}

export function syncNabadSongEditCreateTab() {
  const photoSolo = Boolean(document.body.getAttribute("data-photo-solo-challenge"));
  const show = nabadSongEditEnabled() && !photoSolo;
  const tab = document.getElementById("createTabEdit");
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
  if (typeof bridge.setActiveCreateTab === "function") {
    const mode =
      (typeof bridge.getActiveCreateTab === "function" && bridge.getActiveCreateTab())
      || document.querySelector(".createPanes")?.dataset?.mode
      || "lyrics";
    bridge.setActiveCreateTab(mode);
  }
}
