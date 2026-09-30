/**
 * Human-readable DM previews for push + server-side copy.
 * Mirrors client formatDmInboxPreview (voice, song, sticker, text).
 */

const STICKER_LABELS = {
  note: "Music note",
  wave: "Sound wave",
  mic: "Mic",
  heart: "Heart",
  headphones: "Headphones",
  trophy: "Champion",
  fan: "Two fans",
};

function formatDurationSec(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function stripHtml(raw) {
  return String(raw || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {string} raw message body from dm_messages
 * @returns {string}
 */
function formatDmPushPreview(raw) {
  const body = String(raw || "").replace(/^\uFEFF/, "").trim();
  if (!body) return "";

  const token = body.match(/^\[nabad-sticker:([a-z0-9_-]+)\]$/i);
  if (token) {
    const id = String(token[1] || "").trim();
    return `Sticker · ${STICKER_LABELS[id] || "Sticker"}`;
  }

  if (body.startsWith("{")) {
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      data = null;
    }
    if (data && typeof data === "object") {
      const kind = String(data.nabad_dm || "").trim();
      if (kind === "voice") {
        return `Voice drop · ${formatDurationSec(data.d ?? data.duration)}`;
      }
      if (kind === "voice_mix") {
        return `Voice mix · ${formatDurationSec(data.d ?? data.duration)}`;
      }
      if (kind === "sticker") {
        const id = String(data.id || "").trim();
        return `Sticker · ${STICKER_LABELS[id] || "Sticker"}`;
      }
      if (kind === "song") {
        const title = String(data.t || data.title || "Song").trim() || "Song";
        const k = String(data.k || data.kind || "song").trim().toLowerCase();
        const kindLabel = k === "mashup" ? "Mashup" : k === "remix" ? "Remix" : "Song";
        if (/^drop remix\b/i.test(title)) return "Voice mix";
        return `${kindLabel} · ${title}`;
      }
    }
  }

  return stripHtml(body).slice(0, 140);
}

module.exports = { formatDmPushPreview, formatDurationSec };
