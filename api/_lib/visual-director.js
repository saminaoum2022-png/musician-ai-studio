/**
 * Server-side Visual Director loader (shared logic lives in src/cover-art/visual-director).
 */
const path = require("path");
const { pathToFileURL } = require("url");

let _directorMod = null;

async function getDirectorModule() {
  if (!_directorMod) {
    const p = path.join(__dirname, "../../src/cover-art/visual-director/director.mjs");
    _directorMod = await import(pathToFileURL(p).href);
  }
  return _directorMod;
}

/** @returns {"off"|"shadow"|"apply"} */
function getVisualDirectorMode() {
  const raw = String(process.env.COVER_VISUAL_DIRECTOR || "apply").trim().toLowerCase();
  if (["0", "false", "off", "no"].includes(raw)) return "off";
  if (raw === "shadow") return "shadow";
  return "apply";
}

/**
 * @param {object} coverInput
 * @param {{ bucketKey?: string, storyThemeId?: string, storyScene?: string, visualModeHint?: string }} [hints]
 */
async function runVisualDirector(coverInput, hints = {}) {
  const mode = getVisualDirectorMode();
  if (mode === "off") {
    return { mode, direction: null, applied: null };
  }

  const { resolveVisualDirection } = await getDirectorModule();
  const result = await resolveVisualDirection(coverInput, {
    applyToPrompt: mode === "apply",
    hints,
  });

  if (mode === "shadow") {
    console.info("[visual-director:shadow]", {
      songId: coverInput?.songId,
      sourcePath: result.direction?.sourcePath,
      mainSubject: result.direction?.mainSubject?.slice(0, 80),
      phraseBundleId: result.identityBundle?.phraseBundleId,
    });
  }

  return {
    mode,
    direction: result.direction,
    applied: result,
  };
}

module.exports = {
  getVisualDirectorMode,
  runVisualDirector,
};