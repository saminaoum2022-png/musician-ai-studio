#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const v3 = require("../api/_lib/lyria-producer-v3.js");

function fail(msg) {
  console.error("FAIL", msg);
  process.exit(1);
}

function mockSections({ mawwal = false, lyrics } = {}) {
  const chorus = lyrics?.chorus || ["hook line one", "hook line two"];
  const verse1 = lyrics?.verse1 || ["verse one a", "verse one b"];
  const verse2 = lyrics?.verse2 || ["verse two a", "verse two b"];
  const list = [
    mawwal
      ? { name: "Mawwal", bars: 6, arrangement: "solo oud free-time", intensity: 3, lyrics: ["يا دني"], backing: [] }
      : { name: "Intro", bars: 4, arrangement: "soft sparse opening", intensity: 2, lyrics: [], backing: [] },
    { name: "Verse 1", bars: 8, arrangement: "lead and light rhythm space", intensity: 4, lyrics: verse1, backing: [] },
    { name: "Chorus", bars: 8, arrangement: "full arrangement", intensity: 7, lyrics: chorus, backing: ["يا دني"] },
    { name: "Verse 2", bars: 8, arrangement: "same pocket new color", intensity: 4, lyrics: verse2, backing: [] },
    { name: "Final Chorus", bars: 8, arrangement: "full one step bigger", intensity: 8, lyrics: chorus, backing: ["يا دني"] },
    { name: "Outro", bars: 4, arrangement: "opening color fading", intensity: 2, lyrics: [], backing: [] },
  ];
  return v3.normalizeLyriaProducerV3Output({ sections: list }, { input: { style_tags: mawwal ? "Mawwal tarab" : "pop" } });
}

assert.equal(v3.defaultBpmForStyleFamily("Lebanese dabke wedding"), 126);
assert.equal(v3.defaultBpmForStyleFamily("Modern Khaleeji pop"), 95);
assert.equal(v3.defaultBpmForStyleFamily("piano ballad sad"), 80);
assert.equal(v3.defaultBpmForStyleFamily("Greek-Arabic pop"), 105);
assert.equal(v3.extractBpmFromText("85 BPM Bayati"), 85);

assert.equal(v3.styleAlreadyDescribesVocal("rich warm male vocal with vibrato"), true);
assert.equal(v3.styleAlreadyDescribesVocal("Lebanese folk, 85 BPM"), false);

const described = v3.composeV3StyleLine(
  { style: "rich warm male vocal, Lebanese folk", vocalGender: "m" },
  { bpmAppended: 0 },
);
assert.equal(described.includes("male lead vocal"), false, "must not duplicate vocal");

const missingVocal = v3.composeV3StyleLine(
  { style: "Lebanese folk", vocalGender: "m" },
  { bpmAppended: 0 },
);
assert.ok(missingVocal.includes("male lead vocal"));

const bpmAppend = v3.composeV3StyleLine(
  { style: "Levantine pop" },
  { bpmAppended: 105 },
);
assert.ok(/\b105 BPM\b/.test(bpmAppend));

const lebanese = {
  style: "Lebanese folk, classic Tarab, free-time Mawwal intro with solo oud, rich warm male vocal, 85 BPM, Bayati maqam",
  vocalGender: "m",
  dialect: "Lebanese",
  arabicAddress: "male",
  ideaPrompt: true,
  ideaBrief: "someone who wants to change his life",
};
const lebaneseNorm = mockSections({
  mawwal: true,
  lyrics: {
    verse1: ["يا دني اسمع", "قلب تعبان"],
    verse2: ["بدي فيي امشي", "على درب تاني"],
    chorus: ["غير حياتي", "وإعمل الدنيا"],
  },
});
const lebaneseStitch = v3.buildLyriaPromptV3({
  body: lebanese,
  producerResult: lebaneseNorm,
  lyricsRaw: "",
});
if (!lebaneseStitch.ok) fail(`lebanese stitch: ${lebaneseStitch.error}`);
assert.ok(lebaneseStitch.prompt.startsWith(lebaneseStitch.styleLine));
assert.ok(lebaneseStitch.prompt.includes("\nLyrics:\n"));
assert.equal(/\bIntensity\s+\d/.test(lebaneseStitch.prompt), false);
assert.equal(lebaneseStitch.styleLine.includes("male lead vocal"), false);
assert.equal(lebaneseStitch.bpm, 85);
const mawwalLine = lebaneseStitch.prompt.split("\n").find((l) => l.includes("] Mawwal:"));
assert.ok(mawwalLine, "mawwal timestamp");
const mTimes = mawwalLine.match(/\[(\d):(\d{2}) - (\d):(\d{2})\]/);
const mDur = Number(mTimes[3]) * 60 + Number(mTimes[4]) - (Number(mTimes[1]) * 60 + Number(mTimes[2]));
assert.ok(mDur >= 15 && mDur <= 20, `mawwal duration ${mDur}`);

