/**
 * Archived OpenAI lyrics user-prompt rules (slim-v1).
 * Restore on Vercel Preview: OPENAI_LYRICS_PROMPT=slim-v1
 *
 * Brief recap of what slim-v1 added on top of the user seed:
 * - Lyria/Suno section shape, max line counts, English [Verse]/[Chorus] tags
 * - Speakable line length (وزن), anti-AAAA rhyme guidance, optional موزونة couplet note
 * - Dialect voice blocks (Lebanese lexicon, q→أ, no tashkeel, etc.)
 * - Style/mood from Create, Ref nonce, remix/challenge/arrange mode instructions
 * - System: "Expert songwriter. Output lyrics with section tags only…"
 *
 * Default now is OPENAI_LYRICS_PROMPT=minimal → dialect + address + user text only.
 */

const OPENAI_RHYME_CREATIVE_LINES = [
  "Story and natural dialect first — do not sacrifice word choice for rhyme.",
  "Do NOT make every line in a section share the same ending (no AAAA / one-sound blocks).",
  "Prefer varied singable patterns: ABAB, ABCB, AABB couplets, hook repetition in chorus only, or loose assonance.",
  "Near-rhyme is fine; two rhyming lines then two different endings is OK in Lebanese pop.",
  "Never print rhyme scheme labels (AABB, BBBB, etc.) in the output.",
];

const OPENAI_SLIM_V1_SYSTEM =
  "Expert songwriter. Output lyrics with section tags only — no preamble or production notes in the lyrics body.";

module.exports = {
  OPENAI_RHYME_CREATIVE_LINES,
  OPENAI_SLIM_V1_SYSTEM,
};
