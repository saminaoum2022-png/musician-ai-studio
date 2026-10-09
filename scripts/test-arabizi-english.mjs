#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const serverArabizi = require("../api/_lib/arabizi.js");
const bare = require("../api/_lib/lyria-bare-passthrough.js");
const looksLikeArabizi = serverArabizi.looksLikeArabizi;
const clientSrc = readFileSync(new URL("../src/arabizi.js", import.meta.url), "utf8");

const englishLyrics = `I keep your name in a quiet song
I still hear you in the hallway
Don't call me when the lights are low`;

assert.equal(looksLikeArabizi(englishLyrics), false, "server: English lyrics are not Arabizi");
assert.match(clientSrc, /particleHits\.length >= 2/, "client Arabizi detector requires two particles");
assert.equal(looksLikeArabizi("ya know I miss you in the hallway tonight"), false, "client: 'ya know' is not Arabizi");
assert.equal(looksLikeArabizi("shu 3am te3mal ya habibi"), true, "client: digit + marker Arabizi");
assert.equal(looksLikeArabizi("ana ente wallah keefak"), true, "client: two+ particles count as Arabizi");

assert.equal(bare.lyriaSeedLooksNonArabicLatin(englishLyrics), true);

const stripped = bare.stripArabicLyricContextIfUnused(
  {
    prompt: englishLyrics,
    dialect: "Lebanese Arabic",
    arabicAddress: "female",
    scriptFormat: "arabic",
    lyricsLanguage: "arabic",
  },
  { lyrics: englishLyrics },
);
assert.equal(stripped.dialect, undefined, "write-mode English must drop dialect");
assert.equal(stripped.arabicAddress, undefined, "write-mode English must drop addressee");
assert.equal(stripped.scriptFormat, "auto");
assert.equal(stripped.lyricsLanguage, undefined);

const ideaKept = bare.stripArabicLyricContextIfUnused(
  {
    ideaPrompt: true,
    ideaBrief: "a song about missing her",
    lyricsLanguage: "arabic",
    dialect: "Lebanese Arabic",
    arabicAddress: "female",
  },
  { lyrics: "" },
);
assert.equal(ideaKept.dialect, "Lebanese Arabic", "Idea + explicit Arabic language keeps dialect");

const suffixes = bare.buildBareStudioStyleSuffixes(
  { lyricsLanguage: "auto", scriptFormat: "auto" },
  { seedText: englishLyrics },
);
assert.equal(
  suffixes.some((s) => /colloquial|arabic|singing to/i.test(s)),
  false,
  "English seed must not get dialect/addressee style tags",
);

console.log("ok test-arabizi-english");
