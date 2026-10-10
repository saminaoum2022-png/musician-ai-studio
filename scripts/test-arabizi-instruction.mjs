#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const az = require("../api/_lib/arabizi.js");
const v3 = require("../api/_lib/lyria-producer-v3.js");

const arabicBody = {
  lyricsLanguage: "arabic",
  dialect: "Lebanese",
  scriptFormat: "arabic",
};

assert.equal(az.hasArabiziDigitWord("يا 7abibi"), true);
assert.equal(az.hasArabiziDigitWord("3ayni يا عيني"), true);
assert.equal(az.hasArabiziDigitWord("2albi"), true);
assert.equal(az.hasArabiziDigitWord("5alas"), true);
assert.equal(az.hasArabiziDigitWord("7elwé ma3é"), true);
assert.equal(az.hasArabiziDigitWord("Verse 2"), false, "standalone 2 is not Arabizi");
assert.equal(az.hasArabiziDigitWord("I still hear you in the hallway"), false);

assert.equal(
  az.isArabicSongForArabiziInstruction({
    body: { lyricsLanguage: "english" },
    lyrics: "I miss you café 7abibi",
  }),
  false,
  "explicit English is not an Arabic song",
);
assert.equal(
  az.isArabicSongForArabiziInstruction({
    body: arabicBody,
    lyrics: "يا 7abibi",
  }),
  true,
);

const english = az.maybeAppendArabiziInstruction({
  prompt: "Create a song.\nLyrics:\nI miss you",
  body: { lyricsLanguage: "english" },
  lyrics: "I miss you 7abibi",
  enabled: true,
});
assert.equal(english.used, false);
assert.equal(english.prompt.includes(az.ARABIZI_INSTRUCTION_MARKER), false);

const mixed = az.maybeAppendArabiziInstruction({
  prompt: "Create a song.\nLyrics:\nيا 7abibi",
  body: arabicBody,
  lyrics: "يا 7abibi",
  enabled: true,
});
assert.equal(mixed.used, true);
assert.match(mixed.prompt, /native Lebanese Arabic pronunciation/);
assert.match(mixed.prompt, /2 = ء/);
assert.match(mixed.prompt, /7 = ح/);

const off = az.maybeAppendArabiziInstruction({
  prompt: "Create a song.\nLyrics:\nيا 7abibi",
  body: arabicBody,
  lyrics: "يا 7abibi",
  enabled: false,
});
assert.equal(off.used, false);
assert.equal(off.prompt, "Create a song.\nLyrics:\nيا 7abibi");

const once = az.maybeAppendArabiziInstruction({
  prompt: mixed.prompt,
  body: arabicBody,
  lyrics: "يا 7abibi",
  enabled: true,
});
assert.equal(once.used, true);
assert.equal(
  once.prompt.split(az.ARABIZI_INSTRUCTION_MARKER).length - 1,
  1,
  "do not append the instruction twice",
);

assert.equal(
  v3.lyriaProducerV3SystemPrompt(),
  v3.LYRIA_PRODUCER_V3_SYSTEM_PROMPT,
);
assert.match(
  v3.lyriaProducerV3SystemPrompt({ preserveArabizi: true }),
  /Keep every Arabizi word exactly as the user wrote it/,
);
assert.equal(
  v3.lyriaProducerV3SystemPrompt({ preserveArabizi: true }).includes(az.ARABIZI_V3_PRESERVE_BLOCK.trim()),
  true,
);

console.log("ok test-arabizi-instruction");
