/**
 * Normalize cover-art request fields into director context.
 */

/** @typedef {import("./schema.js").CoverSourcePath} CoverSourcePath */

/**
 * @typedef {Object} CoverDirectorContext
 * @property {string} songId
 * @property {string} title
 * @property {CoverSourcePath} sourcePath
 * @property {string} genre
 * @property {string} mood
 * @property {number|null} tempo
 * @property {number} energy
 * @property {number} brightness
 * @property {string} sonicProfile
 * @property {string} lyrics
 * @property {string} styleBlob
 * @property {string} artworkHint
 * @property {string} artworkStyle
 * @property {string} occasionLabel
 * @property {string} searchTemplateTitle
 * @property {boolean} humTrack
 * @property {string} instrumentLabel
 * @property {boolean} skipGeminiScene
 * @property {string} avoidTagsInput
 * @property {string} bucketKey
 * @property {string} storyThemeId
 * @property {string} storyScene
 * @property {string} visualModeHint
 * @property {object|null} mashupOf
 * @property {string} mashupPrompt
 */

function parseEnergy(input) {
  if (typeof input === "number" && Number.isFinite(input)) return Math.min(1, Math.max(0, input));
  return 0.5;
}

function fallbackBucket(input) {
  const blob = [
    input?.title,
    input?.mood,
    input?.genre,
    input?.lyrics,
    input?.styleInput,
    input?.styleSent,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const energy = parseEnergy(input?.energy);
  if (/dark|noir|drill|trap|brooding/.test(blob)) return "dark";
  if (/sad|melanchol|lonely|tears/.test(blob)) return "sad";
  if (/love|romantic|heart|wedding|bridal/.test(blob)) return "love";
  if (/happy|joy|cheer|birthday|celebrat/.test(blob)) return "happy";
  if (/epic|anthem|heroic|grand/.test(blob)) return "epic";
  if (/chill|lofi|ambient|calm|peaceful/.test(blob)) return "chill";
  if (energy > 0.78) return "party";
  if (energy < 0.32) return "chill";
  return "default";
}

function inferSourcePath(input) {
  if (Boolean(input?.humTrack || input?.skipGeminiScene && input?.instrumentLabel)) return "hum_track";
  if (Array.isArray(input?.mashupOf) && input.mashupOf.length) return "mashup";
  if (String(input?.mode || "").toLowerCase() === "sound") return "sound";
  if (Boolean(input?.instrumentalSelected || input?.imageOnlyInstrumental)) return "instrumental";
  const challenge = input?.challenge;
  if (challenge && typeof challenge === "object") {
    const type = String(challenge.type || challenge.kind || "").toLowerCase();
    if (type === "template" || type === "occasion") return "template";
    if (type === "live") return "live";
    if (type === "spark") return "spark";
  }
  if (String(input?.searchTemplateTitle || "").trim()) {
    if (/spark|✦/i.test(String(input.searchTemplateTitle))) return "spark";
    return "template";
  }
  if (String(input?.engine || "").toLowerCase() === "mashup") return "mashup";
  return "create";
}

/**
 * @param {object} input — cover-art API body / params
 * @param {{ bucketKey?: string, storyThemeId?: string, storyScene?: string, visualModeHint?: string }} [hints]
 * @returns {CoverDirectorContext}
 */
export function buildCoverDirectorContext(input, hints = {}) {
  const songId = String(input?.songId || input?.id || "").trim();
  const title = String(input?.title || "").trim();
  const styleBlob = `${input?.styleInput || input?.style || ""} ${input?.styleSent || ""}`.trim();
  const lyrics = String(input?.lyrics || input?.lyricsInput || input?.finalPrompt || input?.soundPrompt || "").trim();
  const bucketKey = String(hints.bucketKey || input?.bucketKey || fallbackBucket({ ...input, lyrics })).trim();

  return {
    songId,
    title,
    sourcePath: inferSourcePath(input),
    genre: String(input?.genre || input?.style || "").trim(),
    mood: String(input?.mood || "").trim(),
    tempo: typeof input?.tempo === "number" ? input.tempo : null,
    energy: parseEnergy(input?.energy),
    brightness: typeof input?.brightness === "number" ? input.brightness : 0.5,
    sonicProfile: String(input?.sonicProfile || "").trim(),
    lyrics,
    styleBlob,
    artworkHint: String(input?.artworkHint || "").trim(),
    artworkStyle: String(input?.artworkStyle || "").trim(),
    occasionLabel: String(input?.occasionLabel || input?.challenge?.occasion || "").trim(),
    searchTemplateTitle: String(input?.searchTemplateTitle || "").trim(),
    humTrack: Boolean(input?.humTrack),
    instrumentLabel: String(input?.instrumentLabel || "").trim(),
    skipGeminiScene: Boolean(input?.skipGeminiScene || input?.humTrack),
    avoidTagsInput: String(input?.avoidTagsInput || input?.avoidTags || "").trim(),
    bucketKey,
    storyThemeId: String(hints.storyThemeId || input?.storyThemeId || "mood_fallback").trim(),
    storyScene: String(hints.storyScene || input?.storyScene || "").trim(),
    visualModeHint: String(hints.visualModeHint || input?.visualModeHint || "landscape").trim(),
    mashupOf: Array.isArray(input?.mashupOf) ? input.mashupOf : null,
    mashupPrompt: String(input?.mashupPrompt || "").trim(),
  };
}
