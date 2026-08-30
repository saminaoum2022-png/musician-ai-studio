/**
 * Rule-based Visual Director — no LLM required.
 */
import { enforceNoHumansScene, prepareDirectUserArtworkHint, compositionPhraseForCover, isConcreteObjectArtworkHint, isSceneEnvironmentHint, shouldUseLiteralSubjectMode } from "../prompt.js";
import { humTrackStudioNookPhrase } from "./hum-track-cover.mjs";
import { nabadIdentityPhrases } from "./nabad-identity.mjs";
import { validateVisualDirection } from "./schema.mjs";

/** @typedef {import("./context.js").CoverDirectorContext} CoverDirectorContext */

function pickComposition(songId, ctx) {
  const hint = String(ctx?.artworkHint || ctx?.artworkStyle || ctx?.storyScene || "").trim();
  const visualMode = String(ctx?.visualModeHint || "").toLowerCase();
  return compositionPhraseForCover(songId, hint, visualMode === "still_life" ? "still_life" : "");
}

function mainSubjectFromContext(ctx) {
  if (ctx.artworkHint || ctx.artworkStyle) {
    return prepareDirectUserArtworkHint(String(ctx.artworkHint || ctx.artworkStyle).slice(0, 280));
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
  return "cinematic symbolic still life, premium props on dark surface with teal-violet rim light, editorial photograph mood, no people";
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
  if (occasion === "wedding") symbols.push("soft floral glow", "champagne gold bokeh");
  if (occasion === "christmas") symbols.push("evergreen lights", "warm star glow");
  if (occasion === "graduation") symbols.push("mortarboard cap", "rolled diploma", "golden tassel");
  if (ctx.sourcePath === "mashup") symbols.push("interwoven light arcs");
  if (ctx.sonicProfile === "electronic") symbols.push("subtle neon sparkle");
  if (ctx.sonicProfile === "acoustic") symbols.push("organic warm light");
  return symbols.slice(0, 5);
}

function visualModeFromContext(ctx) {
  if (ctx.humTrack || ctx.visualModeHint === "studio_nook_still_life") return "studio_nook_still_life";
  if (ctx.visualModeHint === "still_life") return "still_life";
  if (ctx.visualModeHint === "figure") return "still_life";
  if (ctx.visualModeHint === "abstract" || ctx.sourcePath === "instrumental") return "abstract";
  if (ctx.visualModeHint === "landscape") return "landscape";
  if (/still life/i.test(ctx.storyScene || "")) return "still_life";
  return "abstract";
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
    concreteSubject: shouldUseLiteralSubjectMode(ctx.artworkHint || ctx.artworkStyle, {
      userArtworkOverride: ctx.artworkHint || ctx.artworkStyle,
    }),
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
    composition: pickComposition(ctx.songId, ctx),
    lighting: ctx.energy > 0.75
      ? "sharp rim light with controlled kinetic glow"
      : "soft cinematic rim light with teal-violet atmospheric fill",
    cameraStyle: isConcreteObjectArtworkHint(ctx.artworkHint || ctx.artworkStyle) && !isSceneEnvironmentHint(ctx.artworkHint || ctx.artworkStyle)
      ? "editorial still life photograph, medium-scale props, pulled-back camera, generous margins, no human subjects"
      : visualMode === "studio_nook_still_life"
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
