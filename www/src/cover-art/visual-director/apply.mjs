/**
 * Merge Visual Director + Nabad DNA into prompt-builder inputs.
 */
import { humTrackAvoidTags } from "./hum-track-cover.mjs";
import { nabadIdentityAvoid, nabadIdentityPhrases, NABAD_ROOT_PHRASES } from "./nabad-identity.mjs";
import { buildSceneHintFromDirection } from "./schema.mjs";

/** @typedef {import("./schema.js").VisualDirection} VisualDirection */

function sanitizeScenePhrase(raw) {
  return String(raw || "").replace(/\s+/g, " ").trim().slice(0, 220);
}

/**
 * @param {object} coverInput
 * @param {VisualDirection|null|undefined} direction
 * @param {{ applyToPrompt?: boolean, bucketKey?: string }} [opts]
 */
export function applyVisualDirection(coverInput, direction, opts = {}) {
  const bucketKey = String(opts.bucketKey || direction?.bucketHint || "default").trim();
  const songId = String(coverInput?.songId || coverInput?.id || "").trim();
  const identity = direction?.nabadIdentity?.roots?.length
    ? {
        roots: direction.nabadIdentity.roots,
        phraseBundleId: direction.nabadIdentity.phraseBundleId,
        text: direction.nabadIdentity.roots
          .map((root) => NABAD_ROOT_PHRASES[root])
          .filter(Boolean)
          .join(", ")
          .slice(0, 180),
        dnaVersion: direction.nabadIdentity.dnaVersion,
      }
    : nabadIdentityPhrases({
        songId,
        bucketKey,
        energy: coverInput?.energy,
        visualMode: direction?.visualMode,
        humTrack: coverInput?.humTrack,
      });

  const sceneHint = buildSceneHintFromDirection(direction);
  const userArtwork = sanitizeScenePhrase(String(coverInput?.artworkStyle || coverInput?.artworkHint || "").trim());

  const humTrack = Boolean(coverInput?.humTrack || direction?.sourcePath === "hum_track");
  const avoidMerged = [
    ...nabadIdentityAvoid(),
    ...(direction?.avoidConcepts || []),
    ...(humTrack || direction?.visualMode === "studio_nook_still_life"
      ? humTrackAvoidTags("").split(/,\s*/)
      : []),
    String(coverInput?.avoidTagsInput || "").trim(),
  ]
    .filter(Boolean)
    .join(", ");

  if (!opts.applyToPrompt) {
    return {
      coverInput,
      sceneHint: sanitizeScenePhrase(sceneHint),
      identityPhrases: identity.text,
      identityBundle: identity,
      avoidMerged,
      directorApplied: false,
    };
  }

  const hasUserArtwork = Boolean(userArtwork);
  const directorScene = sanitizeScenePhrase(sceneHint);

  /** @type {object} */
  const enriched = { ...coverInput, avoidTagsInput: avoidMerged };

  if (!hasUserArtwork && directorScene) {
    enriched.directorSceneHint = directorScene;
  }

  enriched.nabadIdentityPhrases = identity.text;

  return {
    coverInput: enriched,
    sceneHint: directorScene,
    identityPhrases: identity.text,
    identityBundle: identity,
    avoidMerged,
    directorApplied: true,
  };
}

/**
 * Compact one-liner for Gemini scene brief.
 * @param {VisualDirection|null|undefined} direction
 * @param {string} identityOneLiner
 */
export function nabadBriefLine(direction, identityOneLiner) {
  const line = String(identityOneLiner || "").trim()
    || "deep void, teal-violet haze, soft bloom, one hero, generous empty space, no faces";
  if (!direction) return `Nabad look: ${line}.`;
  return [
    `Nabad look: ${line}.`,
    direction.instrumentFocus ? `Instrument focus: ${direction.instrumentFocus}.` : "",
    direction.occasion ? `Occasion mood: ${direction.occasion} (visual only).` : "",
  ].filter(Boolean).join(" ");
}
