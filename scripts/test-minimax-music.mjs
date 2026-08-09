#!/usr/bin/env node
/**
 * Quick MiniMax music smoke test — run locally with your key.
 *
 * Subscription / Credits key ($5 pack):
 *   MINIMAX_API_KEY=sk-... MINIMAX_KEY_KIND=subscription node scripts/test-minimax-music.mjs
 *
 * Pay-as-you-go Access key ($25 balance):
 *   MINIMAX_API_KEY=sk-... MINIMAX_KEY_KIND=paygo node scripts/test-minimax-music.mjs
 */
const apiKey = String(process.env.MINIMAX_API_KEY || "").trim();
const keyKindRaw = String(process.env.MINIMAX_KEY_KIND || "paygo").trim().toLowerCase();
const keyKind =
  keyKindRaw === "subscription" || keyKindRaw === "credits" || keyKindRaw === "token"
    ? "subscription"
    : "paygo";
const model =
  String(process.env.MINIMAX_MUSIC_MODEL || "").trim() ||
  (keyKind === "subscription" ? "music-3.0" : "music-3.0-free");

if (!apiKey) {
  console.error("Set MINIMAX_API_KEY first.");
  process.exit(1);
}

console.log(`Key kind: ${keyKind}`);
console.log(`Model: ${model}`);

if (keyKind === "subscription") {
  const remains = await fetch("https://www.minimax.io/v1/token_plan/remains", {
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
  });
  const remainsText = await remains.text();
  console.log("\n--- token_plan/remains ---");
  console.log(remainsText.slice(0, 1200));
}

const payload = {
  model,
  prompt: "Indie pop, upbeat, warm guitar",
  lyrics: "[Verse]\nTesting one two three\nMiniMax music for me",
  output_format: "hex",
  audio_setting: { sample_rate: 44100, bitrate: 256000, format: "mp3" },
};

console.log("\n--- music_generation ---");
const r = await fetch("https://api.minimax.io/v1/music_generation", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(payload),
});
const text = await r.text();
let data;
try {
  data = JSON.parse(text);
} catch {
  data = null;
}
const code = data?.base_resp?.status_code;
const msg = data?.base_resp?.status_msg;
const audioLen = String(data?.data?.audio || "").length;
console.log(`HTTP ${r.status} | status_code=${code} | msg=${msg || "(none)"}`);
if (audioLen > 0) console.log(`audio hex chars: ${audioLen} (success)`);
else console.log(text.slice(0, 800));

if (code === 1008 && keyKind === "paygo" && model.endsWith("-free")) {
  console.error(
    "\nHint: music-3.0-free needs pay-as-you-go Balance (~$25). For $5 Credits use Subscription key + MINIMAX_KEY_KIND=subscription.",
  );
}
if (code === 1008 && keyKind === "subscription") {
  console.error("\nHint: check Credits purchased and Subscription key (not Access API key).");
}

process.exit(code === 0 ? 0 : 1);
