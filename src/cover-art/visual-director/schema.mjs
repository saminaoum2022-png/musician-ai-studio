/**
 * Visual Director structured output — song-specific concept layer.
 */
import { NABAD_DNA_VERSION } from "./nabad-identity.mjs";

/** @typedef {"create"|"template"|"spark"|"live"|"hum_track"|"sound"|"mashup"|"instrumental"|"unknown"} CoverSourcePath */
/** @typedef {"landscape"|"figure"|"abstract"|"instrument_still_life"|"user_directed"} CoverVisualMode */

/**
 * @typedef {Object} VisualDirection
 * @property {1} version
 * @property {CoverSourcePath} sourcePath
 * @property {number} confidence
 * @property {string} mainSubject
 * @property {string} emotion
 * @property {string|null} occasion
 * @property {string} setting
 * @property {string[]} visualSymbols
 * @property {string|null} instrumentFocus
 * @property {string} composition
 * @property {string} lighting
 * @property {string} cameraStyle
 * @property {string[]} avoidConcepts
 * @property {CoverVisualMode} visualMode
 * @property {string|null} bucketHint
 * @property {{ dnaVersion: number, roots: string[], phraseBundleId: string }} nabadIdentity
 * @property {{ director: "heuristic"|"gemini"|"preset", model?: string, cached?: boolean }} provenance
 */

export const VISUAL_DIRECTION_VERSION = 1;

const BASE_AVOID = Object.freeze([
  "faces",
  "readable text",
  "typography",
  "watermark",
]);

const COMPOSITION_VOCAB = Object.freeze([
  "centered single focal subject with strong negative space",
  "symmetrical balanced composition with clear focal point",
  "rule of thirds framing with one dominant subject",
]);

function trimField(value, max = 120) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function asStringArray(value, max = 5) {
  if (!Array.isArray(value)) return [];
  return value.map((v) => trimField(v, 80)).filter(Boolean).slice(0, max);
}

/**
 * @param {Partial<VisualDirection>} raw
 * @returns {VisualDirection|null}
 */
export function validateVisualDirection(raw) {
  if (!raw || typeof raw !== "object") return null;
  const mainSubject = trimField(raw.mainSubject, 120);
  if (!mainSubject) return null;

  const avoid = [...new Set([...BASE_AVOID, ...asStringArray(raw.avoidConcepts, 8)])].slice(0, 12);
  const composition = trimField(raw.composition, 100)
    || COMPOSITION_VOCAB[0];

  return {
    version: VISUAL_DIRECTION_VERSION,
    sourcePath: /** @type {CoverSourcePath} */ (raw.sourcePath || "unknown"),
    confidence: Math.min(1, Math.max(0, Number(raw.confidence) || 0.55)),
    mainSubject,
    emotion: trimField(raw.emotion, 60) || "balanced",
    occasion: raw.occasion ? trimField(raw.occasion, 60) : null,
    setting: trimField(raw.setting, 100) || "cinematic atmospheric environment",
    visualSymbols: asStringArray(raw.visualSymbols, 5),
    instrumentFocus: raw.instrumentFocus ? trimField(raw.instrumentFocus, 40) : null,
    composition,
    lighting: trimField(raw.lighting, 100) || "cinematic rim light with soft atmospheric fill",
    cameraStyle: trimField(raw.cameraStyle, 80) || "premium editorial photograph",
    avoidConcepts: avoid,
    visualMode: /** @type {CoverVisualMode} */ (raw.visualMode || "landscape"),
    bucketHint: raw.bucketHint ? trimField(raw.bucketHint, 40) : null,
    nabadIdentity: {
      dnaVersion: NABAD_DNA_VERSION,
      roots: asStringArray(raw.nabadIdentity?.roots, 8),
      phraseBundleId: trimField(raw.nabadIdentity?.phraseBundleId, 120) || "",
    },
    provenance: {
      director: raw.provenance?.director === "gemini" ? "gemini" : raw.provenance?.director === "preset" ? "preset" : "heuristic",
      model: raw.provenance?.model ? trimField(raw.provenance.model, 60) : undefined,
      cached: Boolean(raw.provenance?.cached),
    },
  };
}

export function buildSceneHintFromDirection(direction) {
  if (!direction) return "";
  const parts = [
    direction.mainSubject,
    direction.setting,
    direction.lighting,
    direction.visualSymbols.length ? direction.visualSymbols.join(", ") : "",
  ].filter(Boolean);
  return trimField(parts.join(", "), 220);
}
