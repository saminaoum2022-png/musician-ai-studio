"use strict";

/**
 * Hum Conductor — Gemini hears a hummed clip and writes a Lyria motif.
 * Admin-only (Settings toggle). Not Vibe. Not a user-facing tab.
 *
 * Hum to Track: instrumental + custom style → skip V3, motif prompt only.
 * Sung song: V3 plans sections, then motif_prose is stitched in.
 */

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const CONDUCTOR_TIMEOUT_MS = Number(process.env.NABAD_HUM_CONDUCTOR_TIMEOUT_MS || 90000);
const MAX_MOTIF_CHARS = 1800;
const MAX_PROMPT_CHARS = 8000;
const MIN_MOTIF_CHARS = 40;
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

const CONDUCTOR_MODEL_PREFERRED = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-2.5-flash",
];

const HUM_CONDUCTOR_SYSTEM_PROMPT = `You are the NabadAi hum conductor. Listen to the hummed clip once.

Write a motif that Google Lyria can play. Keep the hummed rhythm, rests, and articulation.
Name the maqam or key and the tonic you hear. Use accidental spellings that match it
(Bayat / Bayati: half-flats are allowed). Write half-flats as "E half-flat4", never "Edb", "Ebb", or "db".
Bb and F# are fine for ordinary flats and sharps. Group notes by bar. Mark legato, staccato, and rests
(sixteenth rest, eighth rest, quarter breath, sustained half note).

Do not write lyrics. Do not plan a full song (no verse/chorus form).
Do not name artists. Do not fight the hum with a different key.
Do not invent a band, drums, bass, or accompaniment — motif only.

Return ONLY valid JSON matching this schema. No markdown, no commentary.

{
  "bpm": 96,
  "meter": "4/4",
  "maqam": "Bayat",
  "tonic": "D",
  "bars": 2,
  "motif_prose": "Bar 1: legato D4-C4, staccato Bb3, sixteenth rest, ... Bar 2: ...",
  "play_count": 2,
  "silence_between_phrases": true
}

motif_prose must be bar-by-bar articulation like the example — that is the part Lyria follows.
Keep motif_prose under 1600 characters. Positive wording only.`;

function flagOn(raw) {
  return raw === "1" || raw === 1 || raw === true || raw === "true";
}

function flagOff(raw) {
  return raw === "0" || raw === 0 || raw === false || raw === "false";
}

/** Admin Settings toggle. Default off. Never on for non-admin. */
function resolveHumConductorEnabled(body, isAdmin = false) {
  if (!isAdmin) return false;
  const raw = body?.humConductor;
  if (flagOff(raw)) return false;
  if (flagOn(raw)) return true;
  return false;
}

function resolveConductorAudio(body = {}) {
  const buf = body?._referenceFileBytes;
  if (Buffer.isBuffer(buf) && buf.length >= 128 && buf.length <= MAX_AUDIO_BYTES) {
    const mime = String(body?._referenceFileMime || "audio/mpeg").split(";")[0].trim() || "audio/mpeg";
    return { buffer: buf, mimeType: mime };
  }
  const dataUrl = String(body?.referenceAudio || "").trim();
  const m = dataUrl.match(/^data:(audio\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (m?.[2]) {
    const buffer = Buffer.from(m[2], "base64");
    if (buffer.length >= 128 && buffer.length <= MAX_AUDIO_BYTES) {
      return { buffer, mimeType: m[1] };
    }
  }
  return null;
}

function safeJson(txt) {
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

function extractGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((p) => String(p?.text || "").trim()).filter(Boolean).join("\n").trim();
}

function parseConductorJson(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  let parsed = safeJson(text);
  if (parsed && typeof parsed === "object") return parsed;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) parsed = safeJson(fence[1].trim());
  if (parsed && typeof parsed === "object") return parsed;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    parsed = safeJson(text.slice(start, end + 1));
    if (parsed && typeof parsed === "object") return parsed;
  }
  return null;
}

function clampInt(n, min, max, fallback) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

