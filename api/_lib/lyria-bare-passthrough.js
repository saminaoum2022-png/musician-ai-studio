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
const { isArabiziScript, looksLikeArabizi } = require("./arabizi");

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

function lyriaSeedLooksNonArabicLatin(text) {
  const s = String(text || "").trim();
  if (!s) return false;
  if (/[\u0600-\u06FF]/.test(s)) return false;
  if (looksLikeArabizi(s)) return false;
  return (s.match(/[A-Za-z]/g) || []).length >= 8;
}

/** Drop dialect/addressee when the box is clearly not Arabic (English, French, etc.). */
function stripArabicLyricContextIfUnused(body = {}, { lyrics = "" } = {}) {
  const idea = isLyriaIdeaPromptBody(body);
  const seed = idea
    ? String(body?.ideaBrief || lyrics || body?.prompt || "").trim()
    : String(lyrics || body?.prompt || "").trim();
  const lang = String(body?.lyricsLanguage || "").trim().toLowerCase();
  if (idea && (lang === "arabic" || lang === "arabizi")) return body;
  if (!lyriaSeedLooksNonArabicLatin(seed)) return body;
  const next = { ...body };
  delete next.dialect;
  delete next.dialectHint;
  delete next.arabicAddress;
  delete next.address;
  if (String(next.scriptFormat || "").toLowerCase() === "arabic") next.scriptFormat = "auto";
  if (lang === "arabic") delete next.lyricsLanguage;
  return next;
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
  } else if (
    lyriaSeedLooksNonArabicLatin(lyricsSeed)
    && lyricsLanguage !== "arabic"
    && lyricsLanguage !== "arabizi"
    && scriptFormat !== "arabic"
    && scriptFormat !== "arabizi"
  ) {
    /* Non-Arabic Latin lyrics: do not append dialect / colloquial-Arabic vocal tags. */
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

  const latinNonArabic = lyriaSeedLooksNonArabicLatin(lyricsSeed)
    && lyricsLanguage !== "arabic"
    && lyricsLanguage !== "arabizi"
    && scriptFormat !== "arabic"
    && scriptFormat !== "arabizi";
  const addr = latinNonArabic ? "" : String(resolveLyriaArabicAddress(body) || "").trim().toLowerCase();
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
  const secondBlock = ideaMode ? buildBareIdeaPromptBlock(ideaBrief) : lyricText;

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
    if (lyriaIdeaComposeMatchStyleEnabled() && lyriaIdeaBriefHintEnabled()) {
      planSource = "idea_style_compose_match_and_topic_hint";
    } else if (lyriaIdeaBriefHintEnabled()) {
      planSource = "idea_style_and_brief_hint";
    } else if (lyriaIdeaComposeMatchStyleEnabled()) {
      planSource = "idea_style_compose_match_and_brief";
    } else {
      planSource = "idea_style_and_brief";
    }
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
  lyriaIdeaComposeMatchStyleEnabled,
  wrapBareLyriaIdeaBrief,
  buildBareIdeaPromptBlock,
  buildBareStudioStyleSuffixes,
  composeBareStyleLine,
  resolveBareLyriaPrompt,
  isLyriaIdeaPromptBody,
  lyriaSeedLooksNonArabicLatin,
  stripArabicLyricContextIfUnused,
};
