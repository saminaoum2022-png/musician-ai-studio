/**
 * ElevenLabs Music API (music_v2).
 * @see https://elevenlabs.io/docs/api-reference/music/compose
 * @see https://elevenlabs.io/docs/api-reference/music/compose-detailed
 */
const ELEVEN_MUSIC_URL = "https://api.elevenlabs.io/v1/music";
const ELEVEN_MUSIC_DETAILED_URL = "https://api.elevenlabs.io/v1/music/detailed";
const ELEVEN_MUSIC_PLAN_URL = "https://api.elevenlabs.io/v1/music/plan";

const ELEVEN_POSITIVE_STYLE_PAD = [
  "professional studio production",
  "on-pitch accurate vocals",
  "tempo-locked vocal delivery",
  "concise syllable phrasing",
  "clear diction",
  "steady rhythm",
  "polished arrangement",
  "radio-ready",
];

/** Shared vocal negatives — avoid stretched, theatrical, off-key delivery. */
const ELEVEN_VOCAL_NEGATIVE_CORE = [
  "off-key vocals",
  "pitchy singing",
  "drawn-out syllables",
  "melismatic singing",
  "slow legato vocal delivery",
  "oversinging",
  "dramatic vibrato",
  "rubato against the beat",
  "theatrical vocal performance",
  "elongated vowels",
  "slow vocal tempo",
  "operatic delivery",
  "sentimental ballad drag",
  "overly deep low pitch",
  "mumbled lyrics",
  "spoken word",
];

function extractBpmFromText(...sources) {
  for (const src of sources) {
    const m = String(src || "").match(/\b(\d{2,3})\s*bpm\b/i);
    if (m) {
      const bpm = Number(m[1]);
      if (bpm >= 60 && bpm <= 220) return bpm;
    }
  }
  return null;
}

function formatBpmTag(bpm) {
  const n = Number(bpm);
  if (!Number.isFinite(n) || n < 60 || n > 220) return null;
  return `${Math.round(n)} BPM`;
}

/** Prevent vocal sections from being so long that ElevenLabs stretches syllables. */
function capVocalChunkDurationByLyrics({ lineCount, durationMs, bpm, instrumental = false } = {}) {
  if (instrumental || !lineCount || lineCount < 1) return durationMs;
  const tempo = Number(bpm) >= 60 && Number(bpm) <= 220 ? Number(bpm) : 108;
  const beatMs = 60000 / tempo;
  const maxMs = Math.round(lineCount * beatMs * 5.5);
  return Math.max(5000, Math.min(Number(durationMs) || maxMs, maxMs));
}

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

/** Map client `duration` (seconds) or explicit musicLengthMs — ElevenLabs only. */
function resolveElevenMusicLengthMsFromBody(body) {
  const explicitMs = Number(body?.musicLengthMs);
  if (Number.isFinite(explicitMs) && explicitMs > 0) {
    return resolveElevenMusicLengthMs(explicitMs);
  }
  const durationSec = Number(body?.duration);
  if (Number.isFinite(durationSec) && durationSec >= 10) {
    return resolveElevenMusicLengthMs(Math.round(durationSec * 1000));
  }
  return resolveElevenMusicLengthMs();
}

/** Music finetune id — active NabadAi ElevenLabs music finetune. */
const DEFAULT_ELEVEN_MUSIC_FINETUNE_ID = "trxfjjiiornsrkpjb4ne";
/** Retired finetunes — ignore if still set in ELEVENLABS_FINETUNE_ID on Vercel. */
const LEGACY_ELEVEN_MUSIC_FINETUNE_IDS = new Set(["sj8dpdiqccqdoovlxuyx"]);

