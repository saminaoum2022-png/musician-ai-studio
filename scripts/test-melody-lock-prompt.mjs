#!/usr/bin/env node
/**
 * Melody Lock prompt builder — fixture MIDI → positive Lyria preview block.
 *   node scripts/test-melody-lock-prompt.mjs
 */
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const { FIXTURE_MELODY } = require(path.join(root, "api/_lib/melody-lock-analyze.js"));
const {
  buildMelodyLockBlock,
  buildLyriaMelodyLockPreview,
} = require(path.join(root, "api/_lib/melody-lock-prompt.js"));
const { assertMelodyLockPromptPositive } = require(path.join(root, "api/_lib/melody-lock-positive.js"));

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error(`✗ ${msg}`);
    failed += 1;
  } else {
    console.log(`✓ ${msg}`);
  }
}

const melody = {
  tempoBpm: FIXTURE_MELODY.tempoBpm,
  meter: FIXTURE_MELODY.meter,
  notes: FIXTURE_MELODY.notes.map((n) => ({ ...n })),
  inferredKey: "D minor",
};

const block = buildMelodyLockBlock(melody, { sourceKind: "hum" });
const preview = buildLyriaMelodyLockPreview({
  melody,
  sourceKind: "hum",
  body: {
    title: "Fixture Hook",
    style: "Arabic pop, warm",
    clip: true,
    durationSec: 30,
    prompt: "[Verse]\nTest line one\n[Chorus]\nHook line",
  },
});

const blockCheck = assertMelodyLockPromptPositive(block);

assert(melody.notes.length >= 6, "fixture has enough notes");
assert(block.includes("Melody Lock:"), "melody block header present");
assert(block.includes("D4") || block.includes("D3"), "note names in timeline");
assert(blockCheck.ok, `melody block positive-only (bad: ${blockCheck.bad.join(", ")})`);
assert(preview.includes("Arrangement:"), "preview keeps v2 arrangement section");
assert(preview.indexOf("Melody Lock:") < preview.indexOf("Arrangement:"), "melody block before arrangement");
const previewMelodySlice = preview.slice(
  preview.indexOf("Melody Lock:"),
  preview.indexOf("Arrangement:"),
);
const sliceCheck = assertMelodyLockPromptPositive(previewMelodySlice);
assert(sliceCheck.ok, `melody slice in preview positive-only (bad: ${sliceCheck.bad.join(", ")})`);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\n--- lyriaPromptPreview (excerpt) ---\n");
console.log(preview.slice(0, 1200));
console.log("\nOK");
