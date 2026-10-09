"use strict";

/**
 * Parse music_generation_logs.request_detail for admin producer badges,
 * full Lyria prompts, and Write-tab lyric comparison.
 */

function lineValue(text, key) {
  const m = new RegExp(`^${key}:\\s*(.*)$`, "im").exec(String(text || ""));
  return m ? String(m[1] || "").trim() : "";
}

function extractMarkedBlock(text, name) {
  const src = String(text || "");
  const header = new RegExp(`^${name}:\\s*$`, "im").exec(src);
  if (header) {
    const rest = src.slice(header.index + header[0].length).replace(/^\r?\n/, "");
    const end = new RegExp(`^end_${name}\\s*$`, "im").exec(rest);
    if (end) return rest.slice(0, end.index).replace(/\s+$/, "");
    const next = rest.search(/^(producer|producer_reason|lyrics_mode|lyrics_by|original_lyrics|adapted_lyrics|lyria_prompt|flow|model|api|pipeline):/im);
    return (next >= 0 ? rest.slice(0, next) : rest).replace(/\s+$/, "");
  }
  const same = new RegExp(`^${name}:\\s+(.+)$`, "im").exec(src);
  return same?.[1]?.trim() || "";
}

function lastMatchIndex(src, re) {
  let last = -1;
  let m;
  const copy = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  copy.lastIndex = 0;
  while ((m = copy.exec(src))) last = m.index;
  return last;
}

function extractLyriaPrompt(text) {
  const src = String(text || "");
  const block = lastMatchIndex(src, /^lyria_prompt:\s*$/im);
  if (block >= 0) {
    let body = src.slice(block).replace(/^lyria_prompt:\s*/i, "").replace(/^\r?\n/, "");
    const end = /^end_lyria_prompt\s*$/im.exec(body);
    if (end) body = body.slice(0, end.index);
    return body.replace(/\s+$/, "");
  }
  const same = lastMatchIndex(src, /^lyria_prompt:\s+\S/im);
  if (same >= 0) {
    let body = src.slice(same).replace(/^lyria_prompt:\s+/i, "");
    const end = /^end_lyria_prompt\s*$/im.exec(body);
    if (end) body = body.slice(0, end.index);
    return body.replace(/\s+$/, "");
  }
  return "";
}

function inferProducerStatus(text) {
  const src = String(text || "");
  const producer = lineValue(src, "producer").toLowerCase();
  if (producer === "applied" || producer.startsWith("applied")) return "applied";
  if (
    producer === "fallback"
    || producer.startsWith("fallback")
    || producer === "skipped"
    || producer === "error"
  ) {
    return "fallback";
  }

  const gemini = lineValue(src, "gemini_producer").toLowerCase();
  if (gemini === "applied") return "applied";
  if (gemini === "fallback" || gemini === "skipped") return "fallback";

  const pipe = /^pipeline:\s*(.+)$/im.exec(src);
  const pipeLine = String(pipe?.[1] || "");
  if (/lyria_producer_v3\s+(fallback|error)/i.test(pipeLine)) return "fallback";
  if (/lyria_producer_v3\s*→\s*lyria/i.test(pipeLine) && !/fallback/i.test(pipeLine)) {
    return "applied";
  }
  if (/gemini_producer\s*→/i.test(pipeLine)) return "applied";
  if (/gemini_producer off/i.test(pipeLine)) return "fallback";
  return "";
}

function inferProducerReason(text, status) {
  const src = String(text || "");
  const direct = lineValue(src, "producer_reason");
  if (direct) return direct;
  const v3err = lineValue(src, "lyria_producer_v3_error")
    || lineValue(src, "lyria_producer_v3_stitch")
    || lineValue(src, "gemini_producer_error");
  if (v3err) return v3err;
  const pipe = /^pipeline:\s*lyria_producer_v3\s+fallback\s*·\s*(.+)$/im.exec(src);
  if (pipe?.[1]) return pipe[1].trim();
  if (status === "fallback") {
    const gemini = lineValue(src, "gemini_producer").toLowerCase();
    if (gemini === "skipped") return "skipped";
    if (/gemini_producer off/i.test(src)) return "producer_disabled";
  }
  return "";
}

function parseGenerationProducerDetail(requestDetail) {
  const text = String(requestDetail || "");
  const producerStatus = inferProducerStatus(text);
  const producerReason = inferProducerReason(text, producerStatus);
  let lyricsMode = lineValue(text, "lyrics_mode").toLowerCase();
  if (lyricsMode !== "write" && lyricsMode !== "idea") lyricsMode = "";
  let lyricsBy = lineValue(text, "lyrics_by").toLowerCase();
  if (lyricsBy !== "gemini" && lyricsBy !== "lyria") lyricsBy = "";
  const originalLyrics = extractMarkedBlock(text, "original_lyrics");
  const adaptedLyrics = extractMarkedBlock(text, "adapted_lyrics");
  const lyriaPrompt = extractLyriaPrompt(text);
  return {
    producerStatus,
    producerReason,
    lyricsMode,
    lyricsBy,
    originalLyrics,
    adaptedLyrics,
    lyriaPrompt,
  };
}

function stripDuplicateProducerMeta(requestDetail) {
  return String(requestDetail || "")
    .replace(/^gemini_producer(?:_model|_error|_ms)?:.*$/gim, "")
    .replace(/^lyria_prompt:[\s\S]*/im, "")
    .replace(/^end_lyria_prompt\s*$/gim, "")
    .replace(/^original_lyrics:[\s\S]*?^end_original_lyrics\s*$/gim, "")
    .replace(/^adapted_lyrics:[\s\S]*?^end_adapted_lyrics\s*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function attachProducerFields(row, requestDetail) {
  const parsed = parseGenerationProducerDetail(requestDetail);
  return {
    ...row,
    ...parsed,
    requestMeta: stripDuplicateProducerMeta(requestDetail),
  };
}

module.exports = {
  parseGenerationProducerDetail,
  stripDuplicateProducerMeta,
  attachProducerFields,
  extractLyriaPrompt,
};
