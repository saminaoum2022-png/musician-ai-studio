#!/usr/bin/env node
/**
 * Unit checks for Visual Director heuristics (no network).
 *   node scripts/test-visual-director.mjs
 */
import { pathToFileURL } from "url";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const mod = await import(pathToFileURL(path.join(root, "src/cover-art/visual-director/director.mjs")).href);

const { resolveVisualDirection } = mod;

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error(`✗ ${msg}`);
    failed += 1;
  } else {
    console.log(`✓ ${msg}`);
  }
}

const create = await resolveVisualDirection({
  songId: "test-create-1",
  title: "Midnight in Beirut",
  mood: "Dark",
  genre: "Arabic pop",
  lyrics: "Under neon rain we dance alone",
  styleInput: "dark Arabic pop, oud, synth",
  energy: 0.7,
});

assert(create.direction?.sourcePath === "create", "create path inferred");
assert(create.direction?.mainSubject, "mainSubject present");
assert(create.identityBundle?.text, "identity phrases present");
assert(!create.directorApplied, "shadow default does not apply to prompt");

const hum = await resolveVisualDirection({
  songId: "test-hum-1",
  title: "Hum Piano",
  humTrack: true,
  instrument: "piano",
  instrumentLabel: "Piano",
  skipGeminiScene: true,
  energy: 0.5,
}, { applyToPrompt: true });

assert(hum.direction?.sourcePath === "hum_track", "hum path inferred");
assert(hum.direction?.visualMode === "studio_nook_still_life", "hum track locks studio nook still life");
assert(hum.direction?.instrumentFocus == null, "hum track has no instrument hero focus");
assert(/no instruments visible|studio nook/i.test(hum.sceneHint || ""), "hum scene hint blocks instruments and people");
assert(/people|hands|face/i.test(hum.avoidMerged || ""), "hum avoid list includes anatomy guards");
assert(hum.directorApplied, "apply mode sets directorApplied");
assert(hum.coverInput?.nabadIdentityPhrases, "DNA phrases attached in apply mode");

const wedding = await resolveVisualDirection({
  songId: "test-wedding-1",
  title: "Our Wedding Dance",
  searchTemplateTitle: "Wedding first dance",
  lyrics: "Forever together under golden light",
  energy: 0.6,
});

assert(wedding.direction?.occasion === "wedding", "wedding occasion detected");

if (failed) process.exit(1);
console.log("\nAll visual-director checks passed.");