function resolveElevenFinetuneId(explicit, { allowEnvDefault = true } = {}) {
  if (explicit === false || explicit === "off" || explicit === "none") return null;
  const fromRequest = String(explicit || "").trim();
  if (fromRequest) return fromRequest;
  if (!allowEnvDefault) return null;
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

function ensureMinPositiveStyles(tags) {
  const out = [...tags.map(String).filter(Boolean)];
  for (const p of ELEVEN_POSITIVE_STYLE_PAD) {
    if (out.length >= 7) break;
    if (!out.some((t) => t.toLowerCase() === p.toLowerCase())) out.push(p);
  }
  return out;
}

function splitElevenStyleTags(stylePrompt) {
  const tags = String(stylePrompt || "")
    .split(/[,|]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
  return ensureMinPositiveStyles(tags).slice(0, 50);
}

function splitElevenNegativeStyleTags(negativeTags, { instrumental = false } = {}) {
  const fromUser = String(negativeTags || "")
    .split(/[,|]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
  const defaults = instrumental
    ? ["vocals", "lyrics", "spoken word", "singing"]
    : [
        "harsh clipping",
        "random tempo changes",
        ...ELEVEN_VOCAL_NEGATIVE_CORE.slice(0, 10),
      ];
  const merged = [...fromUser];
  for (const d of defaults) {
    if (merged.length >= 16) break;
    if (!merged.some((t) => t.toLowerCase() === d.toLowerCase())) merged.push(d);
  }
  return merged.slice(0, 50);
}

/** Map Create singer / timbre picks → ElevenLabs positive_styles (English). */
function resolveElevenVocalPositiveTags({
  vocalGender = "",
  voiceTimbre = "",
  instrumental = false,
  bpmTag = "",
} = {}) {
  if (instrumental) return [];
  const g = String(vocalGender || "").trim().toLowerCase();
  const timbre = String(voiceTimbre || "").trim().toLowerCase();
  const tags = [];
  if (bpmTag) tags.push(bpmTag);
  tags.push(
    "on-pitch accurate vocals",
    "tempo-locked to the beat",
    "concise syllables no melisma",
    "conversational pop vocal",
    "rhythmic tight vocal phrasing",
    "natural mid-range pitch",
    "clear diction",
    "close-mic studio vocal",
  );
  if (g === "f" || g === "female") {
    tags.push("bright clear female vocal", "warm female pop voice");
  } else if (g === "m" || g === "male") {
    tags.push("warm male tenor vocal", "male pop vocal not baritone");
  }
  if (timbre.includes("warm")) tags.push("warm intimate vocal tone");
  if (timbre.includes("bright") || timbre.includes("pop")) tags.push("bright forward vocal presence");
  if (timbre.includes("deep") || timbre.includes("grit")) {
    tags.push("rich vocal texture without muddy low pitch");
  }
  return [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
}

function sectionElevenVocalBoost(sectionText = "") {
  const t = String(sectionText || "").toLowerCase();
  if (/chorus|hook|drop|final chorus/.test(t)) {
    return ["hook vocals on the beat", "sing-along clarity", "controlled energy not shouting"];
  }
  if (/bridge/.test(t)) {
    return ["contrasting vocal color on beat", "tight phrasing"];
  }
  if (/intro|outro/.test(t)) {
    return ["smooth vocal entrance on tempo", "polished vocal tone"];
  }
  return ["conversational on-beat verse delivery", "natural phrasing locked to rhythm"];
}

/** Apply singer-gender + performance tags to every chunk (ElevenLabs path only). */
function applyElevenVocalStylesToPlan(
  plan,
  { vocalGender = "", voiceTimbre = "", instrumental = false, bpm = null } = {},
) {
  if (!plan?.chunks?.length || instrumental) return plan;
  const bpmTag = formatBpmTag(bpm);
  const baseVocal = resolveElevenVocalPositiveTags({ vocalGender, voiceTimbre, instrumental, bpmTag });
  const chunks = plan.chunks.map((c) => {
    const sectionBoost = sectionElevenVocalBoost(c.text);
    const positive_styles = ensureMinPositiveStyles([
      ...baseVocal,
      ...sectionBoost,
      ...(c.positive_styles || []),
    ]).slice(0, 50);
    const negative_styles = [...(c.negative_styles || [])];
    for (const n of ELEVEN_VOCAL_NEGATIVE_CORE) {
      if (negative_styles.length >= 50) break;
      if (!negative_styles.some((t) => t.toLowerCase() === n.toLowerCase())) negative_styles.push(n);
    }
    return { ...c, positive_styles, negative_styles: negative_styles.slice(0, 50) };
  });
  return { chunks };
}

function resolvePlanBpm(plan, stylePrompt = "") {
  const fromStyle = extractBpmFromText(stylePrompt);
  if (fromStyle) return fromStyle;
  for (const c of plan?.chunks || []) {
    for (const tag of c.positive_styles || []) {
      const bpm = extractBpmFromText(tag);
      if (bpm) return bpm;
    }
  }
  return null;
}

function finalizeElevenSongPlan(
  plan,
  {
    stylePrompt = "",
    negativeTags = "",
    musicLengthMs,
    instrumental = false,
    vocalGender = "",
    voiceTimbre = "",
  } = {},
) {
  if (!plan?.chunks?.length) return plan;
  const bpm = resolvePlanBpm(plan, stylePrompt);
  let out = applyElevenVocalStylesToPlan(plan, { vocalGender, voiceTimbre, instrumental, bpm });
  out = applyNegativeStylesToPlan(out, negativeTags, { instrumental });
  out = scaleCompositionPlanDuration(out, musicLengthMs);
  const styleTags = splitElevenStyleTags(stylePrompt);
  if (out.chunks[0]) {
    out.chunks[0].positive_styles = ensureMinPositiveStyles([
      ...new Set(
        [...styleTags, ...(out.chunks[0].positive_styles || [])].map((s) => String(s).trim()).filter(Boolean),
      ),
    ]).slice(0, 50);
  }
  return out;
}

function extractElevenErrorDetail(data) {
  const detail = data?.detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail)) return detail;
  if (Array.isArray(detail) && detail[0] && typeof detail[0] === "object") return detail[0];
  return null;
}

/** bad_prompt / bad_composition_plan → one automatic retry payload. */
function extractElevenCopyrightRetry(data) {
  const d = extractElevenErrorDetail(data);
  const status = String(d?.status || d?.type || "").toLowerCase();
  if (status === "bad_prompt") {
    const suggestion = String(d?.data?.prompt_suggestion || d?.prompt_suggestion || "").trim();
    if (suggestion) return { kind: "prompt", suggestion };
  }
  if (status === "bad_composition_plan") {
    const plan = d?.data?.composition_plan_suggestion ?? d?.composition_plan_suggestion;
    if (plan && typeof plan === "object") return { kind: "composition_plan", plan };
    const suggestion = String(d?.data?.prompt_suggestion || d?.prompt_suggestion || "").trim();
    if (suggestion) return { kind: "prompt", suggestion };
  }
  return null;
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
  try {
    if (s.startsWith("data:")) {
      const comma = s.indexOf(",");
      if (comma < 0) return null;
      const header = s.slice(5, comma);
      const b64 = s.slice(comma + 1);
      const mimeType = header.split(";")[0].trim() || "audio/mpeg";
      const buffer = Buffer.from(b64, "base64");
      if (!buffer.length) return null;
      return { buffer, mimeType };
    }
    const buffer = Buffer.from(s, "base64");
    if (!buffer.length) return null;
    return { buffer, mimeType: "audio/mpeg" };
  } catch {
    return null;
  }
}

const ELEVEN_REFERENCE_MAX_BYTES = 15 * 1024 * 1024;

function unwrapProxyAudioUrl(raw) {
  let cur = String(raw || "").trim();
  if (!cur) return "";
  const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://www.nabadai.com";
  for (let i = 0; i < 8; i++) {
    if (!cur.toLowerCase().includes("api/suno/audio")) break;
    try {
      const u = /^https?:\/\//i.test(cur) ? new URL(cur) : new URL(cur, base);
      const inner = u.searchParams.get("url");
      if (!inner) break;
      cur = inner.includes("%") ? decodeURIComponent(inner) : inner;
    } catch {
      break;
    }
  }
  return cur.trim();
}

function absoluteFetchUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://www.nabadai.com";
  try {
    return new URL(s, base).toString();
  } catch {
    return s;
  }
}

/** Server-fetch remix / library audio when the client sends a URL (ElevenLabs reference). */
async function fetchElevenReferenceBytesFromUrl(rawUrl) {
  const unwrapped = unwrapProxyAudioUrl(rawUrl);
  const target = absoluteFetchUrl(unwrapped || rawUrl);
  if (!target || !/^https?:\/\//i.test(target)) {
    return { ok: false, error: "invalid_source_url" };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);
  try {
    const r = await fetch(target, { method: "GET", redirect: "follow", signal: ctrl.signal });
    if (!r.ok) return { ok: false, error: `upstream_${r.status}` };
    const ab = await r.arrayBuffer();
    const buffer = Buffer.from(ab);
    if (buffer.length < 128) return { ok: false, error: "source_empty" };
    if (buffer.length > ELEVEN_REFERENCE_MAX_BYTES) {
      return { ok: false, error: "source_too_large" };
    }
    const ct = String(r.headers.get("content-type") || "audio/mpeg").split(";")[0].trim();
    const mime = ct.includes("audio") ? ct : "audio/mpeg";
    return { ok: true, buffer, mimeType: mime };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  } finally {
    clearTimeout(timer);
  }
}

async function resolveElevenReferenceAudio(body) {
  const multipartBytes = body?._referenceFileBytes;
  if (Buffer.isBuffer(multipartBytes) && multipartBytes.length >= 128) {
    return {
      ok: true,
      buffer: multipartBytes,
      mimeType: String(body?._referenceFileMime || "audio/mpeg").split(";")[0].trim() || "audio/mpeg",
      source: "multipart",
    };
  }
  const fromPayload = decodeReferenceAudioPayload(body?.referenceAudio);
  if (fromPayload?.buffer?.length >= 128) {
    return { ok: true, ...fromPayload, source: "payload" };
  }
  const url = String(body?.referenceAudioUrl || body?.reference_audio_url || "").trim();
  if (!url) {
    return {
      ok: false,
      userMessage: "Missing or invalid vocal reference audio — record or upload again.",
      code: "elevenlabs_reference_invalid",
    };
  }
  const fetched = await fetchElevenReferenceBytesFromUrl(url);
  if (!fetched.ok || !fetched.buffer?.length) {
    return {
      ok: false,
      userMessage: "Could not load remix reference audio — try again.",
      code: "elevenlabs_reference_fetch_failed",
      details: fetched.error || null,
    };
  }
  return {
    ok: true,
    buffer: fetched.buffer,
    mimeType: fetched.mimeType || "audio/mpeg",
    source: "url",
  };
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

function normalizePlanChunks(chunks) {
  const normalized = (Array.isArray(chunks) ? chunks : []).map((c) => ({
    text: String(c?.text || "").trim().slice(0, 4000),
    duration_ms: Math.max(
      3000,
      Math.min(120000, Math.round(Number(c?.duration_ms ?? c?.durationMs) || 15000)),
    ),
    positive_styles: ensureMinPositiveStyles(
      (c?.positive_styles || c?.positiveStyles || []).map(String).filter(Boolean),
    ).slice(0, 50),
    negative_styles: (c?.negative_styles || c?.negativeStyles || []).map(String).filter(Boolean).slice(0, 50),
    context_adherence: ["low", "medium", "high"].includes(
      String(c?.context_adherence || c?.contextAdherence || "high"),
    )
      ? String(c?.context_adherence || c?.contextAdherence)
      : "high",
    ...(c?.conditioning_ref || c?.conditioningRef
      ? { conditioning_ref: c.conditioning_ref || c.conditioningRef }
      : {}),
    ...(c?.condition_strength || c?.conditionStrength
      ? { condition_strength: c.condition_strength || c.conditionStrength }
      : {}),
  }));
  return { chunks: normalized };
}

function normalizeElevenCompositionPlanResponse(data) {
  if (!data || typeof data !== "object") return null;
  if (Array.isArray(data.chunks) && data.chunks.length) {
    return normalizePlanChunks(data.chunks);
  }
  if (Array.isArray(data.composition_plan?.chunks) && data.composition_plan.chunks.length) {
    return normalizePlanChunks(data.composition_plan.chunks);
  }
  if (Array.isArray(data.sections) && data.sections.length) {
    const globalPos = (data.positive_global_styles || data.positiveGlobalStyles || [])
      .map(String)
      .filter(Boolean)
      .slice(0, 20);
    const globalNeg = (data.negative_global_styles || data.negativeGlobalStyles || [])
      .map(String)
      .filter(Boolean)
      .slice(0, 20);
    const chunks = data.sections.map((sec, i) => {
      const sectionName = String(sec?.section_name || sec?.sectionName || `Section ${i + 1}`).trim();
      const tag = sectionName.startsWith("[") ? sectionName : `[${sectionName}]`;
      const lines = Array.isArray(sec?.lines) ? sec.lines.map(String).filter(Boolean) : [];
      const text = lines.length ? `${tag}\n${lines.join("\n")}` : tag;
      return {
        text: text.trim(),
        duration_ms: Math.max(
          3000,
          Math.min(120000, Number(sec?.duration_ms ?? sec?.durationMs) || 15000),
        ),
        positive_styles: [
          ...globalPos,
          ...(sec?.positive_local_styles || sec?.positiveLocalStyles || []),
        ],
        negative_styles: [
          ...globalNeg,
          ...(sec?.negative_local_styles || sec?.negativeLocalStyles || []),
        ],
        context_adherence: "high",
      };
    });
    return normalizePlanChunks(chunks);
  }
  return null;
}

function parseStructuredLyricsIntoSections(structuredLyrics) {
  const text = String(structuredLyrics || "").trim();
  if (!text) return [];
  const sections = [];
  const lines = text.split(/\r?\n/);
  let current = null;
  const sectionRe = /^\[([^\]]+)\]\s*$/;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = sectionRe.exec(line);
    if (m) {
      if (current) sections.push(current);
      current = { tag: `[${m[1].trim()}]`, lines: [] };
    } else if (current) {
      current.lines.push(line.slice(0, 200));
    } else {
      current = { tag: "[Verse]", lines: [line.slice(0, 200)] };
    }
  }
  if (current) sections.push(current);
  return sections.slice(0, 30);
}

