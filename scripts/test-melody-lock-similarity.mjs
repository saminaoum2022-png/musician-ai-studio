#!/usr/bin/env node
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const { compareMelodySimilarity } = require(path.join(root, "api/_lib/melody-lock-similarity.js"));
const { FIXTURE_MELODY } = require(path.join(root, "api/_lib/melody-lock-analyze.js"));

const ref = FIXTURE_MELODY.notes;
const same = compareMelodySimilarity(ref, ref.map((n) => ({ ...n })), { tempoBpm: 92 });
const shifted = compareMelodySimilarity(ref, ref.map((n) => ({ ...n, midi: n.midi + 2 })), {
  tempoBpm: 92,
});

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error(`✗ ${msg}`);
    failed++;
  } else console.log(`✓ ${msg}`);
}

assert(same.score >= 0.95, "identical contours score high");
assert(shifted.score < same.score, "transposed contour scores lower than exact");
assert(same.components.interval !== undefined, "component breakdown present");

if (failed) process.exit(1);
console.log("OK", { same: same.score, shifted: shifted.score });