const pop = {
  style: "Greek-Arabic pop, bouzouki and oud, warm vocal",
  vocalGender: "f",
  dialect: "Levantine",
};
const popStitch = v3.buildLyriaPromptV3({
  body: pop,
  producerResult: mockSections({
    lyrics: {
      verse1: ["night over athens", "lights on the water"],
      verse2: ["two names one song", "we keep the melody"],
      chorus: ["hold the line", "don't let go"],
    },
  }),
  lyricsRaw: "",
});
if (!popStitch.ok) fail(`pop stitch: ${popStitch.error}`);
assert.equal(popStitch.bpm, 105);
assert.ok(/\b105 BPM\b/.test(popStitch.styleLine));

const khaleeji = {
  style: "Modern Khaleeji pop, oud and mirwas, laid-back groove",
  vocalGender: "m",
  dialect: "Gulf",
};
const khStitch = v3.buildLyriaPromptV3({
  body: khaleeji,
  producerResult: mockSections({
    lyrics: {
      verse1: ["يا ليل الخليج", "نجوم فوق البيت"],
      verse2: ["امسكن يدي", "على درب البيت"],
      chorus: ["هذا ليلي", "هذا صوتي"],
    },
  }),
  lyricsRaw: "",
});
if (!khStitch.ok) fail(`khaleeji stitch: ${khStitch.error}`);
assert.equal(khStitch.bpm, 95);

const writeOriginal = "I walk the old street tonight I miss your name forever";
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
const writeStitch = v3.buildLyriaPromptV3({
  body: { style: "Levantine pop, 105 BPM", vocalGender: "m" },
  producerResult: writeNorm,
  lyricsRaw: writeOriginal,
});
if (!writeStitch.ok) fail(`write adapted stitch: ${writeStitch.error}`);
assert.ok(writeStitch.prompt.includes("acoustic textures"));
assert.ok(writeStitch.prompt.includes("[") && writeStitch.prompt.includes("Instrumental"));
assert.ok(writeStitch.prompt.includes("vocal enters on the downbeat after the intro phrase ends"));
const writeIntro = writeStitch.prompt.split("\n").find((l) => l.includes("] Intro:"));
assert.ok(writeIntro);
const writeIntroTimes = writeIntro.match(/\[(\d):(\d{2}) - (\d):(\d{2})\]/);
const writeIntroDur = Number(writeIntroTimes[3]) * 60 + Number(writeIntroTimes[4])
  - (Number(writeIntroTimes[1]) * 60 + Number(writeIntroTimes[2]));
assert.ok(writeIntroDur >= 16, `intro must be >= 8 bars (~16s+), got ${writeIntroDur}s from ${writeIntro}`);

const mawwalZero = v3.normalizeLyriaProducerV3Output({
  sections: [
    { name: "Mawwal", bars: 0, arrangement: "", intensity: 3, lyrics: ["يا ليل"], backing: [] },
    { name: "Verse 1", bars: 8, arrangement: "oud nay light riqq", intensity: 4, lyrics: ["قلبي تعبان"], backing: [] },
    { name: "Chorus", bars: 8, arrangement: "violins and darbuka", intensity: 7, lyrics: ["يا دني"], backing: [] },
    { name: "Final Chorus", bars: 8, arrangement: "full tarab", intensity: 8, lyrics: ["يا دني"], backing: [] },
    { name: "Outro", bars: 4, arrangement: "oud fading", intensity: 2, lyrics: [], backing: [] },
  ],
}, { input: { style_tags: "classic Tarab, Mawwal, 80 BPM" } });
assert.equal(mawwalZero.sections[0].name, "Mawwal");
assert.equal(mawwalZero.sections[0].bars, 0);
assert.ok(mawwalZero.sections[0].arrangement);
const mawwalZeroStitch = v3.buildLyriaPromptV3({
  body: { style: "classic Tarab, Mawwal, 80 BPM", vocalGender: "m" },
  producerResult: mawwalZero,
  lyricsRaw: "يا ليل قلبي تعبان يا دني",
});
if (!mawwalZeroStitch.ok) fail(`mawwal 0 bars stitch: ${mawwalZeroStitch.error}`);
const mzLine = mawwalZeroStitch.prompt.split("\n").find((l) => l.includes("] Mawwal:"));
const mzTimes = mzLine.match(/\[(\d):(\d{2}) - (\d):(\d{2})\]/);
const mzDur = Number(mzTimes[3]) * 60 + Number(mzTimes[4]) - (Number(mzTimes[1]) * 60 + Number(mzTimes[2]));
assert.ok(mzDur >= 15 && mzDur <= 20, `mawwal fixed window ${mzDur}`);
const mawwalAdmin = v3.appendLyriaProducerV3AdminDetail(
  { ok: true, v3: true, fallback: false },
  mawwalZeroStitch,
);
assert.ok(/producer: applied/.test(mawwalAdmin));
assert.ok(/Mawwal:\d+s/.test(mawwalAdmin), mawwalAdmin);