function injectLyricsIntoCompositionPlan(plan, structuredLyrics, { instrumental = false } = {}) {
  if (!plan?.chunks?.length || instrumental) return plan;
  const sections = parseStructuredLyricsIntoSections(structuredLyrics);
  if (!sections.length) return plan;

  const chunks = plan.chunks.map((c) => ({
    ...c,
    positive_styles: [...(c.positive_styles || [])],
    negative_styles: [...(c.negative_styles || [])],
  }));

  if (sections.length === 1 && chunks.length === 1) {
    chunks[0].text = `${sections[0].tag}\n${sections[0].lines.join("\n")}`.slice(0, 4000);
    return { chunks };
  }

  if (sections.length <= chunks.length) {
    for (let i = 0; i < chunks.length; i++) {
      if (i >= sections.length) {
        if (/outro/i.test(String(chunks[i].text || "")) || i === chunks.length - 1) {
          chunks[i].text = "[Outro]\n{fading out}";
        }
        continue;
      }
      const sec = sections[i];
      chunks[i].text = `${sec.tag}\n${sec.lines.join("\n")}`.slice(0, 4000);
    }
  } else {
    const perChunk = Math.ceil(sections.length / chunks.length);
    for (let i = 0; i < chunks.length; i++) {
      const slice = sections.slice(i * perChunk, (i + 1) * perChunk);
      chunks[i].text = slice
        .map((s) => `${s.tag}\n${s.lines.join("\n")}`)
        .join("\n\n")
        .slice(0, 4000);
    }
  }
  return { chunks };
}

