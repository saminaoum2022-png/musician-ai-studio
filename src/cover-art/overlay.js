/**
 * Subtle player-only overlay on static cover art — calm premium motion.
 * Does not distort the image; breathing glow, shimmer, particles, micro-zoom.
 */

let _overlayReady = false;

function overlayEl() {
  return document.getElementById("coverArtLiveOverlay");
}

export function initCoverArtOverlay() {
  if (_overlayReady) return;
  _overlayReady = true;
  const stage = document.querySelector(".playerArtStage");
  if (!stage || document.getElementById("coverArtLiveOverlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "coverArtLiveOverlay";
  overlay.className = "coverArtLiveOverlay";
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = `
    <span class="coverArtLiveGlow"></span>
    <span class="coverArtLiveShimmer"></span>
    <span class="coverArtLiveParticle coverArtLiveParticle--a"></span>
    <span class="coverArtLiveParticle coverArtLiveParticle--b"></span>
    <span class="coverArtLiveParticle coverArtLiveParticle--c"></span>
    <span class="coverArtLiveParticle coverArtLiveParticle--d"></span>
  `;
  const img = document.getElementById("playerArt");
  if (img?.parentNode === stage) {
    stage.insertBefore(overlay, img.nextSibling);
  } else {
    stage.appendChild(overlay);
  }
}

export function syncCoverArtOverlay(active) {
  initCoverArtOverlay();
  const overlay = overlayEl();
  const wrap = document.querySelector(".playerArtWrap");
  const img = document.getElementById("playerArt");
  if (!overlay || !wrap) return;

  const on =
    Boolean(active) &&
    img &&
    !img.classList.contains("isPlaceholder") &&
    !img.classList.contains("isCoverPlaceholder");

  overlay.classList.toggle("isActive", on);
  wrap.classList.toggle("isCoverLive", on);
}
