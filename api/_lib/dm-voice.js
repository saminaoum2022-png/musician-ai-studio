/**
 * Helpers for voice messages (DMs).
 *
 * parseBase64DataUrl — browsers append media-type parameters to recorded audio
 * ("data:audio/mp4; codecs=mp4a.40.2;base64,…" in Safari, "data:audio/webm;codecs=opus;base64,…"
 * in Chrome). A strict `data:<type>;base64,` regex does not match those, and the whole string was
 * then base64-decoded as if it were bare data: ~14 bytes came out, and the upload was rejected
 * with "Recording too short". This parser accepts any parameters.
 *
 * voiceDropBodyProblem — a sent voice message must point at an uploaded file. The client's optimistic
 * message points at a device-local blob: URL; re-sending that (the old "retry") gave recipients a
 * voice message they could never play.
 */

function parseBase64DataUrl(raw, fallbackType = "") {
  const s = String(raw || "").trim();
  if (!s) return { contentType: fallbackType, base64: "" };
  if (/^data:/i.test(s)) {
    const m = s.match(/^data:([^,]*?)\s*;\s*base64\s*,([\s\S]*)$/i);
    if (!m) return { contentType: fallbackType, base64: "" };
    const type = m[1].split(";")[0].trim().toLowerCase();
    return { contentType: type || fallbackType, base64: m[2].replace(/\s+/g, "") };
  }
  return { contentType: fallbackType, base64: s.replace(/\s+/g, "") };
}

/** Returns "" when the body is fine, otherwise a user-facing reason to refuse it. */
function voiceDropBodyProblem(text) {
  const s = String(text || "").trim();
  if (!s.startsWith("{")) return "";
  let o;
  try {
    o = JSON.parse(s);
  } catch {
    return "";
  }
  if (!o || typeof o !== "object" || o.nabad_dm !== "voice") return "";
  const key = String(o.k || "").trim();
  const url = String(o.u || "").trim();
  if (key) return "";
  if (/^https?:\/\//i.test(url)) return "";
  return "This voice message wasn’t uploaded — record it again.";
}

module.exports = { parseBase64DataUrl, voiceDropBodyProblem };