function applyNegativeStylesToPlan(plan, negativeTags, { instrumental = false } = {}) {
  if (!plan?.chunks?.length) return plan;
  const neg = splitElevenNegativeStyleTags(negativeTags, { instrumental });
  const chunks = plan.chunks.map((c) => {
    const merged = [...(c.negative_styles || [])];
    for (const n of neg) {
      if (merged.length >= 50) break;
      if (!merged.some((t) => t.toLowerCase() === n.toLowerCase())) merged.push(n);
    }
    return { ...c, negative_styles: merged.slice(0, 50) };
  });
  return { chunks };
}

function scaleCompositionPlanDuration(plan, targetLengthMs) {
  const target = resolveElevenMusicLengthMs(targetLengthMs);
  if (!plan?.chunks?.length) return plan;
  const chunks = plan.chunks.map((c) => ({ ...c }));
  const current = chunks.reduce((s, c) => s + (Number(c.duration_ms) || 0), 0);
  if (current <= 0) {
    const each = Math.max(3000, Math.min(120000, Math.floor(target / chunks.length)));
    chunks.forEach((c) => {
      c.duration_ms = each;
    });
    return { chunks };
  }
  if (Math.abs(current - target) <= 2000) return { chunks };

  const ratio = target / current;
  let sum = 0;
  for (let i = 0; i < chunks.length; i++) {
    const scaled = Math.round((Number(chunks[i].duration_ms) || 15000) * ratio);
    chunks[i].duration_ms = Math.max(3000, Math.min(120000, scaled));
    sum += chunks[i].duration_ms;
  }
  const diff = target - sum;
  if (diff !== 0 && chunks.length) {
    const last = chunks.length - 1;
    chunks[last].duration_ms = Math.max(
      3000,
      Math.min(120000, (Number(chunks[last].duration_ms) || 15000) + diff),
    );
  }
  return { chunks };
}

