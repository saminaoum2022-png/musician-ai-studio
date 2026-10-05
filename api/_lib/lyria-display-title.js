/**
 * Display titles for Lyria clip / 3.5 outputs (library + player).
 * User title wins; else first ~2 words from lyrics or style.
 */

const GENERIC_TITLES = new Set([
  "",
  "generated song",
  "lyria clip",
  "lyria song",
  "nabad clip",
  "template clip",
  "original hum hook",
  "melody lock test",
  "your song",
]);

function shortenDisplayTitle(raw, { maxWords = 2 } = {}) {
  const cleaned = String(raw || "")
    .replace(/\[(verse|chorus|bridge|intro|outro|pre-chorus|hook)[^\]]*\]/gi, " ")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  const upTo = cleaned.split(/[,.;:!?]/)[0].trim() || cleaned;
  const words = upTo.split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  let head = words.slice(0, maxWords).join(" ");
  if (head.length < 2 && words.length > maxWords) head = words.slice(0, 3).join(" ");
  if (head.length > 48) head = `${head.slice(0, 47)}…`;
  return head.charAt(0).toUpperCase() + head.slice(1);
}

function resolveLyriaDisplayTitle({ title, lyrics, prompt, style, clip, instrumental }) {
  const user = String(title || "").trim();
  if (user && !GENERIC_TITLES.has(user.toLowerCase())) return user.slice(0, 80);

  const lyricSource = String(lyrics || prompt || "").trim();
  if (!instrumental && lyricSource) {
    const fromLyrics = shortenDisplayTitle(lyricSource);
    if (fromLyrics) return fromLyrics;
  }

  const fromStyle = shortenDisplayTitle(String(style || "").trim());
  if (fromStyle) return fromStyle;

  return clip ? "Lyria clip" : "Lyria song";
}

/** Template / Spark / Occasion / Challenge shelves — keep legacy stored titles. */
function isLyriaShelfCampaignBody(body) {
  if (!body || typeof body !== "object") return false;
  if (String(body.templateSparkFull || "") === "1") return true;
  if (String(body.templateSparkClip || "") === "1") return true;
  if (body.challenge && typeof body.challenge === "object") return true;
  if (String(body.challengeId || "").trim()) return true;
  const tplId = String(body.searchTemplateId || "").trim();
  if (tplId && !tplId.startsWith("continue:")) return true;
  return false;
}

/** Scratch Lyria create only; shelf/campaign flows use explicit title or Generated song. */
function resolveLyriaStoredDisplayTitle(body, opts) {
  if (isLyriaShelfCampaignBody(body)) {
    const user = String(opts?.title ?? body?.title ?? "").trim();
    if (user && !GENERIC_TITLES.has(user.toLowerCase())) return user.slice(0, 80);
    return "Generated song";
  }
  return resolveLyriaDisplayTitle(opts || {});
}

module.exports = {
  shortenDisplayTitle,
  resolveLyriaDisplayTitle,
  isLyriaShelfCampaignBody,
  resolveLyriaStoredDisplayTitle,
};
