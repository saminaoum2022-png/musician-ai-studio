/**
 * ElevenLabs Music API (music_v2).
 * @see https://elevenlabs.io/docs/api-reference/music/compose
 * @see https://elevenlabs.io/docs/api-reference/music/compose-detailed
 */
const ELEVEN_MUSIC_URL = "https://api.elevenlabs.io/v1/music";
const ELEVEN_MUSIC_DETAILED_URL = "https://api.elevenlabs.io/v1/music/detailed";

function safeJson(txt) {
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

function elevenlabsGenerateEnabled() {
  const v = String(process.env.ELEVENLABS_GENERATE_ENABLED || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function resolveElevenMusicModel(explicit) {
  const env = String(process.env.ELEVENLABS_MUSIC_MODEL || "").trim();
  const m = String(explicit || env || "music_v2").trim();
  return m === "music_v1" ? "music_v1" : "music_v2";
}

function resolveElevenMusicLengthMs(explicit) {
  const env = Number(process.env.ELEVENLABS_MUSIC_LENGTH_MS || "180000");
  const n = Number(explicit || env);
  if (!Number.isFinite(n)) return 180000;
  return Math.max(3000, Math.min(600000, Math.round(n)));
}

/** Music finetune id — original ElevenLabs music finetune (first NabadAi model). */
const DEFAULT_ELEVEN_MUSIC_FINETUNE_ID = "sj8dpdiqccqdoovlxuyx";
/** Retired finetunes — ignore if still set in ELEVENLABS_FINETUNE_ID on Vercel. */
const LEGACY_ELEVEN_MUSIC_FINETUNE_IDS = new Set(["trxfjjiiornsrkpjb4ne"]);

function resolveElevenFinetuneId(explicit) {
  const fromRequest = String(explicit || "").trim();
  if (fromRequest) return fromRequest;
  const env = String(process.env.ELEVENLABS_FINETUNE_ID || "").trim();
  if (env && !LEGACY_ELEVEN_MUSIC_FINETUNE_IDS.has(env)) return env;
  return DEFAULT_ELEVEN_MUSIC_FINETUNE_ID || null;
}

/** Confirm the server API key can see this finetune (same ElevenLabs account). */
async function verifyElevenFinetuneAccess({ apiKey, finetuneId }) {
  const id = String(finetuneId || "").trim();
  if (!id) return { ok: false, error: "missing_finetune_id" };
  const url = `https://api.elevenlabs.io/v1/music/finetunes/${encodeURIComponent(id)}`;
  try {
    const r = await fetch(url, {
      method: "GET",
      headers: { "xi-api-key": String(apiKey || "").trim() },
    });
    const text = await r.text().catch(() => "");
    const data = safeJson(text);
    if (!r.ok) {
      return {
        ok: false,
        httpStatus: r.status,
        error: r.status === 404 ? "finetune_not_found" : "finetune_lookup_failed",
        detail: data?.detail?.message || data?.detail || text.slice(0, 200) || null,
      };
    }
    const status = String(data?.status || "").trim().toLowerCase();
    if (status && status !== "completed") {
      return {
        ok: false,
        error: "finetune_not_ready",
        status,
        name: data?.name || null,
      };
    }
    return { ok: true, finetune: data };
  } catch (e) {
    return { ok: false, error: "finetune_lookup_failed", detail: e?.message || String(e) };
  }
}

function splitLyricLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 30)
    .map((l) => l.slice(0, 200));
}

function splitElevenStyleTags(stylePrompt) {
  const tags = String(stylePrompt || "")
    .split(/[,|]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
  const pad = [
    "professional studio production",
    "clear vocals",
    "warm mix",
    "steady rhythm",
    "polished arrangement",
    "radio-ready",
  ];
  for (const p of pad) {
    if (tags.length >= 6) break;
    if (!tags.some((t) => t.toLowerCase() === p)) tags.push(p);
  }
  return tags;
}

/** Rough duration for clamping conditioning_ref range (hum clips are short). */
function estimateReferenceDurationMs(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer.length : Buffer.byteLength(buffer || "");
  if (bytes < 128) return 5000;
  const ms = Math.round((bytes * 8) / 20);
  return Math.max(3000, Math.min(30000, ms));
}

/** Decode data URL or raw base64 reference audio from the client. */
function decodeReferenceAudioPayload(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const m = /^data:([^;]+);base64,(.+)$/i.exec(s);
  try {
    if (m) {
      const buffer = Buffer.from(m[2], "base64");
      if (!buffer.length) return null;
      return { buffer, mimeType: m[1].split(";")[0].trim() || "audio/mpeg" };
    }
    const buffer = Buffer.from(s, "base64");
    if (!buffer.length) return null;
    return { buffer, mimeType: "audio/mpeg" };
  } catch {
    return null;
  }
}

function referenceFilenameForMime(mime) {
  const t = String(mime || "").toLowerCase();
  if (t.includes("mp4") || t.includes("aac") || t.includes("mpeg")) return "vocal-reference.m4a";
  if (t.includes("webm")) return "vocal-reference.webm";
  if (t.includes("ogg")) return "vocal-reference.ogg";
  if (t.includes("wav")) return "vocal-reference.wav";
  return "vocal-reference.mp3";
}

/**
 * Upload hum / vocal reference for conditioning_ref in a composition plan.
 * @see https://elevenlabs.io/docs/api-reference/music/upload
 */
async function elevenlabsUploadMusic({ apiKey, buffer, mimeType, filename }) {
  const fileBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (fileBuffer.length < 128) {
    return { ok: false, userMessage: "Reference audio is empty — record or upload again." };
  }
  const form = new FormData();
  const blob = new Blob([fileBuffer], { type: mimeType || "audio/mpeg" });
  form.append("file", blob, filename || referenceFilenameForMime(mimeType));
  try {
    const r = await fetch("https://api.elevenlabs.io/v1/music/upload", {
      method: "POST",
      headers: { "xi-api-key": String(apiKey || "").trim() },
      body: form,
    });
    const text = await r.text().catch(() => "");
    const data = safeJson(text);
    const songId = String(data?.song_id || data?.songId || "").trim();
    if (!r.ok || !songId) {
      return {
        ok: false,
        httpStatus: r.status,
        data,
        userMessage: elevenUserMessage(r.status, data, text),
      };
    }
    return { ok: true, httpStatus: r.status, songId, data };
  } catch (e) {
    return { ok: false, userMessage: e?.message || "ElevenLabs reference upload failed." };
  }
}

/**
 * music_v2 composition plan — conditioning_ref on the first chunk.
 * Finetune is skipped when a reference is present (see music/generate.js).
 */
function buildElevenReferenceCompositionPlan({
  lyrics = "",
  stylePrompt = "",
  title = "",
  musicLengthMs,
  instrumental = false,
  referenceSongId,
  referenceRangeMs = 30000,
  conditionStrength = "high",
} = {}) {
  const lengthMs = Math.min(120000, resolveElevenMusicLengthMs(musicLengthMs));
  const styles = splitElevenStyleTags(stylePrompt);
  styles.push("match reference vocal timbre and melody");

  const lyricText = String(lyrics || "").trim();
  let text = "";
  if (instrumental) {
    text = "[Intro]\n{instrumental — follow reference melody, no vocals}";
  } else if (lyricText) {
    text = lyricText.includes("[") ? lyricText : `[Verse]\n${lyricText}`;
  } else {
    text = "[Verse]\nSing naturally, matching the reference vocal tone and melodic shape.";
  }
  const songTitle = String(title || "").trim();
  if (songTitle && !text.includes(songTitle)) {
    text = `[Verse]\n${text.replace(/^\[Verse\]\n?/, "")}`;
  }

  const refEnd = Math.max(
    3000,
    Math.min(30000, Math.round(Number(referenceRangeMs) || 30000)),
  );
  const strength = ["low", "medium", "high", "xhigh"].includes(String(conditionStrength))
    ? String(conditionStrength)
    : "high";

  return {
    chunks: [
      {
        text: text.slice(0, 4000),
        duration_ms: lengthMs,
        positive_styles: styles.slice(0, 20),
        context_adherence: "high",
        conditioning_ref: {
          song_id: String(referenceSongId || "").trim(),
          range: { start_ms: 0, end_ms: refEnd },
        },
        condition_strength: strength,
      },
    ],
  };
}

/**
 * Build a single prompt for Eleven Music v2 (prompt mode).
 */
function buildElevenMusicPrompt({ stylePrompt = "", lyrics = "", title = "", instrumental = false } = {}) {
  const bits = [];
  const style = String(stylePrompt || "").trim();
  const lyricText = String(lyrics || "").trim();
  const songTitle = String(title || "").trim();

  if (songTitle) bits.push(`Title: ${songTitle}`);
  if (style) bits.push(`Style and production: ${style}`);
  if (instrumental) {
    bits.push("Instrumental only — no vocals, no lyrics.");
  } else if (lyricText) {
    bits.push("Lyrics to sing (keep section tags like [Verse] and [Chorus]):");
    bits.push(lyricText);
  } else {
    bits.push("Write and perform original lyrics that match the style.");
  }
  bits.push("Studio-grade production, clear structure, professional mix.");
  return bits.join("\n\n").slice(0, 8000);
}

function elevenUserMessage(httpStatus, payload, rawText) {
  const err =
    payload?.detail?.message ||
    (Array.isArray(payload?.detail) ? payload.detail.map((d) => d?.msg || d?.message).filter(Boolean).join("; ") : null) ||
    payload?.detail ||
    payload?.message ||
    payload?.error;
  if (typeof err === "string" && err.trim()) return err.trim().slice(0, 280);
  if (err && typeof err === "object" && err.message) return String(err.message).slice(0, 280);
  if (httpStatus === 401) return "ElevenLabs API key invalid — check ELEVENLABS_API_KEY.";
  if (httpStatus === 402 || httpStatus === 403) {
    return "ElevenLabs Music requires a paid plan with Music API access.";
  }
  if (httpStatus === 429) return "ElevenLabs rate limit — wait a minute and try again.";
  if (httpStatus >= 500) return "ElevenLabs is temporarily unavailable — try again shortly.";
  const snippet = String(rawText || "").trim().slice(0, 180);
  return snippet || "ElevenLabs generation failed — try again.";
}

/** Parse multipart/mixed from compose_detailed (JSON metadata + binary audio). */
function parseMultipartMixed(rawBuffer, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^\s;]+))/i.exec(String(contentType || ""));
  const boundary = m?.[1] || m?.[2];
  if (!boundary) return { json: null, audio: null };

  const raw = Buffer.isBuffer(rawBuffer) ? rawBuffer : Buffer.from(rawBuffer);
  const delim = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = raw.indexOf(delim);
  while (start !== -1) {
    start += delim.length;
    if (raw[start] === 45 && raw[start + 1] === 45) break;
    if (raw[start] === 13 && raw[start + 1] === 10) start += 2;
    else if (raw[start] === 10) start += 1;
    const next = raw.indexOf(delim, start);
    parts.push(next === -1 ? raw.subarray(start) : raw.subarray(start, next));
    start = next;
  }

  let json = null;
  let audio = null;
  for (const part of parts) {
    const sep = part.indexOf("\r\n\r\n");
    const headerEnd = sep !== -1 ? sep : part.indexOf("\n\n");
    if (headerEnd === -1) continue;
    const headers = part.subarray(0, headerEnd).toString("utf8").toLowerCase();
    const bodyStart = sep !== -1 ? headerEnd + 4 : headerEnd + 2;
    let body = part.subarray(bodyStart);
    if (body.length >= 2 && body[body.length - 2] === 13 && body[body.length - 1] === 10) {
      body = body.subarray(0, body.length - 2);
    } else if (body.length >= 1 && body[body.length - 1] === 10) {
      body = body.subarray(0, body.length - 1);
    }
    if (headers.includes("application/json")) {
      json = safeJson(body.toString("utf8"));
    } else if (headers.includes("audio/")) {
      const ct = headers.match(/content-type:\s*([^\r\n]+)/)?.[1]?.trim() || "audio/mpeg";
      audio = { buffer: body, mimeType: ct };
    }
  }
  return { json, audio };
}

