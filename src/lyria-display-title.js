/** Client mirror of api/_lib/lyria-display-title.js */

const GENERIC_TITLES = new Set([
  "",
  "generated song",
  "lyria clip",
  "lyria song",
  "nabad clip",
  "template clip",
  "your song",
]);

export function shortenDisplayTitle(raw, { maxWords = 2 } = {}) {
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

export function resolveLyriaDisplayTitle({ title, lyrics, prompt, style, clip, instrumental }) {
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

export function isLyriaShelfCampaignPayload(meta = {}) {
  if (!meta || typeof meta !== "object") return false;
  if (String(meta.templateSparkFull || "") === "1") return true;
  if (String(meta.templateSparkClip || "") === "1") return true;
  if (meta.challenge && typeof meta.challenge === "object") return true;
  if (String(meta.challengeId || "").trim()) return true;
  const tplId = String(meta.searchTemplateId || "").trim();
  if (tplId && !tplId.startsWith("continue:")) return true;
  return false;
}

export function resolveLyriaStoredDisplayTitle(meta, opts) {
  if (isLyriaShelfCampaignPayload(meta)) {
    const user = String(opts?.title ?? meta?.title ?? "").trim();
    if (user && !GENERIC_TITLES.has(user.toLowerCase())) return user.slice(0, 80);
    return "Generated song";
  }
  return resolveLyriaDisplayTitle(opts || {});
}