function buildElevenPlanCreatePrompt({
  stylePrompt = "",
  title = "",
  lyrics = "",
  instrumental = false,
  vocalGender = "",
} = {}) {
  const bits = [];
  const songTitle = String(title || "").trim();
  const style = String(stylePrompt || "").trim();
  const lyricPreview = String(lyrics || "").trim().slice(0, 400);
  if (songTitle) bits.push(`Song title: ${songTitle}`);
  if (style) bits.push(`Production brief (English style tags only, no artist names): ${style}`);
  if (instrumental) {
    bits.push(
      "Instrumental track only — no vocals, no lyrics. Structured sections with intro, build, peak, and outro.",
    );
  } else {
    const g = String(vocalGender || "").trim().toLowerCase();
    const bpmHint = extractBpmFromText(style);
    const tempoLine = bpmHint
      ? `Tempo: ${bpmHint} BPM — vocals MUST stay locked to this tempo; concise syllables on the beat, no rubato or slow legato.`
      : "Vocals must stay locked to the track tempo — concise syllables on the beat, no rubato or slow legato.";
    if (g === "f" || g === "female") {
      bits.push(
        "Vocalist: female — bright clear tone, conversational on-beat pop delivery, on-pitch mid-range, NOT theatrical or ballad-slow.",
      );
    } else if (g === "m" || g === "male") {
      bits.push(
        "Vocalist: male TENOR — warm conversational pop delivery on the beat, on-pitch mid-range (not deep bass/baritone), NOT theatrical or ballad-slow.",
      );
    }
    bits.push(tempoLine);
    if (lyricPreview) {
      bits.push(`Theme from user lyrics (preserve language, do not name artists): ${lyricPreview}`);
    }
    bits.push(
      "Full vocal song with intro, verses, pre-chorus, chorus, bridge, and outro. User lyrics will be injected per section.",
    );
  }
  bits.push("Professional studio production. Use English for all style descriptors.");
  return bits.join("\n\n").slice(0, 4000);
}

/**
 * POST /v1/music/plan — free plan generation (rate-limited).
 * @see https://elevenlabs.io/docs/api-reference/music/create-composition-plan
 */