/** ElevenLabs words_timestamps → Suno-compatible alignedWords (seconds). */
function normalizeElevenWordsTimestamps(words) {
  if (!Array.isArray(words)) return [];
  return words
    .map((w) => ({
      word: String(w?.word ?? ""),
      startS: Number(w?.start_ms ?? w?.startMs ?? 0) / 1000,
      endS: Number(w?.end_ms ?? w?.endMs ?? 0) / 1000,
      success: true,
    }))
    .filter((w) => w.word !== "");
}

/**
 * @param {{ apiKey: string, prompt: string, model?: string, musicLengthMs?: number, instrumental?: boolean, finetuneId?: string }} opts
 */
async function elevenlabsGenerateMusic({
  apiKey,
  prompt,
  model,
  musicLengthMs,
  instrumental = false,
  finetuneId,
}) {
  const resolvedModel = resolveElevenMusicModel(model);
  const lengthMs = resolveElevenMusicLengthMs(musicLengthMs);
  const resolvedFinetuneId = resolveElevenFinetuneId(finetuneId);
  const url = `${ELEVEN_MUSIC_URL}?output_format=mp3_48000_192`;
  const body = {
    prompt: String(prompt || "").trim(),
    model_id: resolvedModel,
    music_length_ms: lengthMs,
    ...(instrumental ? { force_instrumental: true } : {}),
    ...(resolvedFinetuneId ? { finetune_id: resolvedFinetuneId } : {}),
  };

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": String(apiKey || "").trim(),
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify(body),
  });

  const ct = String(r.headers.get("content-type") || "").toLowerCase();
  if (r.ok && ct.includes("audio")) {
    const ab = await r.arrayBuffer();
    const buffer = Buffer.from(ab);
    return {
      ok: buffer.length >= 128,
      httpStatus: r.status,
      audio: { buffer, mimeType: "audio/mpeg" },
      model: resolvedModel,
      musicLengthMs: lengthMs,
      finetuneId: resolvedFinetuneId || undefined,
      userMessage: buffer.length >= 128 ? "" : "ElevenLabs returned empty audio.",
    };
  }

  const text = await r.text().catch(() => "");
  const data = safeJson(text);
  return {
    ok: false,
    httpStatus: r.status,
    data,
    text,
    model: resolvedModel,
    musicLengthMs: lengthMs,
    finetuneId: resolvedFinetuneId || undefined,
    userMessage: elevenUserMessage(r.status, data, text),
  };
}

