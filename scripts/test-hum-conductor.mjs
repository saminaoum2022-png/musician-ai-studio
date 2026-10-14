#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const hc = require("../api/_lib/hum-conductor.js");
const { parseGenerationProducerDetail } = require("../api/_lib/generation-admin-detail.js");

function fail(msg) {
  console.error("FAIL", msg);
  process.exit(1);
}

assert.equal(hc.resolveHumConductorEnabled({ humConductor: "1" }, false), false, "non-admin never on");
assert.equal(hc.resolveHumConductorEnabled({ humConductor: "1" }, true), true);
assert.equal(hc.resolveHumConductorEnabled({ humConductor: "0" }, true), false);
assert.equal(hc.resolveHumConductorEnabled({}, true), false, "admin default off");

const goldMotif =
  "Bar 1 starts with legato D4-C4, staccato Bb3 followed immediately by a precise sixteenth-note rest, smooth legato A3-G3, staccato A3, legato Bb3, and staccato C4. Bar 2 plays legato D4-E half-flat4, a sixteenth-note rest, staccato D4, legato C4, and staccato Bb3 followed by a full quarter-note breath silence.";

const norm = hc.normalizeConductorResult({
  bpm: 96,
  meter: "4/4",
  maqam: "Bayat",
  tonic: "D",
  bars: 2,
  motif_prose: goldMotif,
  play_count: 2,
  silence_between_phrases: true,
});
assert.ok(norm);
assert.equal(norm.bpm, 96);
assert.equal(norm.maqam, "Bayat");
assert.equal(norm.tonic, "D");
assert.ok(norm.motif_prose.includes("sixteenth-note rest"));

assert.equal(hc.normalizeConductorResult({ bpm: 96, motif_prose: "too short" }), null);

assert.equal(
  hc.rewriteHalfFlatSpellings("legato D4-Edb4-F4-G4, staccato Bb3, Edb"),
  "legato D4-E half-flat4-F4-G4, staccato Bb3, E half-flat",
);
const edbNorm = hc.normalizeConductorResult({
  bpm: 96,
  maqam: "Bayat",
  tonic: "D",
  motif_prose: goldMotif.replace("E half-flat4", "Edb4"),
});
assert.ok(edbNorm.motif_prose.includes("E half-flat4"));
assert.equal(/Edb/i.test(edbNorm.motif_prose), false);

const aligned = hc.alignStyleToConductor("piano, arabic, 110 BPM, Maqam Hijaz in A", norm);
assert.ok(/\b96 BPM\b/.test(aligned), `bpm should follow hum: ${aligned}`);
assert.ok(/Maqam Bayat in D/i.test(aligned), `maqam should follow hum: ${aligned}`);
assert.ok(/piano/i.test(aligned), "keep user instrument");

const emptyAligned = hc.alignStyleToConductor("", norm);
assert.ok(/\b96 BPM\b/.test(emptyAligned));
assert.ok(/Maqam Bayat in D/i.test(emptyAligned));

const clash = hc.alignStyleToConductor(
  "Arabic Pop, Levantine acoustic folk, minor key, 110 BPM, D minor, Key: D minor",
  norm,
);
assert.ok(/\b96 BPM\b/.test(clash), `bpm: ${clash}`);
assert.ok(/Maqam Bayat in D/i.test(clash), `maqam: ${clash}`);
assert.equal(/\bD minor\b/i.test(clash), false, `must drop D minor: ${clash}`);
assert.equal(/\bKey:\s*D/i.test(clash), false, `must drop Key: ${clash}`);
assert.equal(/\bminor key\b/i.test(clash), false, `must drop minor key: ${clash}`);
assert.ok(/Levantine acoustic folk/i.test(clash), "keep studio clothes");

const track = hc.buildHumToTrackLyriaPrompt({
  styleLine: aligned,
  conductor: norm,
});
if (!track.ok) fail(`hum to track: ${track.error}`);
assert.ok(track.prompt.includes(goldMotif.slice(0, 40)));
assert.ok(/play the motif twice/i.test(track.prompt));
assert.ok(/keep the rests exactly as written/i.test(track.prompt));
assert.ok(!/guitar fingerpicking/i.test(track.prompt), "must not invent accompaniment");
assert.equal(track.mode, "hum_to_track");

const v3Prompt = [
  "Levantine pop, 96 BPM, Maqam Bayat in D. male lead vocal.",
  "Intro, 8 bars: soft groove",
  "Verse 1, 8 bars: lead and light rhythm",
  "Chorus, 8 bars: full arrangement",
  "Instrumental, 8 bars: lead plus groove",
  "",
  "Lyrics:",
  "",
  "[Verse 1]",
  "يا دني",
].join("\n");

const sung = hc.stitchConductorMotifIntoLyriaPrompt(v3Prompt, norm);
if (!sung.ok) fail(`sung stitch: ${sung.error}`);
assert.ok(/Hummed motif/i.test(sung.prompt));
assert.ok(/written notes/i.test(sung.prompt));
assert.ok(sung.prompt.includes(goldMotif.slice(0, 40)));
assert.ok(sung.prompt.indexOf("Hummed motif") < sung.prompt.indexOf("Lyrics:"));
assert.equal(sung.mode, "sung_motif");

const detail = hc.appendHumConductorAdminDetail({ ok: true, ...norm, model: "gemini-3.6-flash" }, { mode: "hum_to_track" });
assert.ok(detail.includes("hum_conductor: applied"));
assert.ok(detail.includes("hum_conductor_motif:"));
assert.ok(detail.includes("end_hum_conductor_motif"));

const parsed = parseGenerationProducerDetail(
  [
    "pipeline: hum_conductor → lyria (hum_to_track)",
    "hum_conductor: applied",
    "hum_conductor_mode: hum_to_track",
    "hum_conductor_motif:",
    goldMotif,
    "end_hum_conductor_motif",
    "lyria_prompt:",
    track.prompt,
    "end_lyria_prompt",
  ].join("\n"),
);
assert.equal(parsed.producerStatus, "applied");
assert.ok(parsed.humConductorMotif.includes("legato D4-C4"));
assert.ok(parsed.lyriaPrompt.includes("strict note articulation"));

console.log("ok hum-conductor tests");