assert.equal(v3.resolveLyricsBy({ ideaPrompt: true, lyricsBy: "lyria" }, false), "gemini");
assert.equal(v3.resolveLyricsBy({ ideaPrompt: true, lyricsBy: "lyria" }, true), "lyria");
assert.equal(v3.resolveLyricsBy({ ideaPrompt: true, lyricsBy: "gemini" }, true), "gemini");
assert.equal(v3.resolveLyricsBy({ lyricsBy: "lyria" }, true), "gemini");
assert.ok(v3.resolveLyriaProducerV3SystemPrompt({ lyricsBy: "lyria" }).includes("LYRICS BY LYRIA"));
assert.equal(
  v3.resolveLyriaProducerV3SystemPrompt({ lyricsBy: "gemini" }).includes("LYRICS BY LYRIA"),
  false,
);

const lyriaBriefs = v3.normalizeLyriaProducerV3Output({
  sections: [
    { name: "Intro", bars: 8, arrangement: "soft opening", intensity: 2, lyrics: ["should clear"], backing: [] },
    { name: "Verse 1", bars: 8, arrangement: "lead and light rhythm", intensity: 4, lyrics: ["he wants a new life after the city wore him down"], backing: [] },
    { name: "Chorus", bars: 8, arrangement: "full arrangement", intensity: 7, lyrics: ["the hook is starting over tonight"], backing: [] },
    { name: "Final Chorus", bars: 8, arrangement: "full one step bigger", intensity: 8, lyrics: ["a different chorus brief"], backing: [] },
    { name: "Outro", bars: 4, arrangement: "opening color fading", intensity: 2, lyrics: ["no"], backing: [] },
  ],
}, { input: { style_tags: "Levantine pop", lyrics_by: "lyria" }, lyricsBy: "lyria" });
assert.deepEqual(lyriaBriefs.sections.find((s) => s.name === "Intro").lyrics, []);
assert.deepEqual(lyriaBriefs.sections.find((s) => s.name === "Outro").lyrics, []);
assert.equal(
  lyriaBriefs.sections.find((s) => s.name === "Chorus").lyrics[0],
  lyriaBriefs.sections.find((s) => s.name === "Final Chorus").lyrics[0],
);

const lyriaStitch = v3.buildLyriaPromptV3({
  body: {
    style: "Levantine pop, 105 BPM",
    vocalGender: "f",
    dialect: "Lebanese",
    arabicAddress: "female",
    ideaPrompt: true,
    ideaBrief: "someone who wants to change his life",
    lyricsBy: "lyria",
  },
  producerResult: lyriaBriefs,
  lyricsRaw: "",
  lyricsBy: "lyria",
});
if (!lyriaStitch.ok) fail(`lyria briefs stitch: ${lyriaStitch.error}`);
assert.equal(lyriaStitch.prompt.includes("\nLyrics:\n"), false, "lyria mode must not send sung Lyrics block");
assert.ok(lyriaStitch.prompt.includes("Write and sing original lyrics from these section briefs"));
assert.ok(lyriaStitch.prompt.includes("Repeat this chorus with the same words."));
assert.ok(lyriaStitch.prompt.includes("Lebanese dialect"));
assert.ok(lyriaStitch.prompt.includes("singing to a woman (إنتِ)"));
assert.ok(lyriaStitch.prompt.includes("female singer"));
assert.equal(lyriaStitch.displayLyrics, "");
assert.ok(lebaneseStitch.prompt.includes("\nLyrics:\n"), "gemini idea still writes sung lines");

const adminDetail = require("../api/_lib/generation-admin-detail.js");
const parsedBy = adminDetail.parseGenerationProducerDetail("lyrics_mode: idea\nlyrics_by: lyria\n");
assert.equal(parsedBy.lyricsBy, "lyria");

console.log("--- Greek-Arabic pop ---\n" + popStitch.prompt.slice(0, 900) + "\n");
console.log("--- Lebanese Mawwal ---\n" + lebaneseStitch.prompt.slice(0, 1100) + "\n");
console.log("--- Khaleeji pop ---\n" + khStitch.prompt.slice(0, 900) + "\n");
console.log("--- Lyrics by Lyria ---\n" + lyriaStitch.prompt.slice(0, 1100) + "\n");
console.log("lyria-producer-v3 tests ok");