async function elevenlabsCreateCompositionPlan({
  apiKey,
  prompt,
  musicLengthMs,
  model,
  sourceCompositionPlan,
}) {
  const resolvedModel = resolveElevenMusicModel(model);
  const lengthMs = resolveElevenMusicLengthMs(musicLengthMs);
  const body = {
    prompt: String(prompt || "").trim(),
    model_id: resolvedModel,
    music_length_ms: lengthMs,
    ...(sourceCompositionPlan ? { source_composition_plan: sourceCompositionPlan } : {}),
  };
  try {
    const r = await fetch(ELEVEN_MUSIC_PLAN_URL, {
      method: "POST",
      headers: {
        "xi-api-key": String(apiKey || "").trim(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const text = await r.text().catch(() => "");
    const data = safeJson(text);
    if (!r.ok) {
      return {
        ok: false,
        httpStatus: r.status,
        data,
        text,
        userMessage: elevenUserMessage(r.status, data, text),
        copyrightRetry: extractElevenCopyrightRetry(data),
      };
    }
    const plan = normalizeElevenCompositionPlanResponse(data);
    if (!plan?.chunks?.length) {
      return {
        ok: false,
        httpStatus: r.status,
        data,
        text,
        userMessage: "ElevenLabs returned an empty composition plan.",
      };
    }
    return { ok: true, httpStatus: r.status, plan, data };
  } catch (e) {
    return {
      ok: false,
      userMessage: e?.message || "ElevenLabs composition plan request failed.",
    };
  }
}

/**
 * Phase C: build ElevenLabs composition plan directly from Gemini chunk output.
 */
function buildCompositionPlanFromProducerChunks({
  producerChunks = [],
  musicLengthMs,
  stylePrompt = "",
  negativeTags = "",
  instrumental = false,
  vocalGender = "",
  voiceTimbre = "",
}) {
  const rawList = Array.isArray(producerChunks) ? producerChunks : [];
  if (rawList.length < 2) return null;
  const planBpm =
    extractBpmFromText(stylePrompt) ||
    extractBpmFromText(
      ...(Array.isArray(producerChunks)
        ? producerChunks.flatMap((c) => c?.positive_styles || c?.positiveStyles || [])
        : []),
    );

  const chunks = [];
  for (const raw of rawList.slice(0, 30)) {
    const sectionRaw = String(raw?.section || raw?.tag || "").trim();
    if (!sectionRaw) continue;
    const tag = sectionRaw.startsWith("[") ? sectionRaw : `[${sectionRaw.replace(/^\[|\]$/g, "")}]`;
    const lines = Array.isArray(raw?.lines)
      ? raw.lines.map((l) => String(l || "").trim()).filter(Boolean).slice(0, 30)
      : [];
    let text = lines.length ? `${tag}\n${lines.join("\n")}` : tag;
    if (instrumental && !lines.length) {
      text = `${tag}\n{instrumental}`;
    }
    const positiveRaw = raw?.positive_styles || raw?.positiveStyles || [];
    const negativeRaw = raw?.negative_styles || raw?.negativeStyles || [];
    const durationSec = Number(raw?.duration_seconds ?? raw?.durationSeconds);
    let duration_ms =
      Number.isFinite(durationSec) && durationSec >= 3
        ? Math.max(3000, Math.min(120000, Math.round(durationSec * 1000)))
        : 15000;
    const chunkBpm =
      extractBpmFromText(...(Array.isArray(positiveRaw) ? positiveRaw : [positiveRaw])) || planBpm;
    duration_ms = capVocalChunkDurationByLyrics({
      lineCount: lines.length,
      durationMs: duration_ms,
      bpm: chunkBpm,
      instrumental,
    });
    let positive_styles = Array.isArray(positiveRaw)
      ? positiveRaw.map(String).filter(Boolean)
      : splitElevenStyleTags(String(positiveRaw || stylePrompt || ""));
    let negative_styles = Array.isArray(negativeRaw)
      ? negativeRaw.map(String).filter(Boolean)
      : String(negativeRaw || "")
          .split(/[,|]/)
          .map((s) => s.trim())
          .filter(Boolean);
    chunks.push({
      text: text.slice(0, 4000),
      duration_ms,
      positive_styles: ensureMinPositiveStyles(positive_styles).slice(0, 50),
      negative_styles: negative_styles.slice(0, 50),
      context_adherence: "high",
    });
  }
  if (chunks.length < 2) return null;

  return finalizeElevenSongPlan(
    { chunks },
    { stylePrompt, negativeTags, musicLengthMs, instrumental, vocalGender, voiceTimbre },
  );
}

/**
 * Phase B: create plan via ElevenLabs API, inject Gemini/user lyrics, apply negatives + duration.
 * Phase C: prefer Gemini composition_chunks when present (2+ sections).
 */
async function buildElevenSongCompositionPlan({
  apiKey,
  stylePrompt = "",
  title = "",
  lyrics = "",
  structuredLyrics = "",
  musicLengthMs,
  model,
  instrumental = false,
  negativeTags = "",
  producerChunks = null,
  vocalGender = "",
  voiceTimbre = "",
}) {
  const lyricSource = String(structuredLyrics || lyrics || "").trim();
  const finalizeOpts = {
    stylePrompt,
    negativeTags,
    musicLengthMs,
    instrumental,
    vocalGender,
    voiceTimbre,
  };

  if (Array.isArray(producerChunks) && producerChunks.length >= 2) {
    const geminiPlan = buildCompositionPlanFromProducerChunks({
      producerChunks,
      musicLengthMs,
      stylePrompt,
      negativeTags,
      instrumental,
      vocalGender,
      voiceTimbre,
    });
    if (geminiPlan?.chunks?.length >= 2) {
      return {
        ok: true,
        plan: geminiPlan,
        planSource: "gemini_chunk_plan",
        chunkCount: geminiPlan.chunks.length,
      };
    }
  }

  const planPrompt = buildElevenPlanCreatePrompt({
    stylePrompt,
    title,
    lyrics: lyricSource,
    instrumental,
    vocalGender,
  });

  let created = await elevenlabsCreateCompositionPlan({
    apiKey,
    prompt: planPrompt,
    musicLengthMs,
    model,
  });

  if (!created.ok && created.copyrightRetry?.kind === "prompt") {
    console.log("[elevenlabs] plan API copyright retry with prompt_suggestion");
    created = await elevenlabsCreateCompositionPlan({
      apiKey,
      prompt: created.copyrightRetry.suggestion,
      musicLengthMs,
      model,
    });
  }
  if (!created.ok && created.copyrightRetry?.kind === "composition_plan") {
    const plan = normalizeElevenCompositionPlanResponse(created.copyrightRetry.plan);
    if (plan?.chunks?.length) {
      created = { ok: true, plan, data: created.data };
    }
  }
  if (!created.ok || !created.plan?.chunks?.length) {
    return created;
  }

  let plan = created.plan;
  if (lyricSource && !instrumental) {
    plan = injectLyricsIntoCompositionPlan(plan, lyricSource, { instrumental });
  }
  plan = finalizeElevenSongPlan(plan, finalizeOpts);

  return { ok: true, plan, planSource: "elevenlabs_plan_api", chunkCount: plan.chunks.length };
}

function isElevenVocalPlanChunk(text, { instrumental = false } = {}) {
  if (instrumental) return false;
  const t = String(text || "").trim();
  if (!t) return false;
  const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const lyricLines = lines.filter(
    (l) => !/^\[[^\]]+\]$/.test(l) && !/^\{[^}]+\}$/.test(l),
  );
  if (lyricLines.length > 0) return true;
  return /\[(verse|chorus|pre-chorus|bridge|hook|final chorus)/i.test(t);
}

function sectionReferenceConditionStrength(sectionText = "", baseStrength = "high") {
  const t = String(sectionText || "").toLowerCase();
  if (/\[intro\]|\[outro\]|count-in|whisper/.test(t)) {
    return baseStrength === "high" || baseStrength === "xhigh" ? "medium" : baseStrength;
  }
  if (/\[verse|\[pre-chorus|\[chorus|\[bridge|\[hook|\[final chorus/.test(t)) {
    return baseStrength;
  }
  return baseStrength === "xhigh" ? "high" : baseStrength === "high" ? "medium" : baseStrength;
}

/**
 * Phase D: attach hum/vocal reference (conditioning_ref) to every vocal chunk in a multi-section plan.
 * @see https://elevenlabs.io/docs/api-reference/music/compose-detailed
 */
function applyElevenReferenceToCompositionPlan(
  plan,
  {
    referenceSongId,
    referenceRangeMs = 30000,
    conditionStrength = "high",
    instrumental = false,
  } = {},
) {
  if (!plan?.chunks?.length || !referenceSongId) return plan;
  const songId = String(referenceSongId || "").trim();
  if (!songId) return plan;
  const refEnd = Math.max(
    3000,
    Math.min(30000, Math.round(Number(referenceRangeMs) || 30000)),
  );
  const conditioningRef = {
    song_id: songId,
    range: { start_ms: 0, end_ms: refEnd },
  };
  const baseStrength = ["low", "medium", "high", "xhigh"].includes(String(conditionStrength))
    ? String(conditionStrength)
    : "high";
  let firstVocalSeen = false;
  const chunks = plan.chunks.map((c) => {
    if (!isElevenVocalPlanChunk(c.text, { instrumental })) return c;
    let strength = sectionReferenceConditionStrength(c.text, baseStrength);
    if (!firstVocalSeen) {
      firstVocalSeen = true;
      strength =
        baseStrength === "low" ? "medium" : baseStrength === "medium" ? "high" : "xhigh";
    }
    const positive_styles = ensureMinPositiveStyles([
      "match reference vocal timbre melody and rhythm",
      "follow hum reference pitch and phrasing",
      ...(c.positive_styles || []),
    ]).slice(0, 50);
    return {
      ...c,
      positive_styles,
      conditioning_ref: conditioningRef,
      condition_strength: strength,
    };
  });
  return { chunks };
}

/**
 * Single-chunk fallback when plan API / Gemini chunks are unavailable.
 * Prefer applyElevenReferenceToCompositionPlan on a multi-chunk plan (Phase D).
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
  negativeTags = "",
  vocalGender = "",
  voiceTimbre = "",
} = {}) {
  const lengthMs = Math.min(120000, resolveElevenMusicLengthMs(musicLengthMs));
  const styles = splitElevenStyleTags(stylePrompt);
  styles.push("match reference vocal timbre and melody");
  const negative_styles = splitElevenNegativeStyleTags(negativeTags, { instrumental });

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

  return finalizeElevenSongPlan(
    {
      chunks: [
        {
          text: text.slice(0, 4000),
          duration_ms: lengthMs,
          positive_styles: styles.slice(0, 50),
          negative_styles,
          context_adherence: "high",
          conditioning_ref: {
            song_id: String(referenceSongId || "").trim(),
            range: { start_ms: 0, end_ms: refEnd },
          },
          condition_strength: strength,
        },
      ],
    },
    { stylePrompt, negativeTags, musicLengthMs: lengthMs, instrumental, vocalGender, voiceTimbre },
  );
}

/**
 * Build a single prompt for Eleven Music v2 (prompt mode).
 */
function buildElevenMusicPrompt({
  stylePrompt = "",
  lyrics = "",
  title = "",
  instrumental = false,
  vocalGender = "",
} = {}) {
  const bits = [];
  const style = String(stylePrompt || "").trim();
  const lyricText = String(lyrics || "").trim();
  const songTitle = String(title || "").trim();
  const bpmHint = extractBpmFromText(style);

  if (songTitle) bits.push(`Title: ${songTitle}`);
  if (style) bits.push(`Style and production: ${style}`);
  if (instrumental) {
    bits.push("Instrumental only — no vocals, no lyrics.");
  } else {
    const g = String(vocalGender || "").trim().toLowerCase();
    if (g === "f" || g === "female") {
      bits.push(
        "Vocal performance: female — on-pitch, conversational on-beat pop delivery, concise syllables, NOT theatrical or slow legato.",
      );
    } else if (g === "m" || g === "male") {
      bits.push(
        "Vocal performance: male TENOR — on-pitch, conversational on-beat pop delivery, concise syllables, NOT theatrical or slow legato.",
      );
    }
    if (bpmHint) {
      bits.push(
        `Sing strictly at ${bpmHint} BPM — lock vocals to the beat; do not stretch syllables or drag behind the rhythm.`,
      );
    }
    if (lyricText) {
      bits.push("Lyrics to sing (keep section tags like [Verse] and [Chorus]):");
      bits.push(lyricText);
    } else {
      bits.push("Write and perform original lyrics that match the style.");
    }
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
  skipFinetune = false,
}) {
  const resolvedModel = resolveElevenMusicModel(model);
  const lengthMs = resolveElevenMusicLengthMs(musicLengthMs);
  const resolvedFinetuneId = skipFinetune
    ? null
    : resolveElevenFinetuneId(finetuneId);
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
  skipFinetune = false,
  withTimestamps = true,
}) {
  const resolvedModel = resolveElevenMusicModel(model);
  const lengthMs = resolveElevenMusicLengthMs(musicLengthMs);
  const resolvedFinetuneId = skipFinetune
    ? null
    : resolveElevenFinetuneId(finetuneId);
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
    copyrightRetry: extractElevenCopyrightRetry(data),
  };
}

/** One automatic retry on ElevenLabs copyright / bad-plan errors. */
async function elevenlabsGenerateMusicDetailedWithRetry(opts) {
  const first = await elevenlabsGenerateMusicDetailed(opts);
  if (first.ok) return first;
  const retry = first.copyrightRetry || extractElevenCopyrightRetry(first.data);
  if (!retry) return first;

  if (retry.kind === "composition_plan") {
    const plan = normalizeElevenCompositionPlanResponse(retry.plan);
    if (plan?.chunks?.length) {
      console.log("[elevenlabs] compose copyright retry with composition_plan_suggestion");
      return elevenlabsGenerateMusicDetailed({
        ...opts,
        prompt: undefined,
        compositionPlan: plan,
      });
    }
  }
  if (retry.kind === "prompt") {
    if (opts.compositionPlan) {
      console.log("[elevenlabs] compose copyright retry — new plan from prompt_suggestion");
      const replanned = await elevenlabsCreateCompositionPlan({
        apiKey: opts.apiKey,
        prompt: retry.suggestion,
        musicLengthMs: opts.musicLengthMs,
        model: opts.model,
      });
      if (replanned.ok && replanned.plan?.chunks?.length) {
        return elevenlabsGenerateMusicDetailed({
          ...opts,
          prompt: undefined,
          compositionPlan: replanned.plan,
        });
      }
    } else {
      console.log("[elevenlabs] compose copyright retry with prompt_suggestion");
      return elevenlabsGenerateMusicDetailed({
        ...opts,
        prompt: retry.suggestion,
        compositionPlan: undefined,
      });
    }
  }
  return first;
}

module.exports = {
  applyElevenReferenceToCompositionPlan,
  applyNegativeStylesToPlan,
  buildCompositionPlanFromProducerChunks,
  buildElevenMusicPrompt,
  buildElevenPlanCreatePrompt,
  buildElevenReferenceCompositionPlan,
  buildElevenSongCompositionPlan,
  decodeReferenceAudioPayload,
  fetchElevenReferenceBytesFromUrl,
  elevenlabsCreateCompositionPlan,
  estimateReferenceDurationMs,
  elevenlabsGenerateEnabled,
  elevenlabsGenerateMusic,
  elevenlabsGenerateMusicDetailed,
  elevenlabsGenerateMusicDetailedWithRetry,
  elevenlabsUploadMusic,
  elevenUserMessage,
  extractElevenCopyrightRetry,
  injectLyricsIntoCompositionPlan,
  normalizeElevenCompositionPlanResponse,
  normalizeElevenWordsTimestamps,
  parseStructuredLyricsIntoSections,
  resolveElevenMusicLengthMs,
  resolveElevenMusicLengthMsFromBody,
  resolveElevenMusicModel,
  resolveElevenFinetuneId,
  resolveElevenReferenceAudio,
  scaleCompositionPlanDuration,
  splitElevenNegativeStyleTags,
  splitElevenStyleTags,
  verifyElevenFinetuneAccess,
};
