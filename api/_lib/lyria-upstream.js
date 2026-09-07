/**
 * Google Lyria 3 music generation via Interactions API (preferred) or legacy generateContent.
 * @see https://ai.google.dev/gemini-api/docs/music-generation
 */
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const LYRIA_INTERACTIONS_URL = `${GEMINI_BASE}/interactions`;
const LYRIA_FULL_MODEL = "lyria-3.5";

function safeJson(txt) {
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

const {
  CLIP_VOCAL_PROFILES,
  clipVocalProfileById,
  defaultClipVocalProfileForGender,
} = require("./clip-vocal-profiles");

const LYRIA_CLIP_MODEL = "lyria-3-clip-preview";

/** Spark/challenge delivery overrides — positive vocal direction for Lyria. */
const CHALLENGE_VOCAL_PROFILES = {
  "hook-rush": "Bright energetic hook delivery, mid-range chest voice, sticky chorus lift",
  "one-line-reply": "Intimate close-mic reply-song delivery, warm conversational tone",
  "whisper-to-hook": "Soft breathy opening that builds to a warm mid-range chorus — stay in chest voice",
  "dabke-drop": "Warm festive vocal, confident polished delivery, clap-ready chorus energy",
  "sad-to-dance": "Emotional conversational verse, uplifting but controlled chorus lift",
  "arabic-trend-byte": "Warm Arabic pop vocal, natural dialect delivery, TikTok hook energy",
  "roast-song": "Playful talk-sing delivery, witty conversational tone",
  "three-word-hook": "Punchy minimal hook vocal, tight rhythmic delivery",
  "last-photo-song": "Intimate photo-mood vocal, soft warm close-mic texture",
  "tiktok-teaser": "Tight punchy social hook vocal, instant payoff energy",
  "wrong-genre-party": "Ironic verse texture, sugary polished chorus vocal",
  "countdown-hook": "Rising-tension delivery building to a punchy 3-2-1 payoff",
  "caption-song": "Intimate caption-style vocal, conversational social hook",
  "makhlouta-genre": "Playful fusion vocal, warm conversational mashup energy",
  "city-night": "Intimate night-drive vocal, cinematic close-mic mood",
  "before-after": "Quiet honest verse, brighter but controlled chorus lift",
  "oud-loop": "Warm Arabic-friendly vocal, poetic conversational delivery",
  "shower-thought": "Witty conversational delivery, philosophical one-liner chorus",
};

const TIMBRE_TO_LYRIA = {
  breathy: "breathy, airy close-mic texture",
  warm: "warm, soulful timbre",
  soft: "soft, gentle delivery",
  bright: "bright, clear upper chest tone",
  deep: "deeper chest voice, smooth resonance",
  raspy: "slightly raspy, textured timbre",
  soulful: "soulful, emotive delivery",
  crisp: "crisp, articulate delivery",
};

const LEGACY_LYRIA_MODEL_ALIASES = Object.freeze({
  "lyria-3-pro-preview": LYRIA_FULL_MODEL,
  pro: LYRIA_FULL_MODEL,
  full: LYRIA_FULL_MODEL,
});

function resolveLyriaModel(explicit) {
  const env = String(process.env.LYRIA_MUSIC_MODEL || "").trim();
  const raw = String(explicit || env || LYRIA_FULL_MODEL).trim();
  const low = raw.toLowerCase();
  if (low === "clip" || low === LYRIA_CLIP_MODEL) return LYRIA_CLIP_MODEL;
  return LEGACY_LYRIA_MODEL_ALIASES[low] || raw || LYRIA_FULL_MODEL;
}

function lyriaUseInteractionsApi() {
  return envFlagEnabled("LYRIA_USE_INTERACTIONS", { defaultOn: true });
}

function lyriaGenerateEnabled() {
  const v = String(process.env.LYRIA_GENERATE_ENABLED || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function envFlagEnabled(name, { defaultOn = true } = {}) {
  const v = String(process.env[name] || "").trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes") return true;
  if (v === "0" || v === "false" || v === "no") return false;
  return defaultOn;
}

function nabadClipEnabled() {
  return envFlagEnabled("NABAD_CLIP_ENABLED", { defaultOn: true });
}

/** Templates, Sparks, and challenge shelves → Lyria Clip (~30s). */
function templateSparkClipEnabled() {
  return envFlagEnabled("TEMPLATE_SPARK_CLIP_ENABLED", { defaultOn: true });
}

function isLyriaClipModel(model) {
  return String(model || "").trim().toLowerCase() === LYRIA_CLIP_MODEL;
}

/** Strip Suno-style negative clauses — Lyria responds to positive vocal profiles. */
function sanitizeStyleForLyria(style) {
  const parts = String(style || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return "";

  const drop = (part) => {
    const low = part.toLowerCase();
    if (/^no\b/.test(low)) return true;
    if (/^not\b/.test(low)) return true;
    if (/\bnever\b/.test(low)) return true;
    if (/\bavoid\b/.test(low)) return true;
    if (/\bwithout\b/.test(low)) return true;
    if (/\bno\s+\w+\s+\w+/.test(low)) return true;
    if (/\bnot\s+a\b/.test(low)) return true;
    if (low.includes("mid-sentence")) return true;
    if (low.includes("mid-word")) return true;
    if (low.includes("full-length")) return true;
    if (low.includes("full song")) return true;
    if (low.includes("4-minute")) return true;
    if (low.includes("stadium")) return true;
    if (low.includes("crowd sfx")) return true;
    return false;
  };

  return parts.filter((p) => !drop(p)).join(", ").replace(/\s+/g, " ").trim();
}

function mergeLyriaDialectHint(body = {}) {
  return [String(body?.dialectHint || "").trim(), String(body?.dialect || "").trim()]
    .filter(Boolean)
    .join(" — ");
}

/** msa = formal allowed; dialect = colloquial + no tanwin; natural = Arabic lyrics but no dialect chip. */
function resolveLyriaArabicPronunciationMode({ dialectHint = "", lyrics = "" } = {}) {
  const blob = String(dialectHint || "").toLowerCase();
  if (
    /\bmsa\b|modern standard|fusha|fus'?ha|formal arabic|classical arabic|\bnahwi\b|فصحى|فصح/.test(blob)
  ) {
    return "msa";
  }
  if (blob.trim()) return "dialect";
  if (/[\u0600-\u06FF]/.test(String(lyrics || ""))) return "natural";
  return "";
}

function buildLyriaArabicPronunciationLine(mode, dialectHint = "") {
  if (mode === "msa") {
    return "Modern Standard Arabic (MSA): formal pronunciation and grammar are allowed when appropriate.";
  }
  if (mode === "dialect") {
    const hint = String(dialectHint || "").trim();
    const flavor = hint || "colloquial Arabic dialect";
    return [
      `${flavor}.`,
      "Sing lyrics exactly as written — conversational spoken vowels.",
      "NO tanwin (ـٌ ـٍ ـً), NO formal MSA declension on names or address forms.",
      "Do NOT add vowel endings the text does not show (e.g. Charbel stays Charbel, not Charbelon).",
    ].join(" ");
  }
  if (mode === "natural") {
    return [
      "Arabic lyrics: natural spoken pronunciation — NO tanwin, NO formal MSA declension unless the written text includes it.",
      "Do not add extra vowel endings on names or words.",
    ].join(" ");
  }
  return "";
}

function mapTimbreToLyria(timbre) {
  const raw = String(timbre || "").trim();
  if (!raw) return "";
  const key = raw.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  for (const [k, v] of Object.entries(TIMBRE_TO_LYRIA)) {
    if (key.includes(k)) return v;
  }
  return `${raw} vocal texture`;
}

/**
 * Positive singer profile per Google Lyria prompting guide.
 * @see https://ai.google.dev/gemini-api/docs/music-generation
 */
function buildLyriaVocalProfile({
  vocalGender = "",
  voiceTimbre = "",
  challengeId = "",
  dialectHint = "",
  clipVocalProfileId = "",
} = {}) {
  const catalog = clipVocalProfileById(clipVocalProfileId);
  const bits = [];

  if (catalog?.lyriaVocalPrompt) {
    bits.push(String(catalog.lyriaVocalPrompt).trim());
  } else {
    const g = String(vocalGender || "").trim().toLowerCase();
    let genderProfile = "";
    if (g === "f") {
      genderProfile =
        "Female Alto: warm, soulful, conversational close-mic chest voice";
    } else if (g === "m") {
      genderProfile =
        "Male Baritone: smooth, warm chest voice, laid-back conversational delivery";
    } else {
      genderProfile =
        "Warm conversational lead vocal, close-mic chest voice, natural cadence";
    }
    bits.push(genderProfile);
    const timbreLine = mapTimbreToLyria(voiceTimbre);
    if (timbreLine) bits.push(timbreLine);
  }

  const challengeLine = CHALLENGE_VOCAL_PROFILES[String(challengeId || "").trim()];
  if (challengeLine) bits.push(challengeLine);

  const dialect = String(dialectHint || "").trim();
  if (dialect) {
    const mode = resolveLyriaArabicPronunciationMode({ dialectHint: dialect });
    if (mode === "msa") {
      bits.push(`Modern Standard Arabic vocal delivery — ${dialect}`);
    } else {
      bits.push(`Natural ${dialect} pronunciation and delivery — colloquial, not formal MSA`);
    }
  }

  return bits.join(". ").replace(/\.\s*\./g, ".").trim();
}

/**
 * Build a structured Lyria prompt: musical direction + vocal profile + Lyrics block.
 */
function buildLyriaPrompt({
  stylePrompt = "",
  lyrics = "",
  title = "",
  instrumental = false,
  clip = false,
  vocalGender = "",
  voiceTimbre = "",
  challengeId = "",
  dialectHint = "",
  clipVocalProfileId = "",
  enhancedStylePrompt = "",
  structuredLyrics = "",
  photoMood = false,
  durationSec = 0,
} = {}) {
  const sections = [];
  const style = String(enhancedStylePrompt || "").trim()
    || sanitizeStyleForLyria(stylePrompt);
  const lyricText = String(structuredLyrics || lyrics || "").trim();
  const songTitle = String(title || "").trim();
  const duration = Number(durationSec);

  if (Number.isFinite(duration) && duration >= 30 && !clip) {
    const mins = Math.max(1, Math.round(duration / 60));
    sections.push(
      `Duration: Create a song approximately ${mins} minute${mins === 1 ? "" : "s"} (${Math.round(duration)} seconds).`,
    );
  }

  if (photoMood) {
    sections.push(
      "Photo mood: Compose music inspired by the mood, colors, atmosphere, and feeling in the attached image.",
    );
  }

  if (clip) {
    sections.push(
      "Structure: Create a short ~28 second hook-focused music clip (one optional verse plus one chorus — not a full-length song).",
      "End on a complete musical phrase with a natural vocal close.",
    );
  }

  if (songTitle) sections.push(`Title: ${songTitle}`);
  if (style) sections.push(`Musical direction: ${style}`);

  if (!instrumental) {
    const vocalProfile = buildLyriaVocalProfile({
      vocalGender,
      voiceTimbre,
      challengeId,
      dialectHint,
      clipVocalProfileId,
    });
    if (vocalProfile) sections.push(`Vocal profile: ${vocalProfile}`);
    const pronunciationLine = buildLyriaArabicPronunciationLine(
      resolveLyriaArabicPronunciationMode({ dialectHint, lyrics: lyricText }),
      dialectHint,
    );
    if (pronunciationLine) sections.push(`Pronunciation: ${pronunciationLine}`);
  }

  if (instrumental) {
    sections.push("Instrumental only — no vocals, no lyrics.");
  } else if (lyricText) {
    sections.push(`Lyrics:\n${lyricText}`);
  } else {
    sections.push("Write and perform original lyrics matching the musical direction.");
  }

  return sections.join("\n\n").slice(0, 8000);
}

function decodeInlineAudio(inline) {
  if (!inline) return null;
  const data = String(inline?.data || "").trim();
  if (!data) return null;
  try {
    const buffer = Buffer.from(data, "base64");
    if (!buffer.length) return null;
    const mime = String(inline?.mimeType || inline?.mime_type || "audio/mpeg").split(";")[0].trim();
    return { buffer, mimeType: mime || "audio/mpeg" };
  } catch {
    return null;
  }
}

/**
 * Parse audio bytes from generateContent or Interactions-shaped payloads.
 */
function normalizeLyriaPayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  if (payload.interaction && typeof payload.interaction === "object") return payload.interaction;
  return payload;
}

function extractLyriaAudio(payload) {
  const data = normalizeLyriaPayload(payload);
  if (!data || typeof data !== "object") return null;

  const topAudio = decodeInlineAudio(data?.output_audio);
  if (topAudio) return topAudio;

  const steps = Array.isArray(data?.steps) ? data.steps : [];
  for (const step of steps) {
    if (String(step?.type || "") !== "model_output") continue;
    for (const block of step?.content || []) {
      if (String(block?.type || "") !== "audio") continue;
      const parsed = decodeInlineAudio({
        data: block?.data,
        mimeType: block?.mime_type || block?.mimeType || "audio/mpeg",
      });
      if (parsed) return parsed;
    }
  }

  const outputs = Array.isArray(data?.outputs) ? data.outputs : [];
  for (const out of outputs) {
    const inline = out?.inline_data || out?.inlineData || out?.audio || out;
    const parsed = decodeInlineAudio(inline);
    if (parsed) return parsed;
  }

  const parts = data?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    for (const part of parts) {
      const parsed = decodeInlineAudio(part?.inlineData || part?.inline_data);
      if (parsed) return parsed;
    }
  }

  return null;
}

/** Collect lyric / analysis text from Interactions or generateContent payloads. */
function extractLyriaTextParts(payload) {
  const data = normalizeLyriaPayload(payload);
  if (!data || typeof data !== "object") return [];

  const collected = [];
  const outputText = String(data?.output_text || "").trim();
  if (outputText) collected.push(outputText);

  const steps = Array.isArray(data?.steps) ? data.steps : [];
  for (const step of steps) {
    if (String(step?.type || "") !== "model_output") continue;
    for (const block of step?.content || []) {
      if (String(block?.type || "") !== "text") continue;
      const text = String(block?.text || "").trim();
      if (text) collected.push(text);
    }
  }

  const parts = data?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    for (const part of parts) {
      const text = String(part?.text || "").trim();
      if (text) collected.push(text);
    }
  }

  return collected;
}

/** Duration from the music-analysis text part (duration_secs: 150.5). */
function extractLyriaDurationSecs(payload) {
  for (const text of extractLyriaTextParts(payload)) {
    const m = /duration_secs:\s*([\d.]+)/i.exec(text);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

/** Pick the lyrics part (section markers + [sec:] timestamps), not the analysis blob. */
function pickLyriaLyricsPart(textParts) {
  for (const t of textParts) {
    if (/\[\[[A-D]\d+\]\]/.test(t) || /\[\d+(?:\.\d+)?:\]/.test(t)) return t;
  }
  const nonAnalysis = textParts.filter((t) => !/^mosic:/i.test(t) && !/^bpm:/i.test(t));
  if (nonAnalysis.length) {
    return nonAnalysis.sort((a, b) => a.length - b.length)[0];
  }
  return textParts[0] || "";
}

function lyriaSectionToTag(line) {
  const m = /^\[\[([A-D])(\d+)\]\]$/.exec(String(line || "").trim());
  if (!m) return String(line || "").trim();
  const map = { A: "Intro", B: "Verse", C: "Chorus", D: "Outro" };
  return `[${map[m[1]] || "Section"}]`;
}

/**
 * Lyria lyrics use line timestamps like [10.9:] and continuations [:].
 * Split each timed line into evenly-spaced words for karaoke display.
 */
function parseLyriaLyricsToAlignedWords(lyricsText, totalDurationS = 0) {
  const segments = [];
  let currentStart = 0;
  let currentText = "";

  const flushLyric = () => {
    const text = currentText.trim();
    if (text) segments.push({ text, startS: currentStart, isSection: false });
    currentText = "";
  };

  for (const raw of String(lyricsText || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    if (/^\[\[[A-D]\d+\]\]$/.test(line)) {
      flushLyric();
      segments.push({ text: lyriaSectionToTag(line), startS: currentStart, isSection: true });
      continue;
    }

    const abs = line.match(/^\[(\d+(?:\.\d+)?):\]\s*(.*)$/);
    if (abs) {
      flushLyric();
      currentStart = Number(abs[1]) || 0;
      currentText = abs[2] || "";
      continue;
    }

    const cont = line.match(/^\[:\]\s*(.*)$/);
    if (cont) {
      currentText += (currentText ? " " : "") + (cont[1] || "");
      continue;
    }

    flushLyric();
    currentText = line;
  }
  flushLyric();

  // Section markers precede their lyric block — inherit the next line's start time.
  for (let i = 0; i < segments.length; i++) {
    if (!segments[i].isSection) continue;
    const next = segments.slice(i + 1).find((s) => !s.isSection);
    if (next) segments[i].startS = next.startS;
  }

  const lyricSegs = segments.filter((s) => !s.isSection && s.text);
  if (!lyricSegs.length) return [];

  const duration =
    Number(totalDurationS) > 0
      ? Number(totalDurationS)
      : lyricSegs[lyricSegs.length - 1].startS + 8;

  const alignedWords = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.isSection) {
      const nextStart =
        segments.slice(i + 1).find((s) => !s.isSection)?.startS ?? seg.startS;
      alignedWords.push({
        word: seg.text,
        startS: seg.startS,
        endS: Math.max(seg.startS + 0.05, nextStart),
        success: true,
      });
      continue;
    }
    const nextLyric = segments.slice(i + 1).find((s) => !s.isSection);
    const endS = nextLyric ? nextLyric.startS : duration;
    const words = seg.text.split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    const span = Math.max(0.05, endS - seg.startS);
    const perWord = span / words.length;
    words.forEach((w, wi) => {
      alignedWords.push({
        word: w,
        startS: seg.startS + wi * perWord,
        endS: seg.startS + (wi + 1) * perWord,
        success: true,
      });
    });
  }
  return alignedWords;
}

function extractLyriaAlignedWords(payload) {
  const textParts = extractLyriaTextParts(payload);
  const lyricsPart = pickLyriaLyricsPart(textParts);
  if (!lyricsPart) return [];
  const duration = extractLyriaDurationSecs(payload);
  return parseLyriaLyricsToAlignedWords(lyricsPart, duration || 0);
}

function lyriaUserMessage(httpStatus, payload, rawText) {
  const data = normalizeLyriaPayload(payload);
  const err = data?.error?.message || data?.error;
  if (err) return String(err).slice(0, 280);
  const block = data?.promptFeedback?.blockReason;
  if (block) return `Lyria blocked this prompt (${block}). Try softer wording.`;
  const finish = data?.candidates?.[0]?.finishReason;
  if (finish && finish !== "STOP") return `Lyria could not finish (${finish}). Try again.`;
  if (httpStatus === 429) return "Lyria rate limit — wait a minute and try again.";
  if (httpStatus === 403) return "Lyria access denied — check GEMINI_API_KEY billing and Lyria access.";
  if (httpStatus >= 500) return "Lyria is temporarily unavailable — try again shortly.";
  const snippet = String(rawText || "").trim().slice(0, 180);
  return snippet || "Lyria generation failed — try again.";
}

function parseLyriaPhotoDataUrl(dataUrl) {
  const raw = String(dataUrl || "").trim();
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(raw);
  if (!match) return null;
  const mimeType = match[1].toLowerCase();
  const data = match[2].replace(/\s/g, "");
  if (!data || data.length > 2_600_000) return null;
  try {
    const buffer = Buffer.from(data, "base64");
    if (!buffer.length || buffer.length > 12 * 1024 * 1024) return null;
    return { mimeType, data, buffer };
  } catch {
    return null;
  }
}

/** Up to 10 images for Lyria multimodal input. */
function resolveLyriaPhotoImages({ photoImage = "", photoImages = null } = {}) {
  const rawList = Array.isArray(photoImages)
    ? photoImages
    : photoImage
      ? [photoImage]
      : [];
  const out = [];
  for (const item of rawList) {
    if (out.length >= 10) break;
    const parsed = parseLyriaPhotoDataUrl(item);
    if (parsed) out.push(parsed);
  }
  return out;
}

function buildLyriaInteractionsInput(prompt, photoImages = []) {
  const text = String(prompt || "").trim();
  const images = Array.isArray(photoImages) ? photoImages : [];
  if (!images.length) return text;
  const input = [{ type: "text", text }];
  for (const img of images) {
    input.push({
      type: "image",
      mime_type: img.mimeType,
      data: img.data,
    });
  }
  return input;
}

async function lyriaGenerateViaGenerateContent({ apiKey, model, prompt }) {
  const resolvedModel = resolveLyriaModel(model);
  const url = `${GEMINI_BASE}/models/${encodeURIComponent(resolvedModel)}:generateContent`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": String(apiKey || "").trim(),
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: String(prompt || "").trim() }] }],
      generationConfig: {
        responseModalities: ["AUDIO", "TEXT"],
      },
    }),
  });
  const text = await r.text().catch(() => "");
  const data = safeJson(text);
  const audio = extractLyriaAudio(data);
  const alignedWords = extractLyriaAlignedWords(data);
  return {
    ok: r.ok && Boolean(audio?.buffer?.length),
    httpStatus: r.status,
    data,
    text,
    audio,
    alignedWords,
    model: resolvedModel,
    api: "generateContent",
    userMessage: lyriaUserMessage(r.status, data, text),
  };
}

