/**
 * Nabad AI visual DNA — compact artistic vocabulary (not a rulebook).
 * Each root must pass: “Would removing this noticeably change the feeling?”
 */
import { fnv1a } from "./hash.mjs";

export const NABAD_DNA_VERSION = 1;

/** @typedef {"void"|"atmosphere"|"accent"|"bloom"|"single_hero"|"breathing_room"|"editorial_still"|"silhouette"|"instrument_sculpture"|"symbolic_mood"|"soft_grain"|"quiet_motion"} NabadRootId */

/** @type {Record<NabadRootId, string>} */
export const NABAD_ROOT_PHRASES = {
  void: "deep void black ground with luminous depth",
  atmosphere: "teal-violet atmospheric haze and soft cyan fill",
  accent: "subtle rose-gold accent glow at low intensity",
  bloom: "glassy diffusion and soft luminous edges",
  single_hero: "single clear focal subject at modest scale",
  breathing_room: "generous negative space and premium restraint",
  editorial_still: "premium cinematic editorial still photography",
  silhouette: "symbolic object still life, no human forms",
  instrument_sculpture: "solo instrument as sculptural hero, moody studio spill light",
  symbolic_mood: "emotion conveyed through light and environment, not literal props",
  soft_grain: "fine photographic grain with clean coherent geometry",
  quiet_motion: "quiet kinetic energy in light flow and gentle drift",
};

/** Canonical vocabulary — the full DNA. */
export const NABAD_VOCABULARY = Object.freeze(Object.keys(NABAD_ROOT_PHRASES));

const CORE_ROOTS = /** @type {NabadRootId[]} */ ([
  "void",
  "atmosphere",
  "bloom",
  "single_hero",
  "breathing_room",
]);

const IDENTITY_AVOID = Object.freeze([
  "people",
  "human",
  "human figure",
  "face",
  "faces",
  "hands",
  "fingers",
  "silhouette",
  "portrait",
  "portrait photography",
  "close-up faces",
  "clip-art look",
  "flat stock lighting",
  "readable text",
]);

const MAX_PHRASE_CHARS = 180;
const MIN_CLAUSES = 4;
const MAX_CLAUSES = 6;

function clampEnergy(energy) {
  if (typeof energy === "number" && Number.isFinite(energy)) {
    return Math.min(1, Math.max(0, energy));
  }
  return 0.5;
}

/**
 * @param {NabadRootId[]} roots
 */
export function nabadPhraseBundleId(roots) {
  return roots.filter(Boolean).join("-");
}

/** Identity-level avoids only — rest stays in NEGATIVE_TEXT_PROMPT. */
export function nabadIdentityAvoid() {
  return [...IDENTITY_AVOID];
}

/**
 * Pick contextual roots beyond the always-on core set.
 * @param {{ energy?: number, visualMode?: string, humTrack?: boolean, bucketKey?: string }} opts
 * @returns {NabadRootId[]}
 */
function contextualRoots(opts = {}) {
  const energy = clampEnergy(opts.energy);
  const visualMode = String(opts.visualMode || "").toLowerCase();
  const humTrack = Boolean(opts.humTrack);
  const bucketKey = String(opts.bucketKey || "default").toLowerCase();
  /** @type {NabadRootId[]} */
  const roots = ["symbolic_mood"];

  if (humTrack || visualMode === "studio_nook_still_life") {
    roots.push("editorial_still", "soft_grain", "breathing_room");
  } else if (visualMode === "figure" || visualMode === "still_life") {
    roots.push("editorial_still", "soft_grain", "symbolic_mood");
  } else if (visualMode === "abstract") {
    roots.push("editorial_still", "quiet_motion", "soft_grain");
  } else {
    roots.push("editorial_still", "soft_grain");
    if (energy > 0.72) roots.push("quiet_motion");
  }

  if (bucketKey === "wedding" || bucketKey === "love" || bucketKey === "happy") {
    roots.push("accent");
  }

  return roots;
}

/**
 * Sample 4–6 DNA clauses for one cover. Deterministic per songId.
 * @param {{ songId?: string, bucketKey?: string, energy?: number, visualMode?: string, humTrack?: boolean }} opts
 */
export function nabadIdentityPhrases(opts = {}) {
  const songId = String(opts.songId || "nabad-song").trim();
  const bucketKey = String(opts.bucketKey || "default").trim();
  const contextual = contextualRoots({ ...opts, bucketKey });
  const pool = [...new Set([...CORE_ROOTS, ...contextual])];
  const seed = fnv1a(`${songId}|${bucketKey}|dna`);

  /** @type {NabadRootId[]} */
  const picked = [];
  for (let i = 0; i < pool.length && picked.length < MAX_CLAUSES; i += 1) {
    const idx = (seed + i * 7919) % pool.length;
    const root = pool[idx];
    if (!picked.includes(root)) picked.push(root);
  }

  while (picked.length < MIN_CLAUSES) {
    const fallback = CORE_ROOTS[picked.length % CORE_ROOTS.length];
    if (!picked.includes(fallback)) picked.push(fallback);
    else break;
  }

  const clauses = picked.map((root) => NABAD_ROOT_PHRASES[root]).filter(Boolean);
  let text = clauses.join(", ");
  if (text.length > MAX_PHRASE_CHARS) {
    text = text.slice(0, MAX_PHRASE_CHARS).replace(/,\s*[^,]*$/, "").trim();
  }

  return {
    roots: picked,
    phraseBundleId: nabadPhraseBundleId(picked),
    text,
    dnaVersion: NABAD_DNA_VERSION,
  };
}

/**
 * @param {object|null|undefined} visualDirection
 * @param {string} bucketKey
 */
export function nabadIdentityFromDirection(visualDirection, bucketKey = "default") {
  const songId = String(visualDirection?.songId || visualDirection?.id || "nabad-song").trim();
  return nabadIdentityPhrases({
    songId,
    bucketKey,
    energy: visualDirection?.energy,
    visualMode: visualDirection?.visualMode,
    humTrack: visualDirection?.humTrack || visualDirection?.sourcePath === "hum_track",
  });
}
