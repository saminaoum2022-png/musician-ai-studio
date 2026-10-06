"use strict";

/**
 * Lyria — passthrough only (no Nabad vocal, dialect merge, Gemini producer prompt stack).
 * Set LYRIA_LEGACY_PROMPTS=1 to restore buildLyriaPrompt + producer injection.
 */

function lyriaLegacyPromptsEnabled() {
  return /^(1|true|yes|on)$/i.test(String(process.env.LYRIA_LEGACY_PROMPTS || "").trim());
}

/**
 * @returns {{ ok: true, prompt: string, planSource: string } | { ok: false, error: string }}
 */
function resolveBareLyriaPrompt(body, { lyrics = "", instrumental = false, photoOnly = false } = {}) {
  const explicit = String(body?.lyriaPrompt || "").trim();
  if (explicit) {
    return { ok: true, prompt: explicit.slice(0, 8000), planSource: "client_lyria_prompt" };
  }

  const style = String(body?.style || "").trim();
  const lyricText = String(lyrics || body?.prompt || "").trim();

  if (instrumental) {
    const prompt = style || lyricText;
    if (!prompt && !photoOnly) {
      return {
        ok: false,
        error:
          "Lyria bare mode: send style, prompt, or lyriaPrompt — the server does not add text for you.",
      };
    }
    return {
      ok: true,
      prompt: String(prompt || "").slice(0, 8000),
      planSource: style ? "client_style" : "client_prompt",
    };
  }

  const prompt = [style, lyricText].filter(Boolean).join("\n\n");

  if (!prompt) {
    if (photoOnly) {
      return { ok: true, prompt: "", planSource: "photo_only" };
    }
    return {
      ok: false,
      error:
        "Lyria bare mode: send style, lyrics (prompt), or lyriaPrompt — the server does not add text for you.",
    };
  }

  return {
    ok: true,
    prompt: prompt.slice(0, 8000),
    planSource: style && lyricText ? "client_style_and_lyrics" : style ? "client_style" : "client_lyrics",
  };
}

module.exports = {
  lyriaLegacyPromptsEnabled,
  resolveBareLyriaPrompt,
};
