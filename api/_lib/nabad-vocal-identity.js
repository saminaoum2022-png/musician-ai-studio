/**
 * NabadAi Signature Vocal Identity — Lyria 3.5 prompt layers.
 * Admin A/B toggles control the audio FX chain; gender × language picks the vocal matrix.
 * Standard users get the active default chain (all FX on) without seeing controls.
 */

const NABAD_VOCAL_FX = Object.freeze({
  auto_tune:
    "polished modern pitch-correction with subtle digital Auto-Tune effect on sustained notes",
  analog_saturation:
    "warm analog tube saturation, heavily compressed lead vocal tightly glued to the beat",
  reverb_delay:
    "wet vocal mix drenched in lush plate reverb and wide stereo delay trails",
  double_tracking:
    "double-tracked lead vocal with stereo-widened backing harmony layers",
  vocal_texture:
    "subtle vocal fry and expressive phrasing texture at phrase endings",
});

/** Short ElevenLabs positive_styles for each FX toggle (chunk-friendly). */
const NABAD_VOCAL_FX_ELEVEN_TAGS = Object.freeze({
  auto_tune: [
    "polished modern pitch-correction",
    "subtle digital Auto-Tune on sustained notes",
  ],
  analog_saturation: [
    "warm analog tube saturation",
    "heavily compressed lead vocal glued to the beat",
  ],
  reverb_delay: [
    "wet vocal mix",
    "lush plate reverb",
    "wide stereo delay trails",
  ],
  double_tracking: [
    "double-tracked lead vocal",
    "stereo-widened backing harmony layers",
  ],
  vocal_texture: [
    "subtle vocal fry at phrase endings",
    "expressive phrasing texture",
  ],
});

const NABAD_VOCAL_MATRIX_ELEVEN_TAGS = Object.freeze({
  male_ar: [
    "Nabad male Arabic vocal identity",
    "warm baritone range",
    "conversational delivery",
    "microtonal oriental runs",
    "melismatic ornaments",
  ],
  male_en: [
    "Nabad male English vocal identity",
    "warm baritone range",
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

const NABAD_VOCAL_FX_KEYS = Object.freeze(Object.keys(NABAD_VOCAL_FX));

/** Default signature chain — on for everyone until admin toggles for A/B. */
const NABAD_VOCAL_FX_DEFAULTS = Object.freeze({
  auto_tune: true,
  analog_saturation: true,
  reverb_delay: true,
  double_tracking: true,
  vocal_texture: true,
});

const NABAD_VOCAL_MATRIX = Object.freeze({
  male_ar:
    "Lead Male Vocal with Nabad identity: warm baritone range, low-mid chest voice, conversational close-mic delivery with subtle vocal fry at line endings, microtonal oriental runs and light melismatic ornaments, chorus hook stays mid-range baritone chest voice.",
  male_en:
    "Lead Male Vocal with Nabad identity: warm baritone range, low-mid chest voice, rhythmic syncopated delivery with subtle vocal fry at phrase endings, smooth modern R&B phrasing, chorus hook stays mid-range baritone chest voice.",
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

function normalizeNabadVocalToggles(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = { ...NABAD_VOCAL_FX_DEFAULTS };
  for (const key of NABAD_VOCAL_FX_KEYS) {
    if (Object.prototype.hasOwnProperty.call(src, key)) {
      const v = src[key];
      out[key] = !(v === false || v === 0 || v === "0" || v === "false" || v === "off");
    }
  }
  return out;
}

function resolveNabadVocalMatrixKey(gender, language) {
  const g = normalizeNabadGender(gender) || "female";
  const lang = language === "ar" ? "ar" : "en";
  return `${g === "male" ? "male" : "female"}_${lang}`;
}

function buildNabadVocalFxChain(toggles = NABAD_VOCAL_FX_DEFAULTS) {
  const on = normalizeNabadVocalToggles(toggles);
  return NABAD_VOCAL_FX_KEYS
    .filter((k) => on[k])
    .map((k) => NABAD_VOCAL_FX[k])
    .filter(Boolean);
}

function buildNabadVocalStyleLine({
  gender = "",
  language = "en",
  toggles = NABAD_VOCAL_FX_DEFAULTS,
} = {}) {
  const matrixKey = resolveNabadVocalMatrixKey(gender, language);
  const identity = NABAD_VOCAL_MATRIX[matrixKey] || NABAD_VOCAL_MATRIX.female_en;
  const fx = buildNabadVocalFxChain(toggles);
  const bits = [identity];
  if (fx.length) bits.push(`Audio FX Chain: ${fx.join(", ")}`);
  return bits.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Build the vocal-direction fragment for Lyria (Layer B + Layer A).
 * Does not include the user's song prompt — callers merge into musical direction.
 */
function buildNabadVocalPrompt({
  gender = "",
  language = "",
  lyrics = "",
  dialectHint = "",
  scriptFormat = "",
  adminToggles = null,
  toggles = null,
} = {}) {
  const resolvedLang = resolveNabadVocalLanguage({
    language,
    lyrics,
    dialectHint,
    scriptFormat,
  });
  const resolvedGender = normalizeNabadGender(gender) || "female";
  const chain = normalizeNabadVocalToggles(adminToggles || toggles || NABAD_VOCAL_FX_DEFAULTS);
  return {
    styleLine: buildNabadVocalStyleLine({
      gender: resolvedGender,
      language: resolvedLang,
      toggles: chain,
    }),
    gender: resolvedGender,
    language: resolvedLang,
    matrixKey: resolveNabadVocalMatrixKey(resolvedGender, resolvedLang),
    toggles: chain,
    fxEnabled: NABAD_VOCAL_FX_KEYS.filter((k) => chain[k]),
  };
}

/**
 * ElevenLabs-friendly short positive_styles from the same Nabad identity + FX chain.
 */
function buildNabadVocalElevenTags({
  gender = "",
  language = "",
  lyrics = "",
  dialectHint = "",
  scriptFormat = "",
  adminToggles = null,
  toggles = null,
} = {}) {
  const built = buildNabadVocalPrompt({
    gender,
    language,
    lyrics,
    dialectHint,
    scriptFormat,
    adminToggles,
    toggles,
  });
  const matrixTags = NABAD_VOCAL_MATRIX_ELEVEN_TAGS[built.matrixKey] || NABAD_VOCAL_MATRIX_ELEVEN_TAGS.female_en;
  const fxTags = NABAD_VOCAL_FX_KEYS.filter((k) => built.toggles[k])
    .flatMap((k) => NABAD_VOCAL_FX_ELEVEN_TAGS[k] || []);
  const tags = [...matrixTags, ...fxTags].map((t) => String(t).trim()).filter(Boolean);
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
  if (base.includes("Nabad identity") || base.includes("Audio FX Chain:")) return base;
  return `${base}. ${built.styleLine}`.replace(/\s+/g, " ").trim().slice(0, 2000);
}

module.exports = {
  NABAD_VOCAL_FX,
  NABAD_VOCAL_FX_KEYS,
  NABAD_VOCAL_FX_DEFAULTS,
  NABAD_VOCAL_FX_ELEVEN_TAGS,
  NABAD_VOCAL_MATRIX,
  NABAD_VOCAL_MATRIX_ELEVEN_TAGS,
  buildNabadVocalFxChain,
  buildNabadVocalPrompt,
  buildNabadVocalElevenTags,
  buildNabadVocalStyleLine,
  mergeNabadVocalIntoStylePrompt,
  normalizeNabadGender,
  normalizeNabadLanguage,
  normalizeNabadVocalToggles,
  resolveNabadVocalLanguage,
  resolveNabadVocalMatrixKey,
};