async function lyriaGenerateViaInteractions({ apiKey, model, prompt, photoImages = [] }) {
  const resolvedModel = resolveLyriaModel(model);
  const images = Array.isArray(photoImages) ? photoImages : [];
  const r = await fetch(LYRIA_INTERACTIONS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": String(apiKey || "").trim(),
    },
    body: JSON.stringify({
      model: resolvedModel,
      input: buildLyriaInteractionsInput(prompt, images),
    }),
  });
  const text = await r.text().catch(() => "");
  const data = safeJson(text);
  const audio = extractLyriaAudio(data);
  const alignedWords = extractLyriaAlignedWords(data);
  return {
    ok: r.ok && Boolean(audio?.buffer?.length),
    httpStatus: r.status,
    data,
    text,
    audio,
    alignedWords,
    model: resolvedModel,
    api: "interactions",
    userMessage: lyriaUserMessage(r.status, data, text),
  };
}

/**
 * @param {{ apiKey: string, model?: string, prompt: string, photoImages?: Array<{ mimeType: string, data: string, buffer: Buffer }> }} opts
 */
async function lyriaGenerateMusic({ apiKey, model, prompt, photoImages = [] }) {
  const images = Array.isArray(photoImages) ? photoImages : [];
  const useInteractions = lyriaUseInteractionsApi();

  if (useInteractions) {
    const interactionResult = await lyriaGenerateViaInteractions({
      apiKey,
      model,
      prompt,
      photoImages: images,
    });
    if (interactionResult.ok || images.length) return interactionResult;
    console.warn(
      "[lyria] interactions failed — falling back to generateContent",
      interactionResult.httpStatus,
      interactionResult.userMessage,
    );
  }

  if (images.length) {
    return {
      ok: false,
      httpStatus: 502,
      data: null,
      text: "",
      audio: null,
      alignedWords: [],
      model: resolveLyriaModel(model),
      api: "interactions",
      userMessage: "Lyria could not compose from your photo — try again in a minute.",
    };
  }

  return lyriaGenerateViaGenerateContent({ apiKey, model, prompt });
}

module.exports = {
  LYRIA_CLIP_MODEL,
  LYRIA_FULL_MODEL,
  clipVocalProfileById,
  CLIP_VOCAL_PROFILES,
  defaultClipVocalProfileForGender,
  buildLyriaInteractionsInput,
  buildLyriaPrompt,
  buildLyriaVocalProfile,
  mergeLyriaDialectHint,
  resolveLyriaArabicPronunciationMode,
  buildLyriaArabicPronunciationLine,
  sanitizeStyleForLyria,
  extractLyriaAlignedWords,
  extractLyriaAudio,
  extractLyriaDurationSecs,
  extractLyriaTextParts,
  isLyriaClipModel,
  lyriaGenerateEnabled,
  lyriaGenerateMusic,
  lyriaUseInteractionsApi,
  lyriaUserMessage,
  nabadClipEnabled,
  parseLyriaPhotoDataUrl,
  templateSparkClipEnabled,
  parseLyriaLyricsToAlignedWords,
  pickLyriaLyricsPart,
  resolveLyriaModel,
  resolveLyriaPhotoImages,
};
