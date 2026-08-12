/**
 * Map Suno upstream rejections to NabadAi-safe user copy and sanitize style tags.
 * Never expose raw Suno error strings to clients — use failureKind + userMessage.
 */

/** @param {string} style */
function sanitizeSunoStyleTags(style) {
  let s = String(style || "").trim();
  if (!s) return s;
  const blockedPatterns = [
    /\bal\s+shami\b/gi,
    /\bshami\s+singer\b/gi,
    /\bdamascene\s+shami\b/gi,
  ];
  for (const re of blockedPatterns) {
    s = s.replace(re, "");
  }
  return s
    .replace(/,\s*,+/g, ",")
    .replace(/^\s*,\s*|\s*,\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function extractSunoErrorFields(raw) {
  const payload = raw?.details && typeof raw.details === "object" ? raw.details : raw;
  const nested = payload?.data && typeof payload.data === "object" ? payload.data : null;
  const code = Number(
    payload?.code ?? payload?.errorCode ?? nested?.code ?? nested?.errorCode ?? raw?.errorCode ?? 0,
  ) || 0;
  const msg = String(
    payload?.msg
    ?? payload?.message
    ?? payload?.error
    ?? payload?.errorMessage
    ?? nested?.msg
    ?? nested?.message
    ?? nested?.error
    ?? nested?.errorMessage
    ?? raw?.errorMessage
    ?? raw?.error
    ?? "",
  ).trim();
  const flag = String(
    payload?.successFlag ?? payload?.flag ?? nested?.successFlag ?? raw?.successFlag ?? "",
  ).toUpperCase();
  const status = String(payload?.status ?? nested?.status ?? raw?.status ?? "").toUpperCase();
  return { code, msg, flag, status, m: msg.toLowerCase() };
}

/** @returns {{ failureKind: string, userMessage: string, headline: string } | null} */
function mapSunoUpstreamFailure(raw) {
  const { code, msg, flag, status, m } = extractSunoErrorFields(raw);

  const looksArtist =
    m.includes("artist name")
    || m.includes("named artist")
    || m.includes("reference specific artists")
    || m.includes("specific artists")
    || m.includes("real artist")
    || (code === 400 && m.includes("tags contain"));
  if (looksArtist) {
    return {
      failureKind: "artistReference",
      userMessage: "Style tags can't include real artist names — edit Style and try again.",
      headline: "Artist name in style tags",
    };
  }

  const looksCopyright =
    m.includes("copyright")
    || m.includes("copyrighted")
    || m.includes("infringe")
    || m.includes("fingerprint")
    || m.includes("rights holder")
    || m.includes("protected song")
    || m.includes("commercial track")
    || m.includes("known song");
  if (looksCopyright || (code === 413 && m.includes("uploaded audio"))) {
    return {
      failureKind: "copyright",
      userMessage: "Copyright detected — try a different melody or re-record.",
      headline: "Copyright detected",
    };
  }

  const looksSensitive =
    flag === "SENSITIVE_WORD_ERROR"
    || code === 451
    || m.includes("sensitive")
    || m.includes("policy")
    || m.includes("prohibited")
    || m.includes("explicit content");
  if (looksSensitive) {
    return {
      failureKind: "sensitive",
      userMessage: "Content blocked — adjust your lyrics or style.",
      headline: "Content blocked",
    };
  }

  if (code === 413 || m.includes("too long")) {
    return {
      failureKind: "tooLong",
      userMessage: "Lyrics or style are too long — shorten and retry.",
      headline: "Too long",
    };
  }

  if (code === 429 || flag === "INSUFFICIENT_CREDITS" || m.includes("insufficient credit")) {
    return {
      failureKind: "credits",
      userMessage: "Not enough credits for this generation.",
      headline: "Insufficient credits",
    };
  }

  const looksAudioVerify =
    m.includes("couldn't verify your audio")
    || m.includes("could not verify your audio")
    || m.includes("verify your audio")
    || m.includes("unable to verify")
    || m.includes("invalid audio");
  if (looksAudioVerify) {
    return {
      failureKind: "audio_verify",
      userMessage: "Couldn't verify your audio — re-record or try again.",
      headline: "Audio not accepted",
    };
  }

  const failedStatus =
    status === "FAILED"
    || status === "REJECTED"
    || status === "ERROR"
    || flag === "FAILED"
    || flag === "ERROR"
    || flag === "CREATE_TASK_FAILED"
    || flag === "GENERATE_AUDIO_FAILED"
    || flag === "CALLBACK_EXCEPTION";

  if (failedStatus || code > 0 || msg) {
    return {
      failureKind: "generic",
      userMessage: "Something went wrong — please try again.",
      headline: "Generation failed",
    };
  }

  return null;
}

/** @returns {Record<string, unknown>} */
function buildSunoErrorBody(raw, { error = "Generation failed" } = {}) {
  const mapped = mapSunoUpstreamFailure(raw);
  if (!mapped) {
    return { error, details: raw ?? null };
  }
  return {
    error: mapped.headline,
    failureKind: mapped.failureKind,
    userMessage: mapped.userMessage,
    details: raw ?? null,
  };
}

module.exports = {
  sanitizeSunoStyleTags,
  mapSunoUpstreamFailure,
  buildSunoErrorBody,
};