/** Gemini sometimes writes Edb for a koron; Lyria reads that as double-flat (D). */
function rewriteHalfFlatSpellings(motif) {
  return String(motif || "")
    .replace(/\b([A-G])(?:db|bb)(\d)?\b/gi, (_, note, oct) => (
      `${note.toUpperCase()} half-flat${oct || ""}`
    ));
}

function normalizeConductorResult(raw) {
  if (!raw || typeof raw !== "object") return null;
  const motif = rewriteHalfFlatSpellings(
    String(raw.motif_prose || raw.motifProse || raw.motif || "").replace(/\s+/g, " ").trim(),
  );
  if (motif.length < MIN_MOTIF_CHARS) return null;
  const meterRaw = String(raw.meter || raw.timeSignature || "4/4").trim();
  const meter = meterRaw === "6/8" ? "6/8" : "4/4";
  const maqam = String(raw.maqam || raw.mode || raw.scale || "").trim().slice(0, 48);
  const tonic = String(raw.tonic || raw.key || "").trim().slice(0, 8);
  return {
    bpm: clampInt(raw.bpm, 40, 220, 96),
    meter,
    maqam,
    tonic,
    bars: clampInt(raw.bars, 1, 16, 2),
    motif_prose: motif.slice(0, MAX_MOTIF_CHARS),
    play_count: clampInt(raw.play_count ?? raw.playCount, 1, 4, 2),
    silence_between_phrases: raw.silence_between_phrases !== false && raw.silenceBetweenPhrases !== false,
  };
}

function resolveConductorModels() {
  const override = String(process.env.NABAD_HUM_CONDUCTOR_MODEL || "").trim();
  if (override) return [override];
  return CONDUCTOR_MODEL_PREFERRED;
}

function maqamPhrase(conductor) {
  const maqam = String(conductor?.maqam || "").trim();
  const tonic = String(conductor?.tonic || "").trim();
  if (maqam && tonic) return `Maqam ${maqam} in ${tonic}`;
  if (maqam) return `Maqam ${maqam}`;
  if (tonic) return `in ${tonic}`;
  return "";
}

