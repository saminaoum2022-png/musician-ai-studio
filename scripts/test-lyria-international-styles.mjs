#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  getInternationalStyle,
  listInternationalStyles,
  allowedSlotValues,
  fillInternationalStylePrompt,
  leftoverStylePlaceholders,
  defaultInternationalSlots,
} from "../src/lyria-international-styles.mjs";

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
assert.equal(arabicSrc.includes("synthpop_80s"), false, "international styles not mixed into arabic file");
assert.equal(listInternationalStyles().length, 10, "10 international styles");

for (const style of listInternationalStyles()) {
  const filled = fillInternationalStylePrompt({ style });
  if (!filled.ok) fail(`${style.id} defaults failed: ${filled.error}`);
  assert.equal(leftoverStylePlaceholders(filled.styleLine).length, 0, `${style.id} no leftover`);
  const allowedLead = allowedSlotValues(style, "LEAD");
  assert.ok(allowedLead.includes(style.slots.LEAD.default), `${style.id} default LEAD is allowed`);
}

const rnb = getInternationalStyle("contemporary_rnb");
const a = fillInternationalStylePrompt({
  style: rnb,
  vocalGender: "f",
});
if (!a.ok) fail(`test a: ${a.error}`);
console.log("\n--- a. Contemporary R&B, female, Simple defaults ---");
console.log(a.styleLine);
assert.match(a.styleLine, /soulful female lead vocal/);
assert.match(a.styleLine, /smooth electric piano/);
assert.match(a.styleLine, /95 BPM/);
assert.doesNotMatch(a.styleLine, /\{[A-Z]+\}/);

const rock = getInternationalStyle("alt_rock");
const b = fillInternationalStylePrompt({
  style: rock,
  vocalGender: "m",
  slots: { LEAD: "clean jangly guitars", BPM: "120" },
});
if (!b.ok) fail(`test b: ${b.error}`);
console.log("\n--- b. Alternative Rock, male, Advanced LEAD jangly + BPM 120 ---");
console.log(b.styleLine);
assert.match(b.styleLine, /bold confident male baritone/);
assert.match(b.styleLine, /clean jangly guitars/);
assert.match(b.styleLine, /120 BPM/);
assert.equal(b.bpm, 120);
assert.doesNotMatch(b.styleLine, /warm overdriven electric guitars/);

const lofi = getInternationalStyle("lofi_hiphop");
const c = fillInternationalStylePrompt({
  style: lofi,
  vocalGender: "",
  slots: { MOOD: "rainy night" },
});
if (!c.ok) fail(`test c: ${c.error}`);
console.log("\n--- c. Lo-fi Hip-Hop, no singer (default male), MOOD rainy night ---");
console.log(c.styleLine);
assert.match(c.styleLine, /smooth relaxed male baritone/);
assert.match(c.styleLine, /rainy night mood/);

const latin = getInternationalStyle("latin_dance_pop");
const d = fillInternationalStylePrompt({
  style: latin,
  vocalGender: "duo",
});
if (!d.ok) fail(`test d: ${d.error}`);
console.log("\n--- d. Latin Dance-Pop, Duet ---");
console.log(d.styleLine);
assert.match(d.styleLine, /warm confident male baritone lead vocal/);
assert.match(d.styleLine, / and /);
assert.match(d.styleLine, /confident bright female lead vocal/);

const leftover = leftoverStylePlaceholders("Contemporary R&B, {LEAD}, 95 BPM");
assert.deepEqual(leftover, ["{LEAD}"]);

const base = take.normalizeCreateInputs({
  style: a.styleLine,
  vocalGender: "f",
  studioStyleId: "contemporary_rnb",
  studioSlots: defaultInternationalSlots(rnb),
});
assert.equal(
  take.createInputsEqual(base, { ...base, studioSlots: { ...base.studioSlots, MOOD: "sensual" } }),
  false,
  "slot change is a Take 2 delta",
);
assert.equal(take.createInputsEqual(base, { ...base }), true, "same international inputs equal");

console.log("\nOK international studio styles");
