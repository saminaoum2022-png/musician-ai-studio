/**
 * Nabad creator verified mark — brand gradient star + compact white tick (profile + inline).
 */

const STAR =
  "M12 1.5 14.6 4l3.5-.4.7 3.5 3 1.9-1.6 3.2 1.6 3.2-3 1.9-.7 3.5L14.6 20 12 22.5 9.4 20l-3.5.4-.7-3.5-3-1.9 1.6-3.2L2.2 8.6l3-1.9.7-3.5L9.4 4 12 1.5Z";

/** Compact white tick — small centered check, thin halo (reads at 14–20px). */
const NABAD_CHECK_INNER = `
  <path fill="none" stroke="rgba(6,8,14,0.42)" stroke-width="1.73" stroke-linecap="round" stroke-linejoin="round" d="M9.15 12.35 10.75 13.95 14.85 10.15"/>
  <path fill="none" stroke="#fff" stroke-opacity="1" stroke-width="1.42" stroke-linecap="round" stroke-linejoin="round" d="M9.15 12.35 10.75 13.95 14.85 10.15"/>
`;

/** Same smooth blend as `#btnSunoGenerate.aiGenerate.isReady` (148deg in CSS). */
function brandGradientDefs(gradId) {
  return `<defs><linearGradient id="${gradId}" x1="2" y1="22" x2="22" y2="2" gradientUnits="userSpaceOnUse">
    <stop offset="0%" stop-color="#23d5ab"/>
    <stop offset="34%" stop-color="#2ec4b8"/>
    <stop offset="72%" stop-color="#6b78e8"/>
    <stop offset="100%" stop-color="#7c5cff"/>
  </linearGradient></defs>`;
}

let _gradSeq = 0;

export function verifiedBadgeUsesBrandGradient() {
  return true;
}

export function nabadVerifiedBadgeSvgMarkup() {
  const gid = `nabadVerifiedGrad-${++_gradSeq}`;
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="profileNabadCertSvg--brand">${brandGradientDefs(gid)}<path fill="url(#${gid})" d="${STAR}"/>${NABAD_CHECK_INNER}</svg>`;
}

export function paintVerifiedBadgeElement(el) {
  if (!el) return;
  el.innerHTML = nabadVerifiedBadgeSvgMarkup();
  el.classList.add("profileNabadCertCheck--brand");
}

export function paintStaticVerifiedBadgeNodes() {
  paintVerifiedBadgeElement(document.getElementById("profileNabadCertCheck"));
  paintVerifiedBadgeElement(document.getElementById("userPublicVerified"));
}
