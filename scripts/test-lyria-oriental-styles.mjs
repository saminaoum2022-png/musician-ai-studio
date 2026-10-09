#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { leftoverStylePlaceholders } from "../src/lyria-international-styles.mjs";
import {
  getOrientalStyle,
  listOrientalStyles,
  defaultOrientalSlots,
  fillOrientalStylePrompt,
  ORIENTAL_STYLE_SECTIONS,
} from "../src/lyria-oriental-styles.mjs";

const require = createRequire(import.meta.url);
const take = require("../api/_lib/song-take-card.js");
const fs = require("node:fs");
const path = require("node:path");

function fail(msg) {
  console.error("FAIL", msg);
  process.exit(1);
}

const arabicSrc = fs.readFileSync(
  path.join(path.dirname(new URL(import.meta.url).pathname), "../src/lyria-studio-styles.js"),
  "utf8",
);
assert.ok(arabicSrc.includes('id: "cyber-dabke"'), "arabic styles file still present");
assert.equal(arabicSrc.includes("cyber-dabkeh"), false, "oriental ids not mixed into arabic file");
assert.equal(listOrientalStyles().length, 28, "28 oriental styles");
assert.equal(
  new Set(ORIENTAL_STYLE_SECTIONS.flatMap((s) => s.ids)).size,
  28,
  "sections cover 28 unique ids",
);

for (const style of listOrientalStyles()) {
  const filled = fillOrientalStylePrompt({ style });
  if (!filled.ok) fail(`${style.id} defaults failed: ${filled.error}`);
  assert.equal(leftoverStylePlaceholders(filled.styleLine).length, 0, `${style.id} no leftover`);
  assert.doesNotMatch(filled.styleLine, /Source said/i, `${style.id} developer notes stay out of Lyria line`);
}

assert.ok(arabicSrc.includes('id: "levantine-pop-fusion"'), "arabic levantine-pop-fusion stays");
assert.ok(getOrientalStyle("levantine-pop-fusion"), "oriental levantine-pop-fusion is a separate catalog");

const a = fillOrientalStylePrompt({
  style: getOrientalStyle("levantine-pop-fusion"),
  vocalGender: "m",
});
if (!a.ok) fail(`test a: ${a.error}`);
console.log("\n--- a. Oriental Levantine pop fusion, Male, defaults ---");
console.log(a.styleLine);
assert.match(a.styleLine, /emotional raspy male baritone/);
assert.doesNotMatch(a.styleLine, /smoky female/);
assert.match(a.styleLine, /bright modern synth lead/);
assert.match(a.styleLine, /110 BPM/);
assert.match(a.styleLine, /D minor/);
assert.equal(a.bpm, 110);

const b = fillOrientalStylePrompt({
  style: getOrientalStyle("cyber-dabkeh"),
  vocalGender: "f",
  slots: {
    BPM: "122",
    LEAD: "bright synthwave lead with oud stabs",
  },
});
if (!b.ok) fail(`test b: ${b.error}`);
console.log("\n--- b. Oriental Cyber dabkeh, Female, Speed 122, Sound off default ---");
console.log(b.styleLine);
assert.match(b.styleLine, /passionate energetic female lead vocal/);
assert.doesNotMatch(b.styleLine, /male baritone/);
assert.match(b.styleLine, /bright synthwave lead with oud stabs/);
assert.doesNotMatch(b.styleLine, /aggressive synthesized mijwiz lead/);
assert.match(b.styleLine, /122 BPM/);
assert.equal(b.bpm, 122);

const c = fillOrientalStylePrompt({
  style: getOrientalStyle("levantine-indie-folk"),
  vocalGender: "",
  slots: { MOOD: "tender nostalgic" },
});
if (!c.ok) fail(`test c: ${c.error}`);
console.log("\n--- c. Oriental Levantine indie folk, default female, Mood tender nostalgic ---");
console.log(c.styleLine);
assert.match(c.styleLine, /warm emotive female vocal/);
assert.match(c.styleLine, /tender nostalgic mood/);

const d = fillOrientalStylePrompt({
  style: getOrientalStyle("summer-levantine-dabke-pop"),
  vocalGender: "duo",
});
if (!d.ok) fail(`test d: ${d.error}`);
console.log("\n--- d. Oriental Summer Levantine dabke pop, Duet, defaults ---");
console.log(d.styleLine);
assert.match(d.styleLine, /energetic charismatic male baritone/);
assert.match(d.styleLine, / and /);
assert.match(d.styleLine, /energetic charismatic female lead vocal/);

const leftover = leftoverStylePlaceholders("Arabic pop, {LEAD}, 120 BPM");
assert.deepEqual(leftover, ["{LEAD}"]);

const base = take.normalizeCreateInputs({
  style: a.styleLine,
  vocalGender: "m",
  studioStyleId: "levantine-pop-fusion",
  studioFamily: "oriental",
  studioSlots: defaultOrientalSlots(getOrientalStyle("levantine-pop-fusion")),
});
assert.equal(base.studioFamily, "oriental");
assert.equal(
  take.createInputsEqual(base, { ...base, studioFamily: "arabic" }),
  false,
  "studioFamily distinguishes Oriental from Arabic Take 2",
);

console.log("\nOK oriental studio styles");
