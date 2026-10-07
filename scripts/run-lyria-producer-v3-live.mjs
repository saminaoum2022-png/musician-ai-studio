#!/usr/bin/env node
/**
 * Live Gemini checks for Lyria producer v3 (Idea / Write / Mawwal).
 * Usage: GEMINI_API_KEY=... node scripts/run-lyria-producer-v3-live.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  buildLyriaProducerV3Input,
  buildLyriaPromptV3,
  appendLyriaProducerV3AdminDetail,
} = require("../api/_lib/lyria-producer-v3.js");
const { enrichLyriaSongWithGeminiProducerV3 } = require("../api/_lib/clip-gemini-producer.js");

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith("\"") && val.endsWith("\"")) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".tmp/v3-live.env");

const apiKey = String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
if (!apiKey) {
  console.error("Missing GEMINI_API_KEY / GOOGLE_API_KEY");
  process.exit(1);
}

const CASES = [
  {
    id: "idea",
    body: {
      ideaPrompt: "1",
      ideaBrief: "someone who wants to change his life",
      style: "Levantine pop, oud and darbuka, warm male vocal, 105 BPM",
      vocalGender: "m",
      dialect: "Lebanese",
      arabicAddress: "male",
    },
    lyrics: "someone who wants to change his life",
  },
  {
    id: "write",
    body: {
      style: "Greek-Arabic pop, bouzouki and oud, 108 BPM",
      vocalGender: "f",
      dialect: "Levantine",
      arabicAddress: "male",
    },
    lyrics: "I walk the old street tonight\nI miss your name\nHold the light\nDon't let go",
  },
  {
    id: "mawwal",
    body: {
      ideaPrompt: "1",
      ideaBrief: "a man calling the night because he cannot sleep",
      style: "Lebanese folk, classic Tarab, free-time Mawwal intro with solo oud, rich warm male vocal, 85 BPM, Bayati maqam",
      vocalGender: "m",
      dialect: "Lebanese",
      arabicAddress: "male",
    },
    lyrics: "a man calling the night because he cannot sleep",
  },
];

function buildMeta({ body, lyrics, producerResult, stitch }) {
  const idea = body.ideaPrompt === "1";
  const lines = [
    stitch.ok
      ? "pipeline: lyria_producer_v3 → lyria"
      : `pipeline: lyria_producer_v3 error · ${stitch.error || producerResult.error}`,
    appendLyriaProducerV3AdminDetail(producerResult, stitch),
    `lyrics_mode: ${idea ? "idea" : "write"}`,
  ];
  if (!idea) {
    lines.push("original_lyrics:", String(lyrics || "").trim(), "end_original_lyrics");
    lines.push("adapted_lyrics:", String(stitch.displayLyrics || "").trim(), "end_adapted_lyrics");
  }
  lines.push("", "lyria_prompt:", stitch.prompt || "", "end_lyria_prompt");
  return lines.join("\n");
}

async function runCase(spec) {
  const v3input = buildLyriaProducerV3Input(spec.body, { lyrics: spec.lyrics, durationSec: 180 });
  let last = { ok: false, error: "plan_failed", v3: true, fallback: false };
  let stitch = { ok: false, error: "plan_failed" };
  for (let attempt = 1; attempt <= 3; attempt++) {
    const producerResult = await enrichLyriaSongWithGeminiProducerV3({
      apiKey,
      enabled: true,
      input: v3input,
    });
    producerResult.v3 = true;
    producerResult.v3Attempts = attempt;
    producerResult.fallback = false;
    if (producerResult.ok && producerResult.sections?.length) {
      stitch = buildLyriaPromptV3({
        body: spec.body,
        producerResult,
        lyricsRaw: spec.lyrics,
      });
      if (stitch.ok) {
        last = { ...producerResult, v3Stitch: stitch };
        break;
      }
      last = { ...producerResult, ok: false, fallback: false, error: stitch.error || "v3_stitch_failed" };
    } else {
      last = { ...producerResult, ok: false, fallback: false, error: producerResult.error || "invalid_json", v3: true, v3Attempts: attempt };
    }
  }
  return { last, stitch };
}

let failed = 0;
for (const spec of CASES) {
  console.log(`\n======== ${spec.id.toUpperCase()} ========`);
  const { last, stitch } = await runCase(spec);
  const meta = buildMeta({ body: spec.body, lyrics: spec.lyrics, producerResult: last, stitch });
  const applied = /^producer:\s*applied$/m.test(meta);
  const pipelineOk = /pipeline: lyria_producer_v3 → lyria/.test(meta);
  const noFallback = !/pipeline: lyria_producer_v3 fallback/.test(meta) && !/^producer:\s*fallback$/m.test(meta);
  console.log(meta.slice(0, 3500));
  if (meta.length > 3500) console.log("\n… [truncated] …\n");
  console.log(`-- checks applied=${applied} pipeline=${pipelineOk} noFallback=${noFallback} attempts=${last.v3Attempts || "?"} error=${last.error || stitch.error || "none"}`);
  if (!applied || !pipelineOk || !noFallback || !stitch.ok) {
    failed += 1;
    console.error(`FAIL ${spec.id}`);
  } else {
    console.log(`PASS ${spec.id}`);
  }
}

if (failed) {
  console.error(`\n${failed} live case(s) failed`);
  process.exit(1);
}
console.log("\nAll 3 live v3 cases passed (producer applied, no fallback).");
