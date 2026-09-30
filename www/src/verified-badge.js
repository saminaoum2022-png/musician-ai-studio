/**
 * Nabad creator verified mark — SVG variants (profile + inline feeds).
 * Staging admin: localStorage `nabadVerifiedBadgePreview` = A | B | C | D
 *   A = gold star + check
 *   B = gold star + mic
 *   C = brand teal/violet gradient star + check
 *   D = brand gradient star + mic
 */

const PREVIEW_KEY = "nabadVerifiedBadgePreview";
const VALID = new Set(["A", "B", "C", "D"]);

const STAR =
  "M12 1.5 14.6 4l3.5-.4.7 3.5 3 1.9-1.6 3.2 1.6 3.2-3 1.9-.7 3.5L14.6 20 12 22.5 9.4 20l-3.5.4-.7-3.5-3-1.9 1.6-3.2L2.2 8.6l3-1.9.7-3.5L9.4 4 12 1.5Z";

/** Compact white tick — small centered check, thin halo (reads at 14–20px). */
const NABAD_CHECK_INNER = `
  <path fill="none" stroke="rgba(6,8,14,0.42)" stroke-width="1.73" stroke-linecap="round" stroke-linejoin="round" d="M9.15 12.35 10.75 13.95 14.85 10.15"/>
  <path fill="none" stroke="#fff" stroke-opacity="1" stroke-width="1.42" stroke-linecap="round" stroke-linejoin="round" d="M9.15 12.35 10.75 13.95 14.85 10.15"/>
`;

/** White mic + stand (same halo idea as the tick — creator / voice mark for B & D). */
const NABAD_MIC_INNER = `
  <g>
    <rect x="9.75" y="5.65" width="4.5" height="7.85" rx="2.25" fill="rgba(6,8,14,0.4)"/>
    <rect x="9.75" y="5.65" width="4.5" height="7.85" rx="2.25" fill="#ffffff"/>
    <path d="M7.35 11.25a4.65 4.65 0 0 0 9.3 0" fill="none" stroke="rgba(6,8,14,0.45)" stroke-width="1.7" stroke-linecap="round"/>
    <path d="M7.35 11.25a4.65 4.65 0 0 0 9.3 0" fill="none" stroke="#ffffff" stroke-width="1.45" stroke-linecap="round"/>
    <rect x="10.85" y="14.75" width="2.3" height="1.85" rx=".55" fill="#ffffff" stroke="rgba(6,8,14,0.35)" stroke-width="0.45"/>
    <rect x="8.65" y="16.35" width="6.7" height="1.65" rx=".55" fill="#ffffff" stroke="rgba(6,8,14,0.35)" stroke-width="0.45"/>
  </g>
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

export function getVerifiedBadgePreviewVariant() {
  try {
    const raw = localStorage.getItem(PREVIEW_KEY);
    const v = String(raw == null ? "C" : raw).toUpperCase();
    return VALID.has(v) ? v : "C";
  } catch {
    return "C";
  }
}

export function setVerifiedBadgePreviewVariant(variant) {
  try {
    const v = String(variant || "A").toUpperCase();
    localStorage.setItem(PREVIEW_KEY, VALID.has(v) ? v : "A");
  } catch {}
}

export function verifiedBadgeUsesBrandGradient(variant = getVerifiedBadgePreviewVariant()) {
  return variant === "C" || variant === "D";
}

/** Rich gold via currentColor on .profileNabadCertCheck; C/D use SVG gradient fill. */
export function nabadVerifiedBadgeSvgMarkup(variant = getVerifiedBadgePreviewVariant()) {
  const v = VALID.has(String(variant).toUpperCase()) ? String(variant).toUpperCase() : "A";
  const mic = v === "B" || v === "D";
  const brand = v === "C" || v === "D";
  const inner = mic ? NABAD_MIC_INNER : NABAD_CHECK_INNER;
  if (brand) {
    const gid = `nabadVerifiedGrad-${++_gradSeq}`;
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="profileNabadCertSvg--brand">${brandGradientDefs(gid)}<path fill="url(#${gid})" d="${STAR}"/>${inner}</svg>`;
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="${STAR}"/>${inner}</svg>`;
}

export function paintVerifiedBadgeElement(el) {
  if (!el) return;
  el.innerHTML = nabadVerifiedBadgeSvgMarkup();
  el.classList.toggle("profileNabadCertCheck--brand", verifiedBadgeUsesBrandGradient());
}

export function paintStaticVerifiedBadgeNodes() {
  paintVerifiedBadgeElement(document.getElementById("profileNabadCertCheck"));
  paintVerifiedBadgeElement(document.getElementById("userPublicVerified"));
}

const PREVIEW_BTNS = [
  { id: "A", label: "A gold ✓" },
  { id: "B", label: "B gold mic" },
  { id: "C", label: "C brand ✓" },
  { id: "D", label: "D brand mic" },
];

/**
 * Staging + admin: floating switcher on Profile (reloads to refresh feed badges).
 */
export function bindVerifiedBadgePreviewBar({ isStaging } = {}) {
  if (!isStaging) return;
  let bar = document.getElementById("verifiedBadgePreviewBar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "verifiedBadgePreviewBar";
    bar.className = "verifiedBadgePreviewBar";
    bar.setAttribute("role", "toolbar");
    bar.setAttribute("aria-label", "Verified badge preview");
    document.body.appendChild(bar);
  }
  const cur = getVerifiedBadgePreviewVariant();
  bar.innerHTML = `
    <span class="verifiedBadgePreviewBarLbl">Verified</span>
    ${PREVIEW_BTNS.map(
      (b) =>
        `<button type="button" class="verifiedBadgePreviewBarBtn${cur === b.id ? " is-on" : ""}" data-vbp="${b.id}">${b.label}</button>`,
    ).join("")}`;
  bar.querySelectorAll("[data-vbp]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const v = btn.getAttribute("data-vbp");
      if (v === getVerifiedBadgePreviewVariant()) return;
      setVerifiedBadgePreviewVariant(v);
      try { location.reload(); } catch {}
    });
  });
  const onProfile = (document.body.getAttribute("data-route") || "") === "profile";
  bar.hidden = !onProfile;
}
