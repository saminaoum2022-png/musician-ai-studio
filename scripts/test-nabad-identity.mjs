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

const hum = nabadIdentityPhrases({ songId: "hum-1", bucketKey: "default", humTrack: true, visualMode: "instrument_still_life", instrumentRenderMode: "direct" });
assert(hum.roots.includes("instrument_sculpture"), "direct hum track includes instrument_sculpture");

const humIdentity = nabadIdentityPhrases({ songId: "hum-v-1", bucketKey: "default", humTrack: true, visualMode: "abstract", instrumentRenderMode: "identity" });
assert(!humIdentity.roots.includes("instrument_sculpture"), "identity hum track skips literal instrument_sculpture");
assert(humIdentity.roots.includes("symbolic_mood"), "identity hum track keeps symbolic_mood");

const avoid = nabadIdentityAvoid();
assert(avoid.length >= 3 && avoid.length <= 6, "compact identity avoid list");

if (failed) process.exit(1);
console.log("\nAll nabad-identity checks passed.");
