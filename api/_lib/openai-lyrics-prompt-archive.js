/**
 * OpenAI lyrics prompt modes (Vercel Preview env OPENAI_LYRICS_PROMPT):
 * - slim (default) — structured shape + dialect + rhyme schemes
 * - minimal — dialect + address + user seed only (creative test)
 * - slim-v1 — alias for slim
 *
 * System line (default): OPENAI_SLIM_V1_SYSTEM. Minimal mode omits system unless OPENAI_LYRICS_SYSTEM is set.
 */

const OPENAI_RHYME_SCHEME_LINES = [
  "Rhyme (qafiya / end sounds): story and natural dialect first — do not sacrifice meaning for rhyme.",
  "Verses and [Bridge]: pick one scheme per section that fits the lines — AABB, ABAB, AAAA, AABA, ABCA, ABBA, or ABCC; you may use different schemes in Verse 1 vs Verse 2.",
  "[Chorus] (required): use only AABB, ABAB, or AAAA — choose the catchiest; repeat the same chorus hook on every [Chorus].",
  "Apply schemes internally only — never print letters like AABB or ABAB in the lyrics.",
  "Near-rhyme and light assonance OK when the hook stays singable.",
];

const OPENAI_SLIM_V1_SYSTEM =
  "Expert songwriter. Output lyrics with section tags only — no preamble or production notes in the lyrics body.";

/** @deprecated use OPENAI_RHYME_SCHEME_LINES */
const OPENAI_RHYME_CREATIVE_LINES = OPENAI_RHYME_SCHEME_LINES;

module.exports = {
  OPENAI_RHYME_SCHEME_LINES,
  OPENAI_RHYME_CREATIVE_LINES,
  OPENAI_SLIM_V1_SYSTEM,
};
