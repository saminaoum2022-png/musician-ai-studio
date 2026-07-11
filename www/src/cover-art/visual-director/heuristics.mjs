/**
 * Rule-based Visual Director — no LLM required.
 */
import { fnv1a } from "./hash.mjs";
import { enforceNoHumansScene } from "../prompt.js";
import { humTrackStudioNookPhrase } from "./hum-track-cover.mjs";
import { nabadIdentityPhrases } from "./nabad-identity.mjs";
import { validateVisualDirection } from "./schema.mjs";

/** @typedef {import("./context.js").CoverDirectorContext} CoverDirectorContext */

const COMPOSITIONS = [
  "centered single focal subject with strong negative space",
  "symmetrical balanced composition with clear focal point",
  "rule of thirds framing with one dominant subject",
];

function pickComposition(songId) {
  return COMPOSITIONS[fnv1a(`${songId}:vd-comp`) % COMPOSITIONS.length];
}

function mainSubjectFromContext(ctx) {
  if (ctx.artworkHint || ctx.artworkStyle) {
    return enforceNoHumansScene(String(ctx.artworkHint || ctx.artworkStyle).slice(0, 120));
  }
  if (ctx.humTrack && ctx.instrumentLabel) {
    return `${humTrackStudioNookPhrase(ctx.instrumentLabel, ctx.instrumentId)}, premium studio nook still life`;
  }
  if (ctx.storyScene) {
    return enforceNoHumansScene(
      ctx.storyScene.replace(/, no (people|faces|writing).*$/i, "").trim().slice(0, 120),
    );
  }
  if (ctx.sourcePath === "sound" && ctx.lyrics) {
    return enforceNoHumansScene(ctx.lyrics.split(/\r?\n/)[0].trim().slice(0, 100) || "abstract sonic atmosphere");
  }
  if (ctx.sourcePath === "mashup") {
    return "layered luminous depth where two musical moods meet, symbolic abstract forms, no people";
  }
  if (ctx.sourcePath === "instrumental") {
    return "premium abstract living light gradients with cinematic bloom, no people";
  }
  return "premium symbolic object still life with cinematic environmental mood, no people";
}

function settingFromContext(ctx) {
  if (ctx.sourcePath === "hum_track") {
    return "moody studio nook with soft violet-teal spill light, window sunlight and long shadows";
  }
  if (ctx.sourcePath === "sound") return ctx.energy > 0.7 ? "dynamic neon atmospheric space" : "calm minimal atmospheric void";
  if (ctx.sourcePath === "mashup") return "layered depth planes with dual glow accents";
  if (/ocean|beach|sea|coast/i.test(ctx.storyScene)) return "coastal horizon at dusk";
  if (/city|urban|street|skyline/i.test(ctx.storyScene)) return "cinematic urban night environment";
  if (/mountain|peak|summit/i.test(ctx.storyScene)) return "grand mountain landscape at dusk";
  if (/wedding|ballroom|ceremony/i.test(ctx.storyScene)) return "elegant ceremony interior with warm golden light";
  return "cinematic atmospheric environment with soft depth";
}

function visualSymbolsFromContext(ctx) {
  /** @type {string[]} */
  const symbols = [];
  const occasion = String(ctx.occasionLabel || "").toLowerCase();
  if (occasion === "birthday") symbols.push("soft candle glow", "celebration balloons as bokeh");
  if (occasion === "wedding") symbols.push("diamond rings on satin", "soft floral glow");
  if (occasion === "christmas") symbols.push("evergreen lights", "warm star glow");
  if (occasion === "graduation") symbols.push("mortarboard cap", "rolled diploma", "golden tassel");
  if (ctx.sourcePath === "mashup") symbols.push("interwoven light arcs");
  if (ctx.sonicProfile === "electronic") symbols.push("subtle neon sparkle");
  if (ctx.sonicProfile === "acoustic") symbols.push("organic warm light");
  return symbols.slice(0, 5);
}

function visualModeFromContext(ctx) {
  if (ctx.humTrack || ctx.visualModeHint === "studio_nook_still_life") return "studio_nook_still_life";
  if (ctx.visualModeHint === "figure" || ctx.visualModeHint === "still_life") return "landscape";
  if (ctx.visualModeHint === "abstract" || ctx.sourcePath === "instrumental") return "abstract";
  return "landscape";
}

const GLOBAL_HUMAN_AVOID = Object.freeze([
  "people",
  "human",
  "human figure",
  "face",
  "faces",
  "hands",
  "fingers",
  "silhouette",
  "portrait",
  "body",
  "anatomy",
]);

function extraAvoid(ctx) {
  /** @type {string[]} */
  const avoid = [...GLOBAL_HUMAN_AVOID];
  if (ctx.humTrack && ctx.instrumentLabel) {
    avoid.push(
      "musician",
      "performer",
      "holding instrument",
      "full band",
      "wrong instrument",
      "microphone performance shot",
      "surreal objects",
      "impossible geometry",
      "melded objects",
      "instrument",
      "ukulele",
      "guitar",
      "violin",
      "piano keys",
      "flute",
      "synthesizer",
      "neck",
      "headstock",
      "strings on instrument",
    );
  }
  if (ctx.sourcePath === "sound") avoid.push("literal lyrics text", "ui elements");
  if (ctx.sourcePath === "mashup") avoid.push("split-screen collage", "two album covers");
  return avoid;
}

/**
 * @param {CoverDirectorContext} ctx
 */
export function resolveHeuristicVisualDirection(ctx) {
  const visualMode = visualModeFromContext(ctx);
  const identity = nabadIdentityPhrases({
    songId: ctx.songId,
    bucketKey: ctx.bucketKey,
    energy: ctx.energy,
    visualMode,
    humTrack: ctx.humTrack,
  });

  const raw = {
    sourcePath: ctx.sourcePath,
    confidence: ctx.artworkHint || ctx.storyScene ? 0.68 : 0.58,
    mainSubject: mainSubjectFromContext(ctx),
    emotion: ctx.mood || "balanced",
    occasion: ctx.occasionLabel || null,
    setting: settingFromContext(ctx),
    visualSymbols: visualSymbolsFromContext(ctx),
    instrumentFocus: null,
    composition: pickComposition(ctx.songId),
    lighting: ctx.energy > 0.75
      ? "sharp rim light with controlled kinetic glow"
      : "soft cinematic rim light with teal-violet atmospheric fill",
    cameraStyle: visualMode === "studio_nook_still_life"
      ? "editorial studio nook still life photograph, props only, no instruments, no human subjects"
      : "premium editorial still life or landscape photograph, symbolic objects only, no human subjects",
    avoidConcepts: extraAvoid(ctx),
    visualMode,
    bucketHint: ctx.bucketKey,
    nabadIdentity: {
      dnaVersion: identity.dnaVersion,
      roots: identity.roots,
      phraseBundleId: identity.phraseBundleId,
    },
    provenance: { director: ctx.humTrack && ctx.instrumentLabel ? "preset" : "heuristic" },
  };

  return validateVisualDirection(raw);
}
