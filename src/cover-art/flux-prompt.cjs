"use strict";

/**
 * Cloudflare Flux Schnell — bare minimum text only (Pollinations still uses ./prompt.js).
 * Sends: artwork hint (if any), mood, genre, instrument — never song title.
 */

const NEGATION_CLAUSE_RE = /^\s*(?:absolutely\s+|completely\s+|strictly\s+)?(?:no|not|without|avoid|never|zero|nothing|don'?t)\b/i;

const CANDLE_RE = /\bcandle(?:light|s|stick|sticks)?\b/gi;

const FLUX_PROMPT_MAX = 512;

function trimField(value, max) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function positiveOnly(text, { allowCandles = false } = {}) {
  const clauses = String(text || "")
    .split(/[,;.\n]+/)
    .map((c) => c.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((c) => !NEGATION_CLAUSE_RE.test(c))
    .filter((c) => allowCandles || !/\bwax\b/i.test(c));
  let out = clauses.join(", ");
  if (!allowCandles) out = out.replace(CANDLE_RE, "soft light");
  return out.replace(/\s+/g, " ").trim();
}

/**
 * @param {{userArtwork?:string, mood?:string, genre?:string, style?:string,
 *          instrument?:string, instrumentLabel?:string}} ctx
 * @returns {{prompt:string, source:string}}
 */
function buildFluxScratchPrompt(ctx = {}) {
  const parts = [];
  let hasUser = false;

  const userRaw = String(ctx.userArtwork || "").trim();
  if (userRaw) {
    const allowCandles = /\bcandle|birthday cake/i.test(userRaw);
    const user = positiveOnly(userRaw, { allowCandles });
    if (user) {
      parts.push(user);
      hasUser = true;
    }
  }

  const mood = trimField(ctx.mood, 80);
  const genre = trimField(ctx.genre || ctx.style, 100);
  const instrument = trimField(ctx.instrumentLabel || ctx.instrument, 60);

  if (mood) parts.push(mood);
  if (genre) parts.push(genre);
  if (instrument) parts.push(instrument);

  const prompt = parts.length ? parts.join(", ") : "music";
  let source = "default";
  if (hasUser && parts.length > 1) source = "user_and_meta";
  else if (hasUser) source = "user";
  else if (parts.length) source = "song_meta";

  return { prompt: prompt.slice(0, FLUX_PROMPT_MAX), source };
}

function needsSceneWriter() {
  return false;
}

module.exports = { buildFluxScratchPrompt, needsSceneWriter, positiveOnly };
