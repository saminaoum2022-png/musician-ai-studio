/**
 * Hum Track cover constraints — instrument-adjacent studio nook, no instruments in frame.
 */

export const HUM_TRACK_SCENE_GUARD =
  "empty musician studio nook, warm wood table, window sunlight with long shadows, dried botanicals, no instruments visible, no people, no human figures, no faces, no hands, no fingers, no musician, no performer, no body parts";

/** Extra negative-prompt tags for Pollinations (anatomy + instrument render failures). */
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
  "instrument",
  "ukulele",
  "guitar",
  "violin",
  "cello",
  "viola",
  "piano keys",
  "keyboard keys",
  "flute",
  "synthesizer",
  "string instrument",
  "instrument body",
  "neck",
  "headstock",
  "tuning pegs",
  "f-holes",
  "sound hole",
  "bridge",
  "bow",
  "strings on instrument",
]);

/** Per-instrument prop-only still life — same studio vibe, no instrument hero. */
/** @type {Record<string, string>} */
const INSTRUMENT_NOOK_PROPS = {
  piano:
    "empty piano bench, sheet music on wooden stand, metronome on table, moody teal studio, no keyboard visible",
  acoustic_guitar:
    "empty wooden A-frame stand, closed gig bag, guitar picks and capo on warm wood table, window sun shadows",
  electric_guitar:
    "empty guitar stand without instrument, coiled cable and effect pedal on floor, violet-teal studio spill light",
  violin:
    "open empty velvet-lined case, rosin cake and sheet music on wood table, warm dramatic light, no violin or bow",
  flute:
    "empty velvet-lined case interior, cleaning cloth on studio table, soft airy bokeh, no flute visible",
  ukulele:
    "empty small wooden stand, closed soft gig bag, picks and handwritten tab paper on table, sunny window shadows",
  synth:
    "empty keyboard stand without keys, coiled midi cable and patch notes on desk, neon purple accent glow, no synthesizer",
  strings:
    "empty instrument stand, rosin and sheet music on wood table, rich amber studio light, no cello violin or bow",
};

const GENERIC_NOOK =
  "empty instrument stand, closed soft case, sheet music and small props on warm wood table, moody studio nook";

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
 * Prop-only studio nook phrase for any Hum Track instrument (no instrument in frame).
 * @param {string} instrumentLabel
 * @param {string} [instrumentId]
 */
export function humTrackStudioNookPhrase(instrumentLabel, instrumentId = "") {
  const id = normalizeInstrumentId(instrumentId) || guessInstrumentIdFromLabel(instrumentLabel);
  if (id && INSTRUMENT_NOOK_PROPS[id]) return INSTRUMENT_NOOK_PROPS[id];
  return GENERIC_NOOK;
}

/** @deprecated Use humTrackStudioNookPhrase — kept for any stale imports. */
export function humTrackInstrumentStillPhrase(instrumentLabel, instrumentId = "") {
  return humTrackStudioNookPhrase(instrumentLabel, instrumentId);
}

/**
 * @param {string} sceneHint
 * @param {number} [maxLen]
 */
export function appendHumTrackSceneGuards(sceneHint, maxLen = 220) {
  const base = String(sceneHint || "").trim();
  if (/no instruments visible|studio nook/i.test(base)) return base.slice(0, maxLen);
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
