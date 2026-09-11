/** Lebanese / Levantine Arabizi detection (client). */

const ARABIC_SCRIPT_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const ARABIZI_DIGIT_IN_WORD_RE = /(?:^|[\s'(\[])[a-zA-Z]*[253789][a-zA-Z][\w']*/;
const ARABIZI_MARKER_RE =
  /\b(?:shou|shu|kif|keef|habib[iy]|7abib[iy]|yalla|mafi|ma\s+fi|b7k|b7ke|2elt|2alb|3ala|7ay|mesh|mish|mnih|minih|khalas|khallas)\w*/i;
const ARABIZI_PARTICLE_RE =
  /\b(?:ana|ente|inti|int[aie]|ma\s|fi\s|min\s|hal|hay|w\s|ya\s)\b/i;

function latinLetterCount(text) {
  return (String(text || "").match(/[a-zA-Z]/g) || []).length;
}

function arabicLetterCount(text) {
  let n = 0;
  for (const ch of String(text || "")) {
    if (ARABIC_SCRIPT_RE.test(ch)) n += 1;
  }
  return n;
}

export function looksLikeArabizi(text) {
  const s = String(text || "");
  if (!s.trim()) return false;
  const arabic = arabicLetterCount(s);
  const latin = latinLetterCount(s);
  if (arabic > latin && arabic >= 6) return false;
  if (latin < 8) return false;
  if (ARABIZI_DIGIT_IN_WORD_RE.test(s)) return true;
  if (ARABIZI_MARKER_RE.test(s)) return true;
  if (ARABIZI_PARTICLE_RE.test(s) && latin >= 20) return true;
  return false;
}

/** Normalize an Arabizi word ending for rhyme comparison. */
export function normalizeArabiziRhymeKey(word) {
  let w = String(word || "")
    .toLowerCase()
    .replace(/[^\u0600-\u06FFa-z0-9']/g, "")
    .replace(/['']/g, "");
  if (w.length < 2) return w;
  w = w.replace(/(?:elle?|allah|eh|ah|eh?)$/i, (m) => m.slice(-2));
  if (w.length >= 4) return w.slice(-4);
  return w.slice(-3);
}

export function isArabiziLyricsLanguage(lang) {
  return String(lang || "").trim().toLowerCase() === "arabizi";
}
