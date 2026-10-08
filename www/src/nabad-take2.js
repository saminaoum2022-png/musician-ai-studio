/**
 * Take 2 — admin-only re-generate from a saved Lyria take card.
 */

let bridge = {};

export function configureNabadTake2(b) {
  bridge = b || {};
}

export function nabadTake2Enabled() {
  try {
    return Boolean(typeof bridge.isAdmin === "function" && bridge.isAdmin());
  } catch {
    return false;
  }
}

export function stripTakeSuffix(title) {
  return String(title || "").replace(/\s*\(Take\s+\d+\)\s*$/i, "").trim();
}

export function nextTakeTitle(title, takeNumber) {
  const n = Math.max(2, Math.round(Number(takeNumber) || 2));
  const base = stripTakeSuffix(title) || "Song";
  return `${base} (Take ${n})`;
}

export function rootSongId(track) {
  const meta = track?.meta && typeof track.meta === "object" ? track.meta : {};
  return String(meta.rootSongId || meta.parentSongId || track?.id || "").trim();
}

export function rootTaskId(track) {
  const meta = track?.meta && typeof track.meta === "object" ? track.meta : {};
  return String(meta.rootTaskId || meta.parentTaskId || track?.taskId || "").trim();
}

export function nextTakeNumber(library, rootId) {
  const rid = String(rootId || "").trim();
  if (!rid) return 2;
  const kids = (Array.isArray(library) ? library : []).filter((t) => {
    const meta = t?.meta && typeof t.meta === "object" ? t.meta : {};
    return String(meta.parentSongId || "") === rid || String(meta.rootSongId || "") === rid;
  });
  return kids.length + 2;
}

export function normalizeCreateInputs(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const mode = String(src.mode || "").trim().toLowerCase() === "idea" ? "idea" : "write";
  const vocal = String(src.vocalGender || src.singerGender || "").trim().toLowerCase();
  const vocalGender = vocal === "f" || vocal === "m" || vocal === "duo" ? vocal : "";
  const str = (v) => String(v == null ? "" : v).trim();
  const bool = (v) => v === true || v === 1 || v === "1" || v === "true";
  const slotSrc = src.studioSlots && typeof src.studioSlots === "object" ? src.studioSlots : {};
  return {
    mode,
    prompt: str(src.prompt || src.lyrics || src.idea || src.ideaBrief),
    style: str(src.style || src.styleInput),
    title: str(src.title),
    vocalGender,
    singerGender: vocalGender,
    personaId: str(src.personaId),
    dialect: str(src.dialect),
    dialectHint: str(src.dialectHint),
    arabicAddress: str(src.arabicAddress),
    instrumental: bool(src.instrumental),
    songKey: str(src.songKey),
    durationPreset: str(src.durationPreset || src.songDurationPreset),
    timing: str(src.timing),
    groovePace: str(src.groovePace),
    prosody: str(src.prosody || src.prosodyStrictness),
    beatStability: str(src.beatStability),
    avoidTags: str(src.avoidTags || src.avoidTagsInput),
    artworkStyle: str(src.artworkStyle),
    voiceProfile: str(src.voiceProfile),
    lyricsLanguage: str(src.lyricsLanguage) === "auto" ? "" : str(src.lyricsLanguage),
    lyricsDialect: str(src.lyricsDialect),
    studioStyleId: str(src.studioStyleId),
    studioSlots: {
      LEAD: str(slotSrc.LEAD),
      RHYTHM: str(slotSrc.RHYTHM),
      MOOD: str(slotSrc.MOOD),
      BPM: str(slotSrc.BPM),
      KEY: str(slotSrc.KEY),
    },
  };
}

const INPUT_KEYS = [
  "mode", "prompt", "style", "title", "vocalGender", "singerGender",
  "personaId", "dialect", "dialectHint", "arabicAddress", "instrumental",
  "songKey", "durationPreset", "timing", "groovePace", "prosody",
  "beatStability", "avoidTags", "artworkStyle", "voiceProfile",
  "lyricsLanguage", "lyricsDialect", "studioStyleId", "studioSlots",
];

export function createInputsEqual(a, b) {
  const left = normalizeCreateInputs(a);
  const right = normalizeCreateInputs(b);
  return JSON.stringify(INPUT_KEYS.map((k) => left[k])) === JSON.stringify(INPUT_KEYS.map((k) => right[k]));
}

export function takeCardFromTrack(track) {
  const meta = track?.meta && typeof track.meta === "object" ? track.meta : {};
  const card = meta.takeCard && typeof meta.takeCard === "object" ? meta.takeCard : null;
  if (!card) return null;
  const finalPrompt = String(card.finalPrompt || "").trim();
  const hasCard = card.hasCard === true || Boolean(finalPrompt);
  if (!hasCard) return null;
  return {
    ...card,
    hasCard: true,
    createInputs: normalizeCreateInputs(card.createInputs || {}),
    producerJson: card.producerJson && typeof card.producerJson === "object" ? card.producerJson : null,
    finalPrompt,
    taskId: String(card.taskId || track?.taskId || "").trim(),
  };
}

export function trackHasTakeCard(track) {
  return Boolean(takeCardFromTrack(track));
}

export function take2RowHtml() {
  return `<button type="button" class="discoverTrackSheetRow" data-track-sheet-action="library_take2">Take 2</button>`;
}
