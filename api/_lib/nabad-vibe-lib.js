/**
 * Nabad Vibe — admin-only song vibe read (Gemini multimodal audio).
 * Staging-first: NABAD_VIBE_ENABLED=1 on Vercel Preview.
 *
 * Copyright-safe: descriptive style/structure only — never lyrics or melody copy.
 */

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const VIBE_TIMEOUT_MS = Number(process.env.NABAD_VIBE_TIMEOUT_MS || 45000);

const VIBE_MODEL_PREFERRED = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
];

const CONFIDENCE = new Set(["low", "medium", "high"]);

function envFlagEnabled(name, { defaultOn = false } = {}) {
  const v = String(process.env[name] || "").trim().toLowerCase();
  if (!v) return defaultOn;
  return v === "1" || v === "true" || v === "yes";
}

function nabadVibeEnabled() {
  const isPreview = String(process.env.VERCEL_ENV || "").trim().toLowerCase() === "preview";
  return envFlagEnabled("NABAD_VIBE_ENABLED", { defaultOn: isPreview });
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function extractText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((p) => String(p?.text || "")).join("").trim();
}

async function listGeminiGenerateModels(geminiKey) {
  try {
    const url = `${GEMINI_BASE}/models?key=${encodeURIComponent(geminiKey)}`;
    const r = await fetch(url);
    const text = await r.text().catch(() => "");
    const data = safeJson(text) || {};
    if (!r.ok) return [];
    const models = Array.isArray(data?.models) ? data.models : [];
    return models
      .filter((m) => Array.isArray(m?.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
      .map((m) => String(m?.name || "").replace(/^models\//, "").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function buildVibeReadPrompt() {
  return [
    "You are a music production analyst for NabadAi — an original-song creation app.",
    "",
    "Listen to the uploaded audio ONCE and return ONLY descriptive production metadata.",
    "",
    "STRICT COPYRIGHT RULES (mandatory):",
    "- NEVER quote, paraphrase, or transcribe lyrics from the track.",
    "- NEVER identify the artist, song title, or album unless the user explicitly named them in this prompt (they did not).",
    "- NEVER describe specific melodic hooks, riffs, or note sequences to replicate.",
    "- NEVER instruct downstream AI to clone, cover, or recreate this recording.",
    "- structureTemplate must contain ONLY English section tags like [Intro], [Verse 1], [Chorus] — NO lyric lines.",
    "- lyricDirection must be a NEW original writing brief — mood/theme only, not words from the track.",
    "",
    "DO extract (descriptive only):",
    "- genre, subgenre, production era feel",
    "- style tags for AI music generation (instruments, energy, mix texture)",
    "- approximate BPM and key (with confidence low/medium/high)",
    "- time signature if clear",
    "- song structure sections with MM:SS timestamps",
    "- vocal delivery character (register, tone, energy — generic, no celebrity names)",
    "- dynamics / energy arc across the track",
    "- stylePrompt: one dense line for Suno/Lyria (BPM, key, genre, instruments, vocal feel)",
    "- instrumentalSuggestion: true if the track has no meaningful vocals",
    "",
    "Respond with ONLY valid JSON matching this shape:",
    JSON.stringify({
      concept: "one short sentence — mood and production feel only",
      genre: ["primary genre"],
      styleTags: ["4-8 tags for style field"],
      bpmEstimate: 120,
      bpmConfidence: "medium",
      keyEstimate: "G major",
      keyConfidence: "medium",
      timeSignature: "4/4",
      structure: [{ section: "Intro", start: "0:00", end: "0:12" }],
      instruments: ["list"],
      vocalStyle: "generic vocal character description",
      dynamics: "energy arc description",
      moodTags: ["2-5 mood words"],
      stylePrompt: "single line generation prompt",
      structureTemplate: "[Intro]\\n[Verse 1]\\n[Pre-Chorus]\\n[Chorus]\\n[Verse 2]\\n[Bridge]\\n[Outro]",
      lyricDirection: "original lyric theme brief — no copied lines",
      instrumentalSuggestion: false,
    }),
  ].join("\n");
}

function clampInt(n, min, max) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return null;
  return Math.max(min, Math.min(max, v));
}

function normConfidence(v) {
  const s = String(v || "").trim().toLowerCase();
  return CONFIDENCE.has(s) ? s : "medium";
}

function normStringList(arr, max = 12) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .slice(0, max);
}

function normStructure(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const section = String(row.section || row.label || "").trim();
      const start = String(row.start || row.startTime || "").trim();
      const end = String(row.end || row.endTime || "").trim();
      if (!section) return null;
      return { section, start, end };
    })
    .filter(Boolean)
    .slice(0, 24);
}

function stripLyricLinesFromTemplate(raw) {
  let s = String(raw || "").trim();
  if (!s) return "";
  const lines = s.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const out = [];
  for (const line of lines) {
    if (/^\[(intro|verse|pre-chorus|pre chorus|chorus|bridge|outro|hook|drop|break|interlude|solo|refrain)(\s+\d+)?\]$/i.test(line)) {
      out.push(line.replace(/\s+/g, " "));
      continue;
    }
    if (/^\[[^\]]+\]$/.test(line)) {
      out.push(line);
    }
  }
  return out.join("\n");
}

