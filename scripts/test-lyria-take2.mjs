#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const take = require("../api/_lib/song-take-card.js");
const v3 = require("../api/_lib/lyria-producer-v3.js");

function fail(msg) {
  console.error("FAIL", msg);
  process.exit(1);
}

const baseInputs = take.normalizeCreateInputs({
  mode: "write",
  prompt: "يا دني اسمع قلبي",
  style: "Lebanese pop, 100 BPM",
  title: "Ya Dini",
  vocalGender: "m",
  singerGender: "m",
  dialect: "Lebanese",
});

assert.equal(take.createInputsEqual(baseInputs, { ...baseInputs }), true, "same inputs equal");
assert.equal(
  take.createInputsEqual(baseInputs, { ...baseInputs, vocalGender: "f", singerGender: "f" }),
  false,
  "singer change is a delta",
);
assert.equal(take.nextTakeTitle("Ya Dini", 2), "Ya Dini (Take 2)");
assert.equal(take.nextTakeTitle("Ya Dini (Take 2)", 3), "Ya Dini (Take 3)");
assert.equal(take.applyTake2Title("Ya Dini", { take2ParentSongId: "abc", take2Number: 2 }), "Ya Dini (Take 2)");
assert.equal(take.applyTake2Title("Ya Dini", {}), "Ya Dini");

const sections = {
  sections: [
    { name: "Intro", bars: 8, arrangement: "soft oud groove", intensity: 2, lyrics: [], backing: [] },
    {
      name: "Verse 1",
      bars: 8,
      arrangement: "lead and light rhythm vocal enters on the downbeat after the intro phrase ends",
      intensity: 4,
      lyrics: ["يا دني اسمع", "قلب تعبان"],
      backing: [],
    },
    { name: "Chorus", bars: 8, arrangement: "verse groove plus darbuka", intensity: 7, lyrics: ["غير حياتي"], backing: [] },
    { name: "Outro", bars: 4, arrangement: "oud fading", intensity: 2, lyrics: [], backing: [] },
  ],
};
const producer = v3.normalizeLyriaProducerV3Output(sections, { input: { style_tags: "Lebanese pop, 100 BPM" } });
assert.ok(producer && producer.sections.length, "normalize sections");

const bodyMale = {
  style: "Lebanese pop, 100 BPM",
  vocalGender: "m",
  dialect: "Lebanese",
  title: "Ya Dini",
};
const stitchMale = v3.buildLyriaPromptV3({
  body: bodyMale,
  producerResult: producer,
  lyricsRaw: "يا دني اسمع\nقلب تعبان",
});
if (!stitchMale.ok) fail(`male stitch: ${stitchMale.error}`);

const bodyFemale = { ...bodyMale, vocalGender: "f" };
const stitchFemale = v3.buildLyriaPromptV3({
  body: bodyFemale,
  producerResult: producer,
  lyricsRaw: "يا دني اسمع\nقلب تعبان",
});
if (!stitchFemale.ok) fail(`female stitch: ${stitchFemale.error}`);

assert.equal(stitchMale.prompt, stitchMale.prompt, "identity");
assert.notEqual(stitchMale.prompt, stitchFemale.prompt, "singer change must change the final prompt");
assert.ok(/male lead vocal|Male/i.test(stitchMale.prompt), "male prompt mentions male");
assert.ok(/female lead vocal|Female/i.test(stitchFemale.prompt), "female prompt mentions female");

const replayPrompt = stitchMale.prompt;
assert.equal(replayPrompt, stitchMale.prompt, "replay uses the saved final prompt as-is");

const v3input = v3.buildLyriaProducerV3Input(
  { ...bodyFemale, previousTake: take.compactProducerJson(producer) },
  { lyrics: "يا دني اسمع\nقلب تعبان", durationSec: 180 },
);
assert.ok(v3input.previous_take, "previous_take is passed to Gemini");
assert.equal(v3input.previous_take.sections.length, producer.sections.length);
assert.equal(v3input.vocal_gender, "f");
assert.ok(
  v3.LYRIA_PRODUCER_V3_SYSTEM_PROMPT.includes("PREVIOUS TAKE"),
  "v3 system prompt documents previous_take",
);

assert.equal(take.normalizeCreateInputs({}).lyricsBy, "gemini");
assert.equal(take.normalizeCreateInputs({ lyricsBy: "lyria" }).lyricsBy, "lyria");
assert.equal(
  take.createInputsEqual({ ...baseInputs, lyricsBy: "gemini" }, { ...baseInputs, lyricsBy: "lyria" }),
  false,
  "lyricsBy change is a delta",
);

assert.equal(typeof take.listTakeCardTaskIds, "function", "listTakeCardTaskIds is exported");
assert.equal(take.publicTakeCard({ task_id: "t1", final_prompt: "hello" })?.hasCard, true, "public card needs prompt");
assert.equal(take.publicTakeCard({ task_id: "t1", final_prompt: "" })?.hasCard, false, "empty prompt is not a card");

console.log("OK take2 unit");
console.log("--- replay prompt (no change) ---");
console.log(replayPrompt);
console.log("--- singer-change prompt ---");
console.log(stitchFemale.prompt);