/**
 * Detailed compose — returns audio + optional word timestamps (karaoke).
 * @param {{ apiKey: string, prompt?: string, compositionPlan?: object, model?: string, musicLengthMs?: number, instrumental?: boolean, finetuneId?: string, withTimestamps?: boolean }} opts
 */
async function elevenlabsGenerateMusicDetailed({
  apiKey,
  prompt,
  compositionPlan,
  model,
  musicLengthMs,
  instrumental = false,
  finetuneId,
  withTimestamps = true,
}) {
  const resolvedModel = resolveElevenMusicModel(model);
  const lengthMs = resolveElevenMusicLengthMs(musicLengthMs);
  const resolvedFinetuneId = resolveElevenFinetuneId(finetuneId);
  const wantTimestamps = withTimestamps && !instrumental;
  const url = `${ELEVEN_MUSIC_DETAILED_URL}?output_format=mp3_48000_192`;
  const plan = compositionPlan && typeof compositionPlan === "object" ? compositionPlan : null;
  const body = plan
    ? {
        composition_plan: plan,
        model_id: resolvedModel,
        ...(resolvedFinetuneId ? { finetune_id: resolvedFinetuneId } : {}),
        ...(wantTimestamps ? { with_timestamps: true } : {}),
      }
    : {
        prompt: String(prompt || "").trim(),
        model_id: resolvedModel,
        music_length_ms: lengthMs,
        ...(instrumental ? { force_instrumental: true } : {}),
        ...(resolvedFinetuneId ? { finetune_id: resolvedFinetuneId } : {}),
        ...(wantTimestamps ? { with_timestamps: true } : {}),
      };

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": String(apiKey || "").trim(),
      "Content-Type": "application/json",
      Accept: "multipart/mixed",
    },
    body: JSON.stringify(body),
  });

  const ct = String(r.headers.get("content-type") || "").toLowerCase();
  if (r.ok && ct.includes("multipart")) {
    const ab = await r.arrayBuffer();
    const { json, audio } = parseMultipartMixed(Buffer.from(ab), ct);
    const buffer = audio?.buffer;
    const rawWords = json?.words_timestamps ?? json?.wordsTimestamps ?? [];
    const alignedWords = normalizeElevenWordsTimestamps(rawWords);
    return {
      ok: buffer && buffer.length >= 128,
      httpStatus: r.status,
      audio: buffer ? { buffer, mimeType: audio.mimeType || "audio/mpeg" } : null,
      alignedWords,
      model: resolvedModel,
      musicLengthMs: lengthMs,
      finetuneId: resolvedFinetuneId || undefined,
      userMessage:
        buffer && buffer.length >= 128 ? "" : "ElevenLabs returned empty audio.",
    };
  }

  const text = await r.text().catch(() => "");
  const data = safeJson(text);
  return {
    ok: false,
    httpStatus: r.status,
    data,
    text,
    alignedWords: [],
    model: resolvedModel,
    musicLengthMs: lengthMs,
    finetuneId: resolvedFinetuneId || undefined,
    userMessage: elevenUserMessage(r.status, data, text),
  };
}

module.exports = {
  buildElevenMusicPrompt,
  buildElevenReferenceCompositionPlan,
  decodeReferenceAudioPayload,
  estimateReferenceDurationMs,
  elevenlabsGenerateEnabled,
  elevenlabsGenerateMusic,
  elevenlabsGenerateMusicDetailed,
  elevenlabsUploadMusic,
  elevenUserMessage,
  normalizeElevenWordsTimestamps,
  resolveElevenMusicLengthMs,
  resolveElevenMusicModel,
  resolveElevenFinetuneId,
  verifyElevenFinetuneAccess,
};
