#!/usr/bin/env node
/**
 * Unit checks for Nabad visual DNA (no network).
 *   node scripts/test-nabad-identity.mjs
 */
import { pathToFileURL } from "url";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const mod = await import(pathToFileURL(path.join(root, "src/cover-art/visual-director/nabad-identity.mjs")).href);

const {
  NABAD_VOCABULARY,
  NABAD_DNA_VERSION,
  nabadIdentityPhrases,
  nabadIdentityAvoid,
  nabadPhraseBundleId,
} = mod;

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error(`✗ ${msg}`);
    failed += 1;
  } else {
    console.log(`✓ ${msg}`);
  }
}

assert(NABAD_VOCABULARY.length === 12, "vocabulary has 12 roots");
assert(NABAD_DNA_VERSION === 1, "dna version is 1");

const a = nabadIdentityPhrases({ songId: "song-a", bucketKey: "chill", energy: 0.4 });
const b = nabadIdentityPhrases({ songId: "song-b", bucketKey: "chill", energy: 0.4 });
const a2 = nabadIdentityPhrases({ songId: "song-a", bucketKey: "chill", energy: 0.4 });

assert(a.roots.length >= 4 && a.roots.length <= 6, "4–6 roots sampled");
assert(a.text.length <= 180, "phrase text within char budget");
assert(a.phraseBundleId === nabadPhraseBundleId(a.roots), "bundle id matches roots");
assert(a2.phraseBundleId === a.phraseBundleId, "deterministic for same songId");
assert(b.phraseBundleId !== a.phraseBundleId, "different songs differ");

const hum = nabadIdentityPhrases({ songId: "hum-1", bucketKey: "default", humTrack: true, visualMode: "studio_nook_still_life" });
assert(hum.roots.includes("editorial_still"), "hum track includes editorial_still");
assert(!hum.roots.includes("instrument_sculpture"), "hum track skips instrument_sculpture");

const concrete = nabadIdentityPhrases({ songId: "flower-test", bucketKey: "happy", concreteSubject: true });
assert(!concrete.roots.includes("symbolic_mood"), "concrete subject skips symbolic_mood");
assert(concrete.roots.includes("editorial_still"), "concrete subject uses editorial still life DNA");
assert(!/not literal props/i.test(concrete.text), "concrete DNA avoids anti-literal clause");

const avoid = nabadIdentityAvoid();
assert(avoid.length >= 3 && avoid.length <= 6, "compact identity avoid list");

if (failed) process.exit(1);
console.log("\nAll nabad-identity checks passed.");
