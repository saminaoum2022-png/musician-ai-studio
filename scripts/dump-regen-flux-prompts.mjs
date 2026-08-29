#!/usr/bin/env node
import path from "path";
import { pathToFileURL } from "url";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const mod = await import(pathToFileURL(path.join(root, "src/cover-art/prompt.js")).href);
const { buildAbstractCoverPrompt, buildFluxCoverPrompt, resolveStoryTheme } = mod;

const sampleTrack = {
  songId: "demo-song-123",
  title: "Midnight Drive",
  genre: "synth pop",
  mood: "dreamy",
  style: "80s synthwave, nostalgic, neon",
  styleSent: "Upbeat electronic with warm pads",
  lyrics: "Running through the city lights, we never say goodbye",
  energy: 0.6,
};

const { theme } = resolveStoryTheme(sampleTrack);

const firstCover = buildAbstractCoverPrompt(sampleTrack, {
  directorSceneHint: "neon city reflections on wet asphalt, cinematic depth",
  nabadIdentityPhrases: "teal-violet atmospheric glow, premium nabad aesthetic",
});

const regenNoHint = buildAbstractCoverPrompt(
  { ...sampleTrack, artworkStyle: "", artworkHint: "", regenAutoMusic: true },
  {
    regenSalt: "demo-regen-salt",
    nabadIdentityPhrases: "teal-violet atmospheric glow, premium nabad aesthetic",
    forceMusicFallback: true,
    directorSceneHint: "",
  },
);

const hint = "neon desert sunset with palm silhouettes";
const regenWithHint = buildAbstractCoverPrompt(
  { ...sampleTrack, artworkStyle: hint, artworkHint: hint },
  {
    regenSalt: "demo-regen-salt",
    userArtworkOverride: hint,
    nabadIdentityPhrases: "teal-violet atmospheric glow, premium nabad aesthetic",
    forceMusicFallback: false,
  },
);

function show(label, built) {
  const flux = buildFluxCoverPrompt(built.prompt, { storyTheme: built.storyTheme });
  console.log("\n" + "=".repeat(72));
  console.log(label);
  console.log(
    "artworkSource:",
    built.artworkSource,
    "| visualMode:",
    built.visualMode,
    "| storyTheme:",
    built.storyTheme,
  );
  console.log("\n--- clientPrompt ---");
  console.log(built.prompt);
  console.log("\n--- buildFluxCoverPrompt (sent to Cloudflare) ---");
  console.log(flux);
  console.log(`\n(client ${built.prompt.length} chars → flux ${flux.length} chars, cap 2048)`);
}

console.log("Story match:", theme?.id || "none", "| theme visualMode:", theme?.visualMode || "mood_fallback");
show("FIRST COVER (normal pipeline)", firstCover);
show("REGEN — NO artwork hint (regenAutoMusic)", regenNoHint);
show(`REGEN — WITH hint "${hint}"`, regenWithHint);
