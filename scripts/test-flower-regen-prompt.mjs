#!/usr/bin/env node
/** Ensures concrete user hints (e.g. flower) keep literal still-life DNA. */
import path from "path";
import { pathToFileURL } from "url";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const promptMod = await import(pathToFileURL(path.join(root, "src/cover-art/prompt.js")).href);
const idMod = await import(pathToFileURL(path.join(root, "src/cover-art/visual-director/nabad-identity.mjs")).href);

const hint = "flower";
const prepared = promptMod.prepareDirectUserArtworkHint(hint);
const identity = idMod.nabadIdentityPhrases({ songId: "regen-flower", bucketKey: "happy", concreteSubject: true });
const built = promptMod.buildAbstractCoverPrompt(
  { songId: "regen-flower", title: "Test Song", artworkHint: hint },
  { regenSalt: "test", userArtworkOverride: hint, nabadIdentityPhrases: identity.text },
);

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error(`✗ ${msg}`);
    failed += 1;
  } else {
    console.log(`✓ ${msg}`);
  }
}

assert(/flower/i.test(prepared), "flower hint survives preparation");
assert(/botanical|recognizable flowers/i.test(prepared), "flower hint gets botanical enrichment");
assert(!/not literal props/i.test(identity.text), "concrete DNA has no anti-literal clause");
assert(/photorealistic editorial still life/i.test(built.prompt), "prompt leads with literal still life");
assert(/flower/i.test(built.prompt), "prompt still names flower");
assert(!/not literal props/i.test(built.prompt), "prompt excludes anti-literal DNA");

if (failed) process.exit(1);
console.log("\nAll flower regen prompt checks passed.");
