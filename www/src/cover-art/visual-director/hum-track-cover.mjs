/**
 * Hum Track cover constraints — instrument-only still life, no people/hands.
 */

export const HUM_TRACK_SCENE_GUARD =
  "empty studio, instrument-only frame, no people, no human figures, no faces, no hands, no fingers, no musician, no performer, no body parts";

/** Extra negative-prompt tags for Pollinations (anatomy + surreal object failures). */
export const HUM_TRACK_AVOID = Object.freeze([
  "people",
  "human figure",
  "face",
  "hands",
  "fingers",
  "musician",
  "performer",
  "portrait",
  "holding instrument",
  "player squatting",
  "full body person",
  "surreal objects",
  "impossible geometry",
  "melded objects",
  "tree growing from instrument",
  "wrong instrument",
  "extra strings",
  "broken anatomy",
  "deformed hands",
  "disfigured face",
  "mutated limbs",
]);

/** @type {Record<string, string>} */
const INSTRUMENT_STILL = {
  piano:
    "single grand piano, black lacquer, correct keyboard and lid geometry, product still life",
  acoustic_guitar:
    "single acoustic guitar on stand, natural wood body, six strings, plausible bridge and tuning pegs",
  electric_guitar:
    "single electric guitar on stand, solid body, six strings, correct headstock and pickups",
  violin:
    "single violin on velvet surface, four strings, correct f-holes and chin rest, no bow in hand",
  flute:
    "single silver flute resting on studio surface, correct keys and embouchure hole",
  ukulele:
    "single ukulele on stand, small four-string body, correct scale length and sound hole",
  synth:
    "single synthesizer keyboard on stand, clean keys and knobs, product photography",
  strings:
    "solo string instrument as sculptural hero, cello or viola form, four strings, studio still life",
};

function normalizeInstrumentId(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
}

function guessInstrumentIdFromLabel(label) {
  const s = String(label || "").trim().toLowerCase();
  if (/ukulele/.test(s)) return "ukulele";
  if (/acoustic/.test(s)) return "acoustic_guitar";
  if (/electric.*guitar/.test(s)) return "electric_guitar";
  if (/guitar/.test(s)) return "acoustic_guitar";
  if (/piano/.test(s)) return "piano";
  if (/violin/.test(s)) return "violin";
  if (/flute/.test(s)) return "flute";
  if (/synth/.test(s)) return "synth";
  if (/string/.test(s)) return "strings";
  return "";
}

/**
 * @param {string} instrumentLabel
 * @param {string} [instrumentId]
 */
export function humTrackInstrumentStillPhrase(instrumentLabel, instrumentId = "") {
  const id = normalizeInstrumentId(instrumentId) || guessInstrumentIdFromLabel(instrumentLabel);
  const label = String(instrumentLabel || "instrument").trim() || "instrument";
  if (id && INSTRUMENT_STILL[id]) return INSTRUMENT_STILL[id];
  return `single ${label}, photoreal product still life, correct proportions, clean geometry`;
}

/**
 * @param {string} sceneHint
 * @param {number} [maxLen]
 */
export function appendHumTrackSceneGuards(sceneHint, maxLen = 220) {
  const base = String(sceneHint || "").trim();
  if (/no people|instrument-only/i.test(base)) return base.slice(0, maxLen);
  if (!base) return HUM_TRACK_SCENE_GUARD.slice(0, maxLen);
  const suffix = `, ${HUM_TRACK_SCENE_GUARD}`;
  const room = Math.max(0, maxLen - suffix.length);
  const trimmed = base.slice(0, room).replace(/,\s*[^,]*$/, "").trim();
  return `${trimmed}${suffix}`.slice(0, maxLen);
}

/**
 * @param {string} [extra]
 */
export function humTrackAvoidTags(extra = "") {
  const more = String(extra || "")
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([...HUM_TRACK_AVOID, ...more])].join(", ");
}
