/**
 * LYRIA CHATGPT RULE — Lebanese Lyria lyrics: light tashkeel + addressee/narrator marks.
 * Source: Sami / ChatGPT pronunciation spec (Lyria generate path only).
 */

const LYRIA_CHATGPT_RULE_TAG = "LYRIA CHATGPT RULE";

function normalizeNarratorGender(value = "") {
  const v = String(value || "").trim().toLowerCase();
  if (v === "m" || v === "male") return "male";
  if (v === "f" || v === "female") return "female";
  return "";
}

/** @returns {string[]} Prompt lines for Gemini/OpenAI lyrics when Lebanese + lyricsTarget lyria. */
function buildLyriaChatGptRuleLines({ arabicAddress = "", narratorGender = "" } = {}) {
  const address = String(arabicAddress || "").trim().toLowerCase();
  const narrator = normalizeNarratorGender(narratorGender);
  const addresseeBlock =
    address === "female"
      ? [
        "Female addressee (lyrics sung TO a woman):",
        "إنتي كِنْتي، رحتي، بحبِّكْ، قلبِكْ، صوتِكْ، معِكْ، فيكي",
      ]
      : address === "group"
        ? [
          "Plural addressee: use natural Lebanese plural forms (إنتو، حبايبي); mark إنتو when it helps singing.",
        ]
        : [
          "Male addressee (lyrics sung TO a man — default if unspecified):",
          "إنتَ كِنْتْ، رحتْ، بحبَّكْ، قلبَكْ، صوتَكْ، معَكْ، فيك",
        ];

  const narratorBlock =
    narrator === "female"
      ? [
        "Narrator (who is singing — female lead):",
        "أنا كِنْتْ ناطرة — female narrator on the verb/adjective.",
      ]
      : narrator === "male"
        ? [
          "Narrator (who is singing — male lead):",
          "أنا كِنْتْ ناطر — male narrator.",
        ]
        : [
          "Keep narrator gender separate from addressee gender in word choice (e.g. أنا كِنْتْ ناطر vs ناطرة).",
        ];

  return [
    `${LYRIA_CHATGPT_RULE_TAG} (Lebanese Lyria — follow exactly):`,
    "Write the lyrics in natural Lebanese Arabic. Use light, selective diacritics to clarify pronunciation and distinguish masculine and feminine forms.",
    "",
    "Follow these examples:",
    "",
    ...addresseeBlock,
    "",
    "For words such as “your heart” and “your voice,” place the gender-marking vowel on the letter BEFORE the final kaf. Keep the kaf silent:",
    "قلبَكْ / قلبِكْ",
    "صوتَكْ / صوتِكْ",
    "",
    ...narratorBlock,
    "",
    "Use shadda where needed and sukun where it clarifies a silent ending. Preserve natural Lebanese pronunciation and genuinely pronounced endings. Add marks only where helpful.",
    "Levantine letters: ق→أ, ذ→ز, ظ→ز. No tanween (ًٌٍ). No Latin digits unless the seed already has them.",
    "Return only the finished lyrics, with their pronunciation marks.",
  ];
}

function shouldUseLyriaChatGptRule({ lyricsTarget = "", flags = {}, arabicScript = false, mode = "" } = {}) {
  if (String(lyricsTarget || "").toLowerCase() !== "lyria") return false;
  if (!arabicScript) return false;
  if (!flags.isLebanese) return false;
  const m = String(mode || "").toLowerCase();
  if (m === "diacritics" || m === "to_arabizi") return false;
  return true;
}

module.exports = {
  LYRIA_CHATGPT_RULE_TAG,
  buildLyriaChatGptRuleLines,
  shouldUseLyriaChatGptRule,
  normalizeNarratorGender,
};
