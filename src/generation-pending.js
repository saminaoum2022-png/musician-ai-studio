/** In-flight Suno generation — shimmer placeholders in Library until songs land. */

const STORAGE_KEY = "nabad.generation.pending.v1";
export const GENERATION_VARIANT_COUNT = 2;

export function getGenerationPending() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!String(p?.taskId || "").trim()) return null;
    return p;
  } catch {
    return null;
  }
}

export function setGenerationPending({
  taskId,
  title,
  variantCount = GENERATION_VARIANT_COUNT,
  source = "",
  instrumentId = "",
  photoCoverDataUrl = "",
} = {}) {
  const pending = {
    taskId: String(taskId || "").trim(),
    title: String(title || "").trim() || "New song",
    variantCount: Math.max(1, Math.min(GENERATION_VARIANT_COUNT, Number(variantCount) || GENERATION_VARIANT_COUNT)),
    source: String(source || "").trim(),
    instrumentId: String(instrumentId || "").trim(),
    startedAt: Date.now(),
  };
  const cover = String(photoCoverDataUrl || "").trim();
  if (cover.startsWith("data:")) pending.photoCoverDataUrl = cover;
  if (!pending.taskId) return null;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
  } catch {}
  return pending;
}

export function clearGenerationPending(taskId) {
  const cur = getGenerationPending();
  if (taskId && cur?.taskId && String(cur.taskId) !== String(taskId)) return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
}

function escapeHtmlLite(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Two library rows (same size as real songs) while generation runs. */
export function libraryGeneratingRowsHtml(pending) {
  const p = pending || getGenerationPending();
  if (!p) return "";
  const count = Math.max(1, Math.min(GENERATION_VARIANT_COUNT, Number(p.variantCount) || GENERATION_VARIANT_COUNT));
  const baseTitle = String(p.title || "New song").trim() || "New song";
  const rows = [];
  for (let i = 0; i < count; i++) {
    const delay = `${(i * 0.08).toFixed(2)}s`;
    const rowTitle = count > 1 && i === 1
      ? (baseTitle.endsWith(" B") ? baseTitle : `${baseTitle} B`)
      : baseTitle;
    const variantLabel = count > 1 ? (i === 0 ? "Variant A" : "Variant B") : "Creating";
    rows.push(`
      <li class="libRow libRowGenerating" style="--libSkelDelay:${delay}" aria-busy="true" aria-label="Generating ${escapeHtmlLite(rowTitle)}">
        <button type="button" class="libRowMain" disabled tabindex="-1">
          <span class="libRowArt">
            <span class="libSkelBlock libSkelArt libSkelArtCover" aria-hidden="true"></span>
          </span>
          <span class="libRowInfo">
            <span class="libRowTitle">${escapeHtmlLite(rowTitle)}</span>
            <span class="libRowSub">
              <span class="libRowDot">${escapeHtmlLite(variantLabel)}</span>
              <span class="libRowDot libRowDotPending">Generating…</span>
            </span>
          </span>
        </button>
        <div class="libRowActions">
          <span class="libRowChip libRowChipPending" aria-hidden="true">…</span>
        </div>
      </li>
    `);
  }
  return rows.join("");
}
