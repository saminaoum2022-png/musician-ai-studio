#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const v3 = require("../api/_lib/lyria-producer-v3.js");
const eleven = require("../api/_lib/elevenlabs-music-upstream.js");

function fail(msg) {
  console.error("FAIL", msg);
  process.exit(1);
}

const writeNorm = v3.normalizeLyriaProducerV3Output({
  sections: [
    { name: "Intro", bars: 4, arrangement: "soft strings pad", intensity: 2, lyrics: [], backing: [] },
    { name: "Verse 1", bars: 8, arrangement: "acoustic textures guitar", intensity: 4, lyrics: ["I walk the old street", "tonight I miss your name"], backing: [] },
    { name: "Chorus", bars: 8, arrangement: "full keys drums bass", intensity: 7, lyrics: ["I miss your name"], backing: [] },
    { name: "Instrumental", bars: 4, arrangement: "oud and strings break", intensity: 3, lyrics: [], backing: [] },
    { name: "Final Chorus", bars: 8, arrangement: "full one step bigger", intensity: 8, lyrics: ["I miss your name"], backing: [] },
    { name: "Outro", bars: 4, arrangement: "strings fading", intensity: 2, lyrics: [], backing: [] },
  ],
}, { input: { style_tags: "Levantine pop, 105 BPM" } });

const stitch = v3.buildLyriaPromptV3({
  body: { style: "Levantine pop, 105 BPM", vocalGender: "m" },
  producerResult: writeNorm,
  lyricsRaw: "I walk the old street tonight I miss your name forever",
});
if (!stitch.ok) fail(`v3 stitch: ${stitch.error}`);

const built = eleven.buildElevenCompositionPlanFromLyriaV3({
  stitch,
  musicLengthMs: 180000,
  vocalGender: "m",
  useNabadVocalIdentity: false,
});
if (!built.ok) fail(`eleven v3 plan: ${built.error}`);
assert.equal(built.planSource, "lyria_producer_v3");
assert.ok(built.plan.chunks.length >= 6, `expected 6+ chunks, got ${built.plan.chunks.length}`);
assert.equal(built.bpm, 105);

const names = built.plan.chunks.map((c) => String(c.text || "").split("\n")[0]);
assert.ok(names[0].includes("Intro"), names[0]);
assert.ok(names.some((n) => /Verse 1/.test(n)), names.join("|"));
assert.ok(names.some((n) => /Chorus/.test(n)), names.join("|"));
assert.ok(names.some((n) => /Instrumental/.test(n)), names.join("|"));

const intro = built.plan.chunks[0];
assert.ok(/\{instrumental\}/.test(intro.text), intro.text);
assert.ok(intro.negative_styles.some((t) => /vocals/i.test(t)), String(intro.negative_styles));
assert.ok(intro.duration_ms >= 3000);

const verse = built.plan.chunks.find((c) => /\[Verse 1\]/.test(c.text));
assert.ok(verse, "verse chunk");
assert.ok(verse.text.includes("I walk the old street"), verse.text);
assert.ok(verse.positive_styles.some((t) => /105 BPM/.test(t)), String(verse.positive_styles));
assert.ok(verse.duration_ms >= 16000 && verse.duration_ms <= 22000, `verse ${verse.duration_ms} should stay ~8 bars at 105 BPM`);

const totalMs = built.plan.chunks.reduce((s, c) => s + Number(c.duration_ms || 0), 0);
assert.ok(totalMs >= 70000 && totalMs <= 130000, `total ${totalMs} should follow bars, not stretch to 180s`);
assert.ok(Math.abs(built.musicLengthMs - totalMs) <= 2000, `musicLengthMs ${built.musicLengthMs}`);

const withRef = eleven.buildElevenCompositionPlanFromLyriaV3({
  stitch,
  musicLengthMs: 180000,
  vocalGender: "m",
  useNabadVocalIdentity: false,
  referenceSongId: "song_test_ref_1",
  referenceRangeMs: 8000,
  conditionStrength: "high",
});
if (!withRef.ok) fail(`eleven v3 ref: ${withRef.error}`);
assert.equal(withRef.planSource, "lyria_producer_v3_reference");
assert.ok(!withRef.plan.chunks[0].conditioning_ref, "intro must stay free of the dry hum");
const verseRef = withRef.plan.chunks.find((c) => /\[Verse 1\]/.test(c.text));
assert.ok(verseRef?.conditioning_ref?.song_id === "song_test_ref_1");
assert.equal(verseRef.conditioning_ref.range.end_ms, 8000);
assert.equal(verseRef.condition_strength, "medium");
assert.ok(
  (verseRef.positive_styles || []).some((t) => /acoustic textures guitar/i.test(t)),
  "verse keeps the producer arrangement, not a forced drum kit",
);
assert.equal(
  (verseRef.positive_styles || []).some((t) => /drums and bass/i.test(t)),
  false,
);

const dump = eleven.formatElevenPlanForAdmin(withRef.plan);
assert.ok(/\[Verse 1\]/.test(dump) && /REF medium/.test(dump), dump);
assert.ok(/\[Intro\]/.test(dump) && /no_ref/.test(dump), dump);
assert.ok(/arr:/.test(dump), dump);

const missing = eleven.buildElevenCompositionPlanFromLyriaV3({ stitch: { ok: false } });
assert.equal(missing.ok, false);

console.log("elevenlabs-producer-v3", built.plan.chunks.map((c) => {
  const tag = String(c.text || "").split("\n")[0];
  return `${tag}:${Math.round(c.duration_ms / 1000)}s`;
}).join(" | "));
console.log("elevenlabs-producer-v3 tests ok");
