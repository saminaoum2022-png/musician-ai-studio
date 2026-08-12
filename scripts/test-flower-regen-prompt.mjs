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

const friesIdentity = idMod.nabadIdentityPhrases({ songId: "regen-fries", bucketKey: "happy", concreteSubject: true });
const friesBuilt = promptMod.buildAbstractCoverPrompt(
  { songId: "regen-fries", title: "Mountain Song", lyrics: "climbing peaks at dawn", artworkHint: "fries" },
  { regenSalt: "test", userArtworkOverride: "fries", nabadIdentityPhrases: friesIdentity.text },
);
assert(/fries/i.test(friesBuilt.prompt), "fries hint stays in prompt");
assert(/still life/i.test(friesBuilt.prompt), "fries prompt uses still life framing");
assert(friesBuilt.storyTheme === "user_regen", "fries regen ignores song mountain story theme");
assert(!/mountain/i.test(friesBuilt.prompt), "fries prompt does not inject mountain scene");

const houseHint = "old house";
const housePrepared = promptMod.prepareDirectUserArtworkHint(houseHint);
const houseIdentity = idMod.nabadIdentityPhrases({ songId: "regen-house", bucketKey: "happy", concreteSubject: false });
const houseBuilt = promptMod.buildAbstractCoverPrompt(
  { songId: "regen-house", title: "Table Song", lyrics: "coffee cup on the kitchen table", artworkHint: houseHint },
  { regenSalt: "test", userArtworkOverride: houseHint, nabadIdentityPhrases: houseIdentity.text },
);
assert(/old house|house/i.test(housePrepared), "old house hint survives preparation");
assert(/architectural|environment|cinematic/i.test(housePrepared), "old house gets scene enrichment");
assert(/environment photograph|cinematic environment|wide atmospheric environment/i.test(houseBuilt.prompt), "old house uses scene framing not table still life");
assert(!/editorial still life photograph/i.test(houseBuilt.prompt), "old house prompt is not table still life");
assert(houseBuilt.storyTheme === "user_regen", "old house regen ignores song table story theme");
assert(/table still life|props on table/i.test(houseBuilt.params.landscapeAntiMountainAvoid || ""), "old house negative blocks random table still life");

const birthdayBuilt = promptMod.buildAbstractCoverPrompt(
  { songId: "regen-bday", title: "Mountain Climb", lyrics: "peaks and valleys at dawn", artworkHint: "birthday" },
  { regenSalt: "test", userArtworkOverride: "birthday", nabadIdentityPhrases: idMod.nabadIdentityPhrases({ songId: "regen-bday", bucketKey: "party", concreteSubject: true }).text },
);
assert(/balloon|confetti|celebration|still life/i.test(birthdayBuilt.prompt), "birthday prompt uses celebration still life");
assert(!/mountain/i.test(birthdayBuilt.prompt), "birthday prompt does not inject mountain scene");
assert(birthdayBuilt.bucket === "party", "birthday regen uses party palette bucket");
assert(!/not literal props/i.test(birthdayBuilt.prompt), "birthday prompt avoids anti-literal DNA");

const loveBuilt = promptMod.buildAbstractCoverPrompt(
  { songId: "regen-love", title: "Fog Song", lyrics: "mist and haze", artworkHint: "love" },
  { regenSalt: "test", userArtworkOverride: "love", nabadIdentityPhrases: idMod.nabadIdentityPhrases({ songId: "regen-love", bucketKey: "love", concreteSubject: true }).text },
);
assert(/ring|rose|candle|romantic|still life/i.test(loveBuilt.prompt), "love prompt uses romantic still life props");
assert(loveBuilt.bucket === "love", "love regen uses love palette bucket");
assert(!/not literal props/i.test(loveBuilt.prompt), "love prompt avoids anti-literal haze DNA");

const birdBuilt = promptMod.buildAbstractCoverPrompt(
  { songId: "regen-bird", title: "Mountain Song", lyrics: "peaks at dawn", artworkHint: "bird" },
  { regenSalt: "test", userArtworkOverride: "bird", nabadIdentityPhrases: idMod.nabadIdentityPhrases({ songId: "regen-bird", bucketKey: "chill", concreteSubject: true }).text },
);
assert(/bird/i.test(birdBuilt.prompt), "bird hint stays in prompt");
assert(/wildlife|animal|nature photograph/i.test(birdBuilt.prompt), "bird prompt uses wildlife framing");
assert(!/mountain/i.test(birdBuilt.prompt), "bird prompt does not inject mountain scene");
assert(!/not literal props/i.test(birdBuilt.prompt), "bird prompt avoids anti-literal haze DNA");

if (failed) process.exit(1);
console.log("\nAll flower/fries/old-house/birthday/love/bird regen prompt checks passed.");
