/**
 * NabadAi Signature Vocal Identity — Lyria / ElevenLabs singer profile only.
 * Audio FX chain (Auto-Tune, reverb, doubles) was removed.
 */

const NABAD_VOCAL_MATRIX_ELEVEN_TAGS = Object.freeze({
  male_ar: [
    "Nabad male Arabic vocal identity",
    "warm baritone-tenor range",
    "conversational delivery",
    "microtonal oriental runs",
    "melismatic ornaments",
  ],
  male_en: [
    "Nabad male English vocal identity",
    "warm baritone-tenor range",
    "rhythmic syncopated delivery",
    "smooth modern R&B phrasing",
  ],
  female_ar: [
    "Nabad female Arabic vocal identity",
    "intimate breathy whisper-pop",
    "rich emotional chest voice",
    "soft vibrato",
    "oriental melismatic ornaments",
  ],
  female_en: [
    "Nabad female English vocal identity",
    "intimate breathy whisper-pop",
    "silky smooth vocal agility",
    "airy head-voice transitions",
    "soft vibrato",
    "layered harmonies",
  ],
});

const NABAD_VOCAL_MATRIX = Object.freeze({
  male_ar:
    "Lead Male Vocal with Nabad identity: warm baritone-tenor range, conversational delivery with subtle vocal fry at line endings, accented with microtonal oriental runs and melismatic ornaments.",
  male_en:
    "Lead Male Vocal with Nabad identity: warm baritone-tenor range, rhythmic syncopated delivery with subtle vocal fry at phrase endings, smooth modern R&B phrasing and clean vocal agility.",
  female_ar:
    "Lead Female Vocal with Nabad identity: intimate breathy whisper-pop delivery transitioning into a rich emotional chest voice, soft vibrato, and oriental melismatic ornaments.",
  female_en:
    "Lead Female Vocal with Nabad identity: intimate breathy whisper-pop delivery, silky smooth vocal agility, airy head-voice transitions, soft vibrato, and layered harmonies.",
});

function normalizeNabadGender(raw) {
  const g = String(raw || "").trim().toLowerCase();
  if (g === "f" || g === "female" || g === "woman") return "female";
  if (g === "m" || g === "male" || g === "man") return "male";
  return "";
}

function normalizeNabadLanguage(raw) {
  const l = String(raw || "").trim().toLowerCase();
  if (!l || l === "auto") return "";
  if (
    l === "ar" ||
    l === "arabic" ||
    l === "arabizi" ||
    l.startsWith("ar") ||
    /[\u0600-\u06FF]/.test(l)
  ) {
    return "ar";
  }
  if (l === "en" || l === "english" || l.startsWith("en")) return "en";
  return "";
}

/** Infer ar vs en from lyrics / dialect / script hints. */
function resolveNabadVocalLanguage({
  language = "",
  lyrics = "",
  dialectHint = "",
  scriptFormat = "",
} = {}) {
  const explicit = normalizeNabadLanguage(language);
  if (explicit) return explicit;
  const script = String(scriptFormat || "").trim().toLowerCase();
  if (script === "arabic" || script === "arabizi") return "ar";
  if (script === "english" || script === "latin") return "en";
  const blob = `${dialectHint || ""}\n${lyrics || ""}`;
  if (/[\u0600-\u06FF]/.test(blob) || /\barabizi\b/i.test(blob)) return "ar";
  if (
    /\b(lebanese|egyptian|levantine|gulf|msa|arabic|فصحى|لبناني|مصري)\b/i.test(blob)
  ) {
    return "ar";
  }
  return "en";
}

function resolveNabadVocalMatrixKey(gender, language) {
  const g = normalizeNabadGender(gender) || "female";
  const lang = language === "ar" ? "ar" : "en";
  return `${g === "male" ? "male" : "female"}_${lang}`;
}

function buildNabadVocalStyleLine({
  gender = "",
  language = "en",
} = {}) {
  const matrixKey = resolveNabadVocalMatrixKey(gender, language);
  return NABAD_VOCAL_MATRIX[matrixKey] || NABAD_VOCAL_MATRIX.female_en;
}

/**
 * Build the vocal-direction fragment for Lyria (singer identity only).
 * Does not include the user's song prompt — callers merge into musical direction.
 */
function buildNabadVocalPrompt({
  gender = "",
  language = "",
  lyrics = "",
  dialectHint = "",
  scriptFormat = "",
} = {}) {
  const resolvedLang = resolveNabadVocalLanguage({
    language,
    lyrics,
    dialectHint,
    scriptFormat,
  });
  const resolvedGender = normalizeNabadGender(gender) || "female";
  return {
    styleLine: buildNabadVocalStyleLine({
      gender: resolvedGender,
      language: resolvedLang,
    }),
    gender: resolvedGender,
    language: resolvedLang,
    matrixKey: resolveNabadVocalMatrixKey(resolvedGender, resolvedLang),
  };
}

/**
 * ElevenLabs-friendly short positive_styles from the Nabad singer identity.
 */
function buildNabadVocalElevenTags({
  gender = "",
  language = "",
  lyrics = "",
  dialectHint = "",
  scriptFormat = "",
} = {}) {
  const built = buildNabadVocalPrompt({
    gender,
    language,
    lyrics,
    dialectHint,
    scriptFormat,
  });
  const matrixTags = NABAD_VOCAL_MATRIX_ELEVEN_TAGS[built.matrixKey] || NABAD_VOCAL_MATRIX_ELEVEN_TAGS.female_en;
  const tags = matrixTags.map((t) => String(t).trim()).filter(Boolean);
  return {
    ...built,
    tags: [...new Set(tags)],
  };
}

/** Append Nabad vocal style line onto a freeform style prompt (ElevenLabs / fallback). */
function mergeNabadVocalIntoStylePrompt(stylePrompt = "", nabadOpts = {}) {
  const built = buildNabadVocalPrompt(nabadOpts);
  const base = String(stylePrompt || "").trim();
  if (!built.styleLine) return base;
  if (!base) return built.styleLine;
  if (base.includes("Nabad identity")) return base;
  return `${base}. ${built.styleLine}`.replace(/\s+/g, " ").trim().slice(0, 2000);
}

module.exports = {
  NABAD_VOCAL_MATRIX,
  NABAD_VOCAL_MATRIX_ELEVEN_TAGS,
  buildNabadVocalPrompt,
  buildNabadVocalElevenTags,
  buildNabadVocalStyleLine,
  mergeNabadVocalIntoStylePrompt,
  normalizeNabadGender,
  normalizeNabadLanguage,
  resolveNabadVocalLanguage,
  resolveNabadVocalMatrixKey,
};
