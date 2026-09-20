/**
 * Nabad Edit — admin-only section rewrite (ElevenLabs inpaint).
 * Hidden until launch — staging bake: nabadSongEditUi.
 * Entry is the song ⋯ sheet ("Edit"), not a Create tab.
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
  const tab = document.getElementById("createTabEdit");
  if (tab) {
    tab.hidden = true;
    tab.style.display = "none";
    tab.setAttribute("aria-hidden", "true");
  }
  const photoSolo = Boolean(document.body.getAttribute("data-photo-solo-challenge"));
  const allowed = nabadSongEditEnabled() && !photoSolo;
  const mode =
    (typeof bridge.getActiveCreateTab === "function" && bridge.getActiveCreateTab())
    || document.querySelector(".createPanes")?.dataset?.mode
    || "lyrics";
  if (mode === "edit" && !allowed && typeof bridge.setActiveCreateTab === "function") {
    bridge.setActiveCreateTab("lyrics");
  }
}
