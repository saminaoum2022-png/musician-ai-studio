"use strict";

/**
 * Lyria — passthrough only (no Nabad vocal, dialect merge, Gemini producer prompt stack).
 * Set LYRIA_LEGACY_PROMPTS=1 to restore buildLyriaPrompt + producer injection.
 */

function lyriaLegacyPromptsEnabled() {
  return /^(1|true|yes|on)$/i.test(String(process.env.LYRIA_LEGACY_PROMPTS || "").trim());
}

function isLyriaIdeaPromptBody(body = {}) {
  return (
    body?.ideaPrompt === true
    || body?.ideaPrompt === 1
    || String(body?.ideaPrompt || "").trim() === "1"
    || String(body?.ideaPrompt || "").toLowerCase() === "true"
  );
}

/** One short line from the Singer chip — Lyria only sees the text prompt. */
function bareLyriaVocalSuffix(vocalGender = "") {
  const g = String(vocalGender || "").trim().toLowerCase();
  if (g === "m") return "male lead vocal";
  if (g === "f") return "female lead vocal";
  return "";
}

function composeBareStyleLine(body = {}) {
  const style = String(body?.style || "").trim();
  const vocal = bareLyriaVocalSuffix(body?.vocalGender);
  if (!vocal) return style;
  if (!style) return vocal;
  if (/\b(male|female)\s+lead\s+vocal\b/i.test(style)) return style;
  return `${style}, ${vocal}`;
}

/**
 * @returns {{ ok: true, prompt: string, planSource: string } | { ok: false, error: string }}
 */
function resolveBareLyriaPrompt(body, { lyrics = "", instrumental = false, photoOnly = false } = {}) {
  const explicit = String(body?.lyriaPrompt || "").trim();
  if (explicit) {
    return { ok: true, prompt: explicit.slice(0, 8000), planSource: "client_lyria_prompt" };
  }

  const ideaMode = isLyriaIdeaPromptBody(body);
  const style = composeBareStyleLine(body);
  const ideaBrief = ideaMode ? String(body?.ideaBrief || "").trim() : "";
  const lyricText = ideaMode ? "" : String(lyrics || body?.prompt || "").trim();
  const secondBlock = ideaMode ? ideaBrief : lyricText;

  if (instrumental) {
    const prompt = style || secondBlock;
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

  const prompt = [style, secondBlock].filter(Boolean).join("\n\n");

  if (!prompt) {
    if (photoOnly) {
      return { ok: true, prompt: "", planSource: "photo_only" };
    }
    return {
      ok: false,
      error: ideaMode
        ? "Lyria bare mode: add style tags and an idea in the Idea tab, or send lyriaPrompt."
        : "Lyria bare mode: send style, lyrics (prompt), or lyriaPrompt — the server does not add text for you.",
    };
  }

  let planSource = "client_style_and_lyrics";
  if (ideaMode) planSource = "idea_style_and_brief";
  else if (style && lyricText) planSource = "client_style_and_lyrics";
  else if (style) planSource = "client_style";
  else planSource = "client_lyrics";

  return {
    ok: true,
    prompt: prompt.slice(0, 8000),
    planSource,
  };
}

module.exports = {
  lyriaLegacyPromptsEnabled,
  resolveBareLyriaPrompt,
  isLyriaIdeaPromptBody,
};
