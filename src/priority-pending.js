/**
 * In-flight priority jobs (Sounds, instrumental, music video) — Coach pill resume on reload.
 */

const STORAGE_KEY = "nabad.priority.pending.v1";

export function getPriorityPending() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!String(p?.kind || "").trim()) return null;
    if (!String(p?.taskId || "").trim() && !String(p?.videoTaskId || "").trim()) return null;
    return p;
  } catch {
    return null;
  }
}

export function setPriorityPending({
  kind,
  taskId = "",
  title = "",
  videoTaskId = "",
  sourceTrackId = "",
} = {}) {
  const pending = {
    kind: String(kind || "").trim(),
    taskId: String(taskId || "").trim(),
    title: String(title || "").trim() || "Your creation",
    videoTaskId: String(videoTaskId || "").trim(),
    sourceTrackId: String(sourceTrackId || "").trim(),
    startedAt: Date.now(),
  };
  if (!pending.kind) return null;
  if (!pending.taskId && !pending.videoTaskId) return null;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
  } catch {}
  return pending;
}

export function clearPriorityPending(taskId) {
  const cur = getPriorityPending();
  const id = String(taskId || "").trim();
  if (
    id &&
    cur?.taskId &&
    String(cur.taskId) !== id &&
    cur?.videoTaskId &&
    String(cur.videoTaskId) !== id
  ) {
    return;
  }
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

function priorityShimmerRowTitle(pending) {
  const kind = String(pending?.kind || "").trim();
  const base = String(pending?.title || "").trim();
  if (kind === "sound") return base || "New sound";
  if (kind === "instrumental") {
    const t = base || "Your song";
    return /instrumental/i.test(t) ? t : `${t} • Instrumental`;
  }
  if (kind === "music_video") {
    const t = base || "Your song";
    return /video/i.test(t) ? t : `${t} · Video`;
  }
  return base || "Creating";
}

function priorityShimmerKindLabel(kind) {
  if (kind === "sound") return "Sound";
  if (kind === "instrumental") return "Instrumental";
  if (kind === "music_video") return "Music video";
  return "Creating";
}

/** One library shimmer row while a sound / instrumental / music-video job runs. */
export function libraryPriorityGeneratingRowsHtml(pending) {
  const p = pending || getPriorityPending();
  const kind = String(p?.kind || "").trim();
  if (!kind) return "";
  const hasTask = Boolean(String(p?.taskId || "").trim() || String(p?.videoTaskId || "").trim());
  if (!hasTask) return "";
  const rowTitle = priorityShimmerRowTitle(p);
  const kindLabel = priorityShimmerKindLabel(kind);
  return `
      <li class="libRow libRowGenerating" style="--libSkelDelay:0s" aria-busy="true" aria-label="Generating ${escapeHtmlLite(rowTitle)}">
        <button type="button" class="libRowMain" disabled tabindex="-1">
          <span class="libRowArt">
            <span class="libSkelBlock libSkelArt libSkelArtCover" aria-hidden="true"></span>
          </span>
          <span class="libRowInfo">
            <span class="libRowTitle">${escapeHtmlLite(rowTitle)}</span>
            <span class="libRowSub">
              <span class="libRowDot">${escapeHtmlLite(kindLabel)}</span>
              <span class="libRowDot libRowDotPending">Generating…</span>
            </span>
          </span>
        </button>
        <div class="libRowActions">
          <span class="libRowChip libRowChipPending" aria-hidden="true">…</span>
        </div>
      </li>
    `;
}
