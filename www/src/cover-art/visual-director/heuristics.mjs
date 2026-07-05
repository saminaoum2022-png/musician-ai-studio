/**
 * Rule-based Visual Director — no LLM required.
 */
import { fnv1a } from "./hash.mjs";
import {
  humTrackInstrumentStillPhrase,
} from "./hum-track-cover.mjs";
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
    return String(ctx.artworkHint || ctx.artworkStyle).slice(0, 120);
  }
  if (ctx.humTrack && ctx.instrumentLabel) {
    return `${humTrackInstrumentStillPhrase(ctx.instrumentLabel, ctx.instrumentId)}, premium studio still life`;
  }
  if (ctx.storyScene) {
    return ctx.storyScene.replace(/, no (people|faces|writing).*$/i, "").trim().slice(0, 120);
  }
  if (ctx.sourcePath === "sound" && ctx.lyrics) {
    return ctx.lyrics.split(/\r?\n/)[0].trim().slice(0, 100) || "abstract sonic atmosphere";
  }
  if (ctx.sourcePath === "mashup") {
    return "layered luminous depth where two musical moods meet, symbolic abstract forms";
  }
  if (ctx.sourcePath === "instrumental") {
    return "premium abstract living light gradients with cinematic bloom, no people";
  }
  return "premium emotional music atmosphere with cinematic environmental storytelling";
}

function settingFromContext(ctx) {
  if (ctx.sourcePath === "hum_track") return "moody studio with soft violet-teal spill light";
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
  if (occasion === "wedding") symbols.push("chandelier bokeh", "soft floral glow");
  if (occasion === "christmas") symbols.push("evergreen lights", "warm star glow");
  if (occasion === "graduation") symbols.push("caps in air as silhouettes");
  if (ctx.sourcePath === "mashup") symbols.push("interwoven light arcs");
  if (ctx.sonicProfile === "electronic") symbols.push("subtle neon sparkle");
  if (ctx.sonicProfile === "acoustic") symbols.push("organic warm light");
  return symbols.slice(0, 5);
}

function visualModeFromContext(ctx) {
  if (ctx.humTrack || ctx.visualModeHint === "instrument_still_life") return "instrument_still_life";
  if (ctx.visualModeHint === "figure") return "figure";
  if (ctx.visualModeHint === "abstract" || ctx.sourcePath === "instrumental") return "abstract";
  return "landscape";
}

function extraAvoid(ctx) {
  /** @type {string[]} */
  const avoid = [];
  if (ctx.humTrack && ctx.instrumentLabel) {
    avoid.push(
      "people",
      "human figure",
      "face",
      "hands",
      "fingers",
      "musician",
      "performer",
      "portrait",
      "holding instrument",
      "full band",
      "wrong instrument",
      "microphone performance shot",
      "surreal objects",
      "impossible geometry",
      "melded objects",
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
    instrumentFocus: ctx.humTrack && ctx.instrumentLabel ? `solo ${ctx.instrumentLabel}` : null,
    composition: pickComposition(ctx.songId),
    lighting: ctx.energy > 0.75
      ? "sharp rim light with controlled kinetic glow"
      : "soft cinematic rim light with teal-violet atmospheric fill",
    cameraStyle: visualMode === "instrument_still_life"
      ? "macro product still life photograph, empty studio, no human subjects"
      : visualMode === "figure"
        ? "wide cinematic silhouette photograph"
        : "premium editorial landscape photograph",
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
