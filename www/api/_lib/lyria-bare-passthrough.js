"use strict";

/**
 * Lyria — passthrough only (no Nabad vocal, dialect merge, Gemini producer prompt stack).
 * Set LYRIA_LEGACY_PROMPTS=1 to restore buildLyriaPrompt + producer injection.
 */

const {
  mergeLyriaDialectHint,
  sanitizeDialectHintForLyriaPrompt,
  buildLyriaDialectVocalNote,
  resolveLyriaArabicAddress,
  resolveLyriaDialectLabel,
} = require("./lyria-upstream");
const { isArabiziScript } = require("./arabizi");

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

function styleContainsAny(style, patterns) {
  const s = String(style || "");
  return patterns.some((re) => re.test(s));
}

/** Studio-style: dialect / language / addressee as short English tags on the style line. */
function buildBareStudioStyleSuffixes(body = {}, { seedText = "" } = {}) {
  const suffixes = [];
  const style = String(body?.style || "").trim();
  const scriptFormat = String(body?.scriptFormat || "").trim().toLowerCase();
  const lyricsLanguage = String(body?.lyricsLanguage || "").trim().toLowerCase();
  const lyricsSeed = String(seedText || body?.ideaBrief || body?.prompt || "").trim();

  if (
    scriptFormat === "arabizi"
    || isArabiziScript({ scriptFormat, lyrics: lyricsSeed })
  ) {
    if (!styleContainsAny(style, [/\barabizi\b/i, /latin script arabic/i])) {
      suffixes.push("Arabizi lyrics, colloquial Arabic pronunciation");
    }
  } else if (lyricsLanguage === "english" && !styleContainsAny(style, [/\benglish lyrics\b/i])) {
    suffixes.push("English lyrics");
  } else if (lyricsLanguage === "french" && !styleContainsAny(style, [/\bfrench lyrics\b/i])) {
    suffixes.push("French lyrics");
  } else if (lyricsLanguage === "spanish" && !styleContainsAny(style, [/\bspanish lyrics\b/i])) {
    suffixes.push("Spanish lyrics");
  } else {
    const dialectLabel = resolveLyriaDialectLabel(body);
    if (dialectLabel) {
      const phrase = /modern standard|msa/i.test(dialectLabel)
        ? "Modern Standard Arabic lyrics and vocal"
        : `${dialectLabel} colloquial lyrics and vocal`;
      if (!styleContainsAny(style, [new RegExp(dialectLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")])) {
        suffixes.push(phrase);
      }
    } else {
      const hint = sanitizeDialectHintForLyriaPrompt(mergeLyriaDialectHint(body));
      const vocal = buildLyriaDialectVocalNote(hint).replace(/\.\s*$/, "").trim();
      if (vocal && !styleContainsAny(style, [/\bcolloquial vocal\b/i, /\barabic vocal\b/i])) {
        suffixes.push(vocal);
      }
    }
  }

  const addr = String(resolveLyriaArabicAddress(body) || "").trim().toLowerCase();
  if (addr === "female" && !styleContainsAny(style, [/singing to a (woman|girl|her)\b/i, /addressed to a woman/i])) {
    suffixes.push("singing to a woman");
  } else if (addr === "male" && !styleContainsAny(style, [/singing to a man\b/i, /addressed to a man/i])) {
    suffixes.push("singing to a man");
  } else if (addr === "group" && !styleContainsAny(style, [/singing to a group\b/i, /addressed to a group/i])) {
    suffixes.push("singing to a group");
  }

  return suffixes;
}

function composeBareStyleLine(body = {}, { seedText = "" } = {}) {
  let style = String(body?.style || "").trim();
  const vocal = bareLyriaVocalSuffix(body?.vocalGender);
  if (vocal) {
    if (!style) style = vocal;
    else if (!/\b(male|female)\s+lead\s+vocal\b/i.test(style)) style = `${style}, ${vocal}`;
  }
  const studio = buildBareStudioStyleSuffixes(body, { seedText });
  if (studio.length) {
    style = style ? `${style}, ${studio.join(", ")}` : studio.join(", ");
  }
  return style;
}

/** Default on in bare Idea mode. Set LYRIA_IDEA_BRIEF_HINT=0 to send the raw brief only (Studio-style). */
function lyriaIdeaBriefHintEnabled() {
  const v = String(process.env.LYRIA_IDEA_BRIEF_HINT ?? "1").trim();
  return !/^(0|false|no|off)$/i.test(v);
}

const LYRIA_IDEA_BRIEF_HINT_LINE =
  "Song topic — compose original lyrics inspired by this; do not sing this paragraph verbatim as lyrics:";

/** Default on in Idea mode. Set LYRIA_IDEA_COMPOSE_STYLE=0 to omit. */
function lyriaIdeaComposeMatchStyleEnabled() {
  const v = String(process.env.LYRIA_IDEA_COMPOSE_STYLE ?? "1").trim();
  return !/^(0|false|no|off)$/i.test(v);
}

const LYRIA_IDEA_COMPOSE_MATCH_STYLE_LINE =
  "Lyrics direction — write original singable lyrics that match the style line above (genre, tempo, BPM, groove, meter, instruments, mood, and vocal type). Use verse and chorus sections with short-to-medium lines on the beat; avoid one long run-on sentence.";

function wrapBareLyriaIdeaBrief(ideaBrief = "") {
  const brief = String(ideaBrief || "").trim();
  if (!brief) return "";
  if (!lyriaIdeaBriefHintEnabled()) return brief;
  return `${LYRIA_IDEA_BRIEF_HINT_LINE}\n${brief}`;
}

function buildBareIdeaPromptBlock(ideaBrief = "") {
  const parts = [];
  if (lyriaIdeaComposeMatchStyleEnabled()) {
    parts.push(LYRIA_IDEA_COMPOSE_MATCH_STYLE_LINE);
  }
  const topic = wrapBareLyriaIdeaBrief(ideaBrief);
  if (topic) parts.push(topic);
  return parts.filter(Boolean).join("\n\n");
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
  const ideaBrief = ideaMode ? String(body?.ideaBrief || "").trim() : "";
  const lyricText = ideaMode ? "" : String(lyrics || body?.prompt || "").trim();
  const seedText = ideaMode ? ideaBrief : lyricText;
  const style = composeBareStyleLine(body, { seedText });
  const secondBlock = ideaMode ? wrapBareLyriaIdeaBrief(ideaBrief) : lyricText;

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
  if (ideaMode) {
    planSource = lyriaIdeaBriefHintEnabled()
      ? "idea_style_and_brief_hint"
      : "idea_style_and_brief";
  }
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
  lyriaIdeaBriefHintEnabled,
  wrapBareLyriaIdeaBrief,
  buildBareStudioStyleSuffixes,
  composeBareStyleLine,
  resolveBareLyriaPrompt,
  isLyriaIdeaPromptBody,
};
