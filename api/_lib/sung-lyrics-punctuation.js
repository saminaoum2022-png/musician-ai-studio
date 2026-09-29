/** Lyria (and some singers) treat commas/colons next to words like diacritics — strip from sung lines. */

const SECTION_TAG_ONLY = /^\[[^\]]+\]\s*$/;

/** Characters to remove from lyric lines (not from [Verse] tags). */
const INLINE_PUNCT_RE = /[,،;؛:：·•…]/g;

function stripInlinePunctuationFromSungLine(line) {
  const raw = String(line ?? "");
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (SECTION_TAG_ONLY.test(trimmed)) return trimmed;
  return trimmed.replace(INLINE_PUNCT_RE, " ").replace(/\s+/g, " ").trim();
}

function stripInlinePunctuationFromLyrics(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => {
      const t = line.trim();
      if (!t) return "";
      return stripInlinePunctuationFromSungLine(t);
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const NO_PUNCTUATION_IN_SUNG_LYRICS_LINES = [
  "NO punctuation inside lyric lines: no commas, semicolons, colons, bullets, or ellipses touching words — models may read them like tashkeel/tanween.",
  "Use line breaks only; never split a phrase with a comma. Section tags [Verse] [Chorus] stay in English brackets only.",
];

module.exports = {
  stripInlinePunctuationFromSungLine,
  stripInlinePunctuationFromLyrics,
  NO_PUNCTUATION_IN_SUNG_LYRICS_LINES,
};