function normalizeVibeReadResult(raw) {
  if (!raw || typeof raw !== "object") return null;
  const styleTags = normStringList(raw.styleTags || raw.tags, 12);
  const genre = normStringList(raw.genre, 4);
  const bpmEstimate = clampInt(raw.bpmEstimate ?? raw.bpm, 40, 220);
  const structureTemplate = stripLyricLinesFromTemplate(raw.structureTemplate || raw.structureLyricsTemplate || "");
  const lyricDirection = String(raw.lyricDirection || raw.lyricSeed || "").trim().slice(0, 600);
  const stylePrompt = String(raw.stylePrompt || raw.generationPrompt || "").trim().slice(0, 980);
  const concept = String(raw.concept || raw.summary || "").trim().slice(0, 280);
  if (!concept && !styleTags.length && !stylePrompt) return null;

  return {
    concept: concept || "Vibe read ready.",
    genre,
    styleTags,
    bpmEstimate,
    bpmConfidence: normConfidence(raw.bpmConfidence),
    keyEstimate: String(raw.keyEstimate || raw.key || "").trim().slice(0, 48),
    keyConfidence: normConfidence(raw.keyConfidence),
    timeSignature: String(raw.timeSignature || raw.meter || "").trim().slice(0, 16),
    structure: normStructure(raw.structure || raw.sections),
    instruments: normStringList(raw.instruments, 10),
    vocalStyle: String(raw.vocalStyle || raw.vocalCharacter || "").trim().slice(0, 280),
    dynamics: String(raw.dynamics || raw.energyArc || "").trim().slice(0, 280),
    moodTags: normStringList(raw.moodTags || raw.mood, 8),
    stylePrompt,
    structureTemplate,
    lyricDirection,
    instrumentalSuggestion: Boolean(raw.instrumentalSuggestion),
    inspirationOnly: true,
  };
}

function toInlineAudio(dataUrl) {
  const m = String(dataUrl || "").match(/^data:(audio\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  return {
    mime_type: m ? m[1] : "audio/mpeg",
    data: m ? m[2] : "",
  };
}

async function callGeminiVibeRead({ apiKey, dataUrl, mimeType }) {
  const discovered = await listGeminiGenerateModels(apiKey);
  const models = [...VIBE_MODEL_PREFERRED, ...discovered].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
  let lastError = discovered.length ? "unknown" : "no generateContent models discovered";
  const prompt = buildVibeReadPrompt();
  const inline = dataUrl.startsWith("data:") ? toInlineAudio(dataUrl) : null;

  for (const model of models) {
    const parts = [{ text: prompt }];
    if (inline?.data) {
      parts.push({ inline_data: inline });
    } else if (mimeType) {
      parts.push({ inline_data: { mime_type: mimeType, data: dataUrl } });
    } else {
      lastError = "missing_audio";
      continue;
    }

    let r;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), VIBE_TIMEOUT_MS);
      r = await fetch(
        `${GEMINI_BASE}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: ctrl.signal,
          body: JSON.stringify({
            contents: [{ role: "user", parts }],
            generationConfig: {
              temperature: 0.2,
              responseMimeType: "application/json",
            },
          }),
        },
      );
      clearTimeout(timer);
    } catch (e) {
      lastError = e?.name === "AbortError" ? "timeout" : `fetch_failed:${e?.message || e}`;
      continue;
    }

    const text = await r.text().catch(() => "");
    const payload = safeJson(text) || {};
    if (!r.ok) {
      lastError = `gemini_http_${r.status}`;
      continue;
    }
    const rawText = extractText(payload);
    const parsed = safeJson(rawText) || safeJson(rawText.replace(/^```json|```$/gim, "").trim());
    const result = normalizeVibeReadResult(parsed);
    if (!result) {
      lastError = "bad_model_json";
      continue;
    }
    return { ok: true, result, model };
  }
  return { ok: false, error: lastError };
}

module.exports = {
  nabadVibeEnabled,
  buildVibeReadPrompt,
  normalizeVibeReadResult,
  callGeminiVibeRead,
  toInlineAudio,
};