/** Drop Western key tags so they cannot fight a hummed maqam. */
function stripWesternKeyConflicts(style) {
  return String(style || "")
    .replace(/\bKey:\s*[A-G][#b]?\s*(?:natural|minor|major|min|maj)?\b/gi, "")
    .replace(/\b(?:in\s+)?[A-G][#b]?\s*(?:natural|minor|major|min|maj)\b/gi, "")
    .replace(/\b(?:minor|major)\s+key\b/gi, "")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",")
    .replace(/\s+/g, " ")
    .replace(/^,\s*|\s*,\s*$/g, "")
    .trim();
}

/** Hum bpm / maqam / tonic win over a conflicting studio style line. */
function alignStyleToConductor(style, conductor) {
  let s = String(style || "").replace(/\s+/g, " ").trim();
  if (!conductor) return s;
  const bpm = Number(conductor.bpm);
  if (Number.isFinite(bpm) && bpm >= 40) {
    if (/\b\d{2,3}\s*BPM\b/i.test(s)) {
      s = s.replace(/\b\d{2,3}\s*BPM\b/i, `${bpm} BPM`);
    } else {
      s = s ? `${s}, ${bpm} BPM` : `${bpm} BPM`;
    }
  }
  const phrase = maqamPhrase(conductor);
  if (phrase) {
    s = stripWesternKeyConflicts(s);
    if (/\bmaqam\s+[\w-]+(?:\s+in\s+[A-G][#b]?)?/i.test(s)) {
      s = s.replace(/\bmaqam\s+[\w-]+(?:\s+in\s+[A-G][#b]?)?/i, phrase);
    } else {
      s = s ? `${s}, ${phrase}` : phrase;
    }
  }
  return s.replace(/\s+,/g, ",").replace(/,\s*,/g, ",").replace(/\s+/g, " ").trim();
}

function buildHumToTrackLyriaPrompt({ styleLine = "", conductor } = {}) {
  const motif = String(conductor?.motif_prose || "").trim();
  if (!motif) return { ok: false, error: "no_motif", prompt: "" };
  const playCount = clampInt(conductor?.play_count, 1, 4, 2);
  const playBit =
    playCount <= 1
      ? ""
      : playCount === 2
        ? "Play the motif twice"
        : `Play the motif ${playCount} times`;
  const silenceBit =
    conductor?.silence_between_phrases !== false && playCount > 1
      ? ", with clear silence between phrases"
      : "";
  const head = String(styleLine || "").trim() || alignStyleToConductor("Instrumental", conductor);
  const parts = [
    /instrumental/i.test(head) ? `${head}.` : `${head}. Instrumental only.`,
    `A clean lead playing a melodic motif with exact rhythmic timing, featuring strict note articulation: ${motif}.`,
    playBit ? `${playBit}${silenceBit}.` : "",
    "Keep the rests exactly as written.",
  ];
  const prompt = parts
    .filter(Boolean)
    .join(" ")
    .replace(/\.\s*\./g, ".")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_PROMPT_CHARS);
  return { ok: true, prompt, mode: "hum_to_track" };
}

function extractConductorMotifFromLyriaPrompt(prompt) {
  const src = String(prompt || "");
  if (!src.trim()) return null;
  const hummed = src.match(
    /Hummed motif[^\n]*:\s*\n([\s\S]*?)(?:\n(?:Play the motif|Keep the rests)|(?:\nLyrics:))/i,
  );
  let motif = hummed?.[1] ? hummed[1].trim() : "";
  let mode = "sung_motif";
  if (!motif || motif.length < MIN_MOTIF_CHARS) {
    const articulation = src.match(
      /strict note articulation:\s*([\s\S]+?)(?:\.\s*(?:Play the motif|Keep the rests)|$)/i,
    );
    motif = articulation?.[1] ? articulation[1].trim().replace(/\.\s*$/, "") : "";
    mode = "hum_to_track";
  }
  if (!motif || motif.length < MIN_MOTIF_CHARS) return null;
  const bpmHit = src.match(/\b(\d{2,3})\s*BPM\b/i);
  const maqamHit = src.match(/Maqam\s+([A-Za-z]+)(?:\s+in\s+([A-G](?:#|b| half-flat)?))?/i);
  return {
    motif_prose: motif.slice(0, MAX_MOTIF_CHARS),
    mode,
    bpm: bpmHit ? clampInt(bpmHit[1], 40, 220, 0) : 0,
    maqam: maqamHit?.[1] || "",
    tonic: maqamHit?.[2] || "",
  };
}

function savedConductorFromLyriaPrompt(prompt) {
  const extracted = extractConductorMotifFromLyriaPrompt(prompt);
  if (!extracted) return null;
  return {
    ok: true,
    used: true,
    replayed: true,
    mode: extracted.mode,
    motif_prose: extracted.motif_prose,
    bpm: extracted.bpm || undefined,
    maqam: extracted.maqam || undefined,
    tonic: extracted.tonic || undefined,
  };
}

function stitchConductorMotifIntoLyriaPrompt(prompt, conductor) {
  const motif = String(conductor?.motif_prose || "").trim();
  const src = String(prompt || "").trim();
  if (!motif) return { ok: false, error: "no_motif", prompt: src };
  if (/hummed motif/i.test(src)) return { ok: true, prompt: src, mode: "sung_motif" };
  const playBit =
    conductor?.silence_between_phrases !== false
      ? "Play the motif twice, with clear silence between phrases. Keep the rests as written."
      : "Keep the rests as written.";
  const block = [
    "Hummed motif (play these written notes on Chorus and Instrumental; follow the accidentals and rests as written):",
    motif,
    playBit,
  ].join("\n");
  let next = src;
  const lyricsIdx = next.search(/\nLyrics:\s*\n/i);
  if (lyricsIdx >= 0) {
    next = `${next.slice(0, lyricsIdx)}\n\n${block}\n${next.slice(lyricsIdx)}`;
  } else {
    next = `${next}\n\n${block}`;
  }
  return {
    ok: true,
    prompt: next.replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_PROMPT_CHARS),
    mode: "sung_motif",
  };
}

function appendHumConductorAdminDetail(conductor, extra = {}) {
  if (!conductor) return "";
  const applied = Boolean(conductor.ok) && !conductor.error;
  const lines = [
    `hum_conductor: ${applied ? "applied" : conductor.error ? "error" : "skipped"}`,
  ];
  if (extra.mode) lines.push(`hum_conductor_mode: ${extra.mode}`);
  if (conductor.model) lines.push(`hum_conductor_model: ${conductor.model}`);
  if (conductor.latencyMs != null) lines.push(`hum_conductor_ms: ${conductor.latencyMs}`);
  if (!applied && conductor.error) lines.push(`hum_conductor_error: ${conductor.error}`);
  if (conductor.replayed) lines.push("hum_conductor_replayed: 1");
  if (applied) {
    lines.push(`hum_conductor_bpm: ${conductor.bpm || ""} ${conductor.meter || ""}`.trim());
    if (conductor.maqam || conductor.tonic) {
      lines.push(`hum_conductor_maqam: ${maqamPhrase(conductor) || conductor.maqam || conductor.tonic}`);
    }
    if (conductor.bars) lines.push(`hum_conductor_bars: ${conductor.bars}`);
    if (conductor.motif_prose) {
      lines.push("hum_conductor_motif:");
      lines.push(conductor.motif_prose);
      lines.push("end_hum_conductor_motif");
    }
  }
  return lines.join("\n");
}

async function callGeminiHumConductor({ apiKey, buffer, mimeType } = {}) {
  const started = Date.now();
  if (!apiKey) {
    return { ok: false, error: "missing_gemini_api_key" };
  }
  if (!Buffer.isBuffer(buffer) || buffer.length < 128) {
    return { ok: false, error: "missing_hum_audio" };
  }
  if (buffer.length > MAX_AUDIO_BYTES) {
    return { ok: false, error: "hum_audio_too_large" };
  }

  const models = resolveConductorModels();
  const inline = {
    mime_type: String(mimeType || "audio/mpeg").split(";")[0].trim() || "audio/mpeg",
    data: buffer.toString("base64"),
  };
  const requestBody = JSON.stringify({
    systemInstruction: { parts: [{ text: HUM_CONDUCTOR_SYSTEM_PROMPT }] },
    contents: [{
      role: "user",
      parts: [
        { text: "Listen to this hummed clip and return the motif JSON." },
        { inline_data: inline },
      ],
    }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  });

  let lastError = "unknown";
  let lastModel = models[0] || "gemini-3.6-flash";

  for (const model of models) {
    lastModel = model;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONDUCTOR_TIMEOUT_MS);
    try {
      const url = `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent`;
      const r = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": String(apiKey).trim(),
        },
        body: requestBody,
      });
      const text = await r.text().catch(() => "");
      const data = safeJson(text);
      const latencyMs = Date.now() - started;
      if (!r.ok) {
        lastError = data?.error?.message || text.slice(0, 200) || `HTTP ${r.status}`;
        continue;
      }
      const parsed = parseConductorJson(extractGeminiText(data));
      const normalized = normalizeConductorResult(parsed);
      if (!normalized) {
        lastError = "invalid_json";
        continue;
      }
      return {
        ok: true,
        used: true,
        model,
        latencyMs,
        ...normalized,
      };
    } catch (e) {
      lastError = e?.name === "AbortError" ? "timeout" : (e?.message || String(e));
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    ok: false,
    used: false,
    error: lastError,
    model: lastModel,
    latencyMs: Date.now() - started,
  };
}

module.exports = {
  HUM_CONDUCTOR_SYSTEM_PROMPT,
  resolveHumConductorEnabled,
  resolveConductorAudio,
  rewriteHalfFlatSpellings,
  normalizeConductorResult,
  alignStyleToConductor,
  buildHumToTrackLyriaPrompt,
  stitchConductorMotifIntoLyriaPrompt,
  extractConductorMotifFromLyriaPrompt,
  savedConductorFromLyriaPrompt,
  appendHumConductorAdminDetail,
  callGeminiHumConductor,
  maqamPhrase,
};
