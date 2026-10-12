#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const dialect = require("../api/_lib/arabic-dialect-lyrics.js");
const v3 = require("../api/_lib/lyria-producer-v3.js");

function show(label, before, after) {
  console.log(`\n=== ${label} ===`);
  console.log("BEFORE:");
  console.log(before);
  console.log("AFTER:");
  console.log(after);
}

const ideaBefore = [
  "شو كنتَ عم تفكّر فيّي",
  "عيونَكِ ضحكتَكِ",
  "حَبَيْتُكَ",
].join("\n");
const ideaAfter = dialect.applyLightHarakatPolicy(ideaBefore, {
  source: "gemini",
  address: "male",
  isMsa: false,
}).text;
show("Idea (Gemini-written, address male)", ideaBefore, ideaAfter);
assert.equal(ideaAfter.includes("كنتَ"), false, "male كنت stays plain");
assert.match(ideaAfter, /عيونَك/);
assert.match(ideaAfter, /ضحكتَك/);
assert.match(ideaAfter, /حبيتَك/);
assert.match(ideaAfter, /تفكّر/);
assert.equal(ideaAfter.includes("كَ"), false);
assert.equal(/كِ/.test(ideaAfter.split(/\s/).find((w) => w.includes("عيون")) || ""), false);

const writeBefore = [
  "انت قلبك وكنت بعيد",
  "ضحكتك سحر",
  "شُفتك اليوم",
].join("\n");
const writeAfter = dialect.applyLightHarakatPolicy(writeBefore, {
  source: "user",
  address: "female",
  isMsa: false,
});
show("Write (user lyrics missing address marks, address female)", writeBefore, writeAfter.text);
assert.match(writeAfter.text, /انتِ/);
assert.match(writeAfter.text, /قلبِك/);
assert.match(writeAfter.text, /كنتِ/);
assert.match(writeAfter.text, /ضحكتِك/);
assert.match(writeAfter.text, /شُفتِك/);
assert.ok(writeAfter.addressMarksAdded >= 4, `expected address marks, got ${writeAfter.addressMarksAdded}`);

const momentBefore = [
  "إنت عم تغيب",
  "قلبك معي",
  "رحت وما رجعت",
].join("\n");
const momentAfter = dialect.applyLightHarakatPolicy(momentBefore, {
  source: "gemini",
  address: "male",
  isMsa: false,
}).text;
show("Moment (Idea brief → V3, address male)", momentBefore, momentAfter);
assert.match(momentAfter, /إنتَ/);
assert.match(momentAfter, /قلبَك/);
assert.match(momentAfter, /^رحت /m);
assert.equal(momentAfter.includes("كنتَ"), false);

const userKeepsExtra = dialect.applyLightHarakatPolicy("شُفتْك يا بعدي", {
  source: "user",
  address: "female",
}).text;
assert.match(userKeepsExtra, /شُفتِك/);

const fusha = dialect.applyLightHarakatPolicy("أنت قلبي يا قمر", {
  source: "user",
  address: "female",
  isMsa: true,
}).text;
assert.match(fusha, /أنتِ/);
assert.match(fusha, /قلبي/);

const prompt = v3.LYRIA_PRODUCER_V3_SYSTEM_PROMPT;
assert.match(prompt, /ARABIC HARAKAT \(LIGHT\)/);
assert.match(prompt, /إنتَ، عيونَك، ضحكتَك/);
assert.match(prompt, /إنتِ، عيونِك، ضحكتِك/);
assert.equal(prompt.includes("ـِك"), false, "no kaf-on-kaf female example");
assert.equal(prompt.includes("ـَك"), false, "no kaf-on-kaf male example");
assert.equal(/كنتَ\/كنتِ/.test(prompt), false);
assert.match(prompt, /never كنتَ/);

const sections = v3.normalizeLyriaProducerV3Output({
  sections: [
    { name: "Intro", bars: 8, arrangement: "soft pad keys", intensity: 2, lyrics: [], backing: [] },
    { name: "Verse 1", bars: 8, arrangement: "oud light riqq", intensity: 4, lyrics: ["انت قلبك وكنت بعيد", "ضحكتك سحر"], backing: [] },
    { name: "Chorus", bars: 8, arrangement: "full groove bass", intensity: 7, lyrics: ["ضحكتك سحر"], backing: [] },
    { name: "Final Chorus", bars: 8, arrangement: "full one step bigger", intensity: 7, lyrics: ["ضحكتك سحر"], backing: [] },
    { name: "Outro", bars: 4, arrangement: "pad fading", intensity: 2, lyrics: [], backing: [] },
  ],
}, {
  input: {
    style_tags: "Levantine pop, 105 BPM",
    lyrics_raw: "انت قلبك وكنت بعيد\nضحكتك سحر",
    dialect_hint: "Lebanese",
    arabic_address: "female",
  },
});
assert.equal(sections.harakatMode, "light");
assert.ok(sections.addressMarksAdded >= 3, sections.addressMarksAdded);
assert.match(sections.sections[1].lyrics[0], /انتِ/);
assert.match(sections.sections[1].lyrics[0], /قلبِك/);
assert.match(sections.sections[1].lyrics[0], /كنتِ/);
assert.match(sections.sections[1].lyrics[1], /ضحكتِك/);
assert.ok(Array.isArray(sections.harakatPerLine));
assert.ok(sections.harakatPerLine.some((n) => n > 0));

const lyricsJs = readFileSync(new URL("../api/lyrics.js", import.meta.url), "utf8");
assert.equal(lyricsJs.includes("OPTIONAL: extra harakat"), false);
assert.equal(lyricsJs.includes("اختياري زيادة حركات"), false);
assert.match(lyricsJs, /buildLightHarakatRuleLines/);

const spell = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
assert.match(spell, /سحرتِك/);
assert.equal(spell.includes("سحرتكِ"), false);

console.log("\nok test-light-harakat");
