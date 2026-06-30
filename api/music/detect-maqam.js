/**
 * AI maqam detection (provider-neutral path).
 *
 * POST /api/music/detect-maqam   { audio?: "data:audio/...;base64,...", features?: {...} }
 *   <- { primaryMaqam, id, confidence, alternatives, isUncertain, detectedTonic, reasoning, provider }
 *
 * Two modes:
 *  - AUDIO (primary): the phone sends the recorded sung phrase and Gemini LISTENS
 *    to it, finding the tonic and the microtonal 2nd/3rd by ear. This sidesteps
 *    the on-device tonic/interval ambiguity (the local features are nearly flat
 *    across candidate tonics, so a numbers-only call can't separate Bayati/Kurd/
 *    Sikah reliably). The on-device numbers are still passed as a weak hint.
 *  - NUMBERS-ONLY (fallback): if no audio is supplied, Gemini reasons from the
 *    extracted features alone (cheaper/private, but limited by the flat features).
 *
 * The client always renders its local ranking first and only patches in this
 * result when it arrives, so a failure / offline / signed-out user is invisible.
 */
const { verifyUser } = require("../_lib/credits-auth");
const { applyCors } = require("../_lib/cors");
const { readJson, sendJson } = require("../_lib/suno-upstream");

const COOLDOWN_MS = 1500;
const MAX_AUDIO_CHARS = 3_500_000; // ~2.6MB binary; a 10–15s opus clip is far smaller
const lastCallByUser = new Map();

// The families the rest of Voice Lab understands (diagram + genre recs key off
// these ids). Keep the model's choice inside this set. Intervals are in cents.
const MAQAM_REFERENCE = [
  { id: "ajam", name: "‘Ajam", sig: "2nd ~200, 3rd ~400 (major), perfect 4th" },
  { id: "rast", name: "Rast", sig: "2nd ~200, 3rd ~350 (half-flat), 7th ~1050 (half-flat)" },
  { id: "nahawand", name: "Nahawand", sig: "2nd ~200, 3rd ~300 (minor), perfect 4th (minor scale)" },
  { id: "bayati", name: "Bayati", sig: "2nd ~150 (half-flat), 3rd ~300, perfect 4th" },
  { id: "kurd", name: "Kurd", sig: "2nd ~100 (minor 2nd), 3rd ~300, perfect 4th (phrygian)" },
  { id: "hijaz", name: "Hijaz", sig: "2nd ~100, 3rd ~400 (augmented 2nd gap), perfect 4th" },
  { id: "saba", name: "Saba", sig: "2nd ~150, 3rd ~300, lowered 4th ~400 (NO perfect 4th)" },
  { id: "sikah", name: "Sikah", sig: "half-flat tonic; 2nd ~150, 3rd ~350 (neutral)" },
];
const VALID_IDS = new Set(MAQAM_REFERENCE.map((m) => m.id));

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  try {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

    const user = await verifyUser(req);
    if (!user) return sendJson(res, 401, { error: "Sign in to verify maqam." });

    const now = Date.now();
    const last = lastCallByUser.get(user.userId) || 0;
    if (now - last < COOLDOWN_MS) {
      return sendJson(res, 429, { error: "Verifying too fast — try again in a moment." });
    }
    lastCallByUser.set(user.userId, now);
    if (lastCallByUser.size > 5000) lastCallByUser.clear();

    const body = await readJson(req);
    const features = body?.features && typeof body.features === "object" ? body.features : null;
    const audioUrl = String(body?.audio || "").trim();
    const hasAudio = audioUrl.startsWith("data:audio/");
    if (hasAudio && audioUrl.length > MAX_AUDIO_CHARS) {
      return sendJson(res, 413, { error: "Voice clip too large — keep it under about a minute." });
    }
    if (!hasAudio && !features) {
      return sendJson(res, 400, { error: "Send the recorded audio or the analysis features." });
    }

    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
    if (!geminiKey) {
      return sendJson(res, 502, { error: "Maqam detection unavailable (missing GEMINI_API_KEY)." });
    }

    const out = await tryGeminiMaqam({ geminiKey, features, audioUrl: hasAudio ? audioUrl : "" });
    if (!out?.ok) {
      return sendJson(res, 502, { error: out?.error || "Could not verify maqam — try again." });
    }
    return sendJson(res, 200, { ...out.result, heard: hasAudio, provider: `gemini:${out.model || "unknown"}` });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};

function buildPrompt(features, hasAudio) {
  const ref = MAQAM_REFERENCE.map((m) => `- ${m.id} (${m.name}): ${m.sig}`).join("\n");
  const sharedRules = [
    "Choose the SINGLE best-fitting maqam family from this fixed list (use the id):",
    ref,
    "",
    "How to tell them apart:",
    "- A neutral/half-flat 2nd (~150¢) ⇒ Bayati/Saba/Sikah; a minor 2nd (~100¢) ⇒ Kurd/Hijaz; a whole 2nd (~200¢) ⇒ Nahawand/Rast/Ajam.",
    "- The 3rd: ~300 minor, ~350 neutral (Rast/Sikah), ~400 major or augmented (Ajam/Hijaz).",
    "- Bayati vs Kurd hinges ENTIRELY on the 2nd: Bayati's 2nd is a quarter-flat (~150¢, sung 'in the cracks'); Kurd's is a clean minor 2nd (~100¢). When the 2nd sounds flat/ambiguous and the 3rd is minor with a perfect 4th, prefer Bayati.",
    "- Saba ONLY if the 4th is lowered (~400¢) with little perfect-4th (~500¢) energy.",
    "- Do NOT invent a maqam outside the list. Do NOT force a confident answer from weak evidence; use isUncertain + a lower confidence when the phrase wanders or never resolves.",
    "",
    "Respond with ONLY this JSON shape:",
    '{"id":"<one of the ids>","primaryMaqam":"<display name>","confidence":<0-100 integer>,"isUncertain":<true|false>,"detectedTonic":"<note name>","alternatives":[{"id":"<id>","maqam":"<name>","confidence":<0-100>}],"reasoning":"<one or two sentences citing what you heard>"}',
  ];
  if (hasAudio) {
    return [
      "You are an expert in Arabic maqam (and Turkish makam) theory. LISTEN to the",
      "attached short SUNG vocal phrase and identify the maqam family it is in.",
      "Trust your EARS for the microtonal intervals — equal-tempered note names are",
      "not enough; Arabic maqam lives in the quarter-tones between the piano keys.",
      "",
      "Method: (1) find the tonic — the note the phrase keeps returning to and",
      "resolves onto at phrase ends, NOT just the lowest or longest note. (2) Hear",
      "the size of the 2nd and 3rd ABOVE that tonic. (3) Match to the list below.",
      "",
      features
        ? "A rough on-device pitch analysis is included as a WEAK hint only — its tonic guess is frequently wrong, so trust your ears over these numbers:\n" + JSON.stringify(features)
        : "",
      "",
      ...sharedRules,
    ]
      .filter(Boolean)
      .join("\n");
  }
  return [
    "You are an expert in Arabic maqam theory analyzing a SUNG vocal phrase.",
    "The phone measured the pitch content with microtonal precision and gives you",
    "the extracted numbers below (no audio). All intervals are in CENTS relative to",
    "the detected tonic (100¢ = one equal-tempered semitone; ~150¢ and ~350¢ indicate",
    "quarter-tone / neutral degrees).",
    "- Judge primarily by the measured 2nd and 3rd interval sizes and the tonic stability.",
    "- If the tonic confidence is low or the cues disagree, set isUncertain true and lower the confidence.",
    "",
    ...sharedRules,
    "",
    "Extracted features (JSON):",
    JSON.stringify(features),
  ].join("\n");
}

async function tryGeminiMaqam({ geminiKey, features, audioUrl }) {
  const discovered = await listGeminiGenerateModels(geminiKey);
  const preferred = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash"];
  const models = [...preferred, ...discovered].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
  let lastError = discovered.length ? "unknown" : "no generateContent models discovered";
  const hasAudio = Boolean(audioUrl);
  const prompt = buildPrompt(features, hasAudio);
  const parts = hasAudio ? [{ text: prompt }, { inline_data: toInlineData(audioUrl) }] : [{ text: prompt }];

  for (const model of models) {
    let r;
    try {
      r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts }],
            generationConfig: { temperature: 0, responseMimeType: "application/json" },
          }),
        },
      );
    } catch (e) {
      lastError = `fetch_failed:${e?.message || e}`;
      continue;
    }
    const text = await r.text().catch(() => "");
    const payload = safeJson(text) || {};
    if (!r.ok) {
      lastError = `gemini_http_${r.status}`;
      continue;
    }
    const raw = extractText(payload);
    const parsed = safeJson(raw);
    const result = normalizeResult(parsed);
    if (!result) {
      lastError = "bad_model_json";
      continue;
    }
    return { ok: true, result, model };
  }
  return { ok: false, error: lastError };
}

function normalizeResult(p) {
  if (!p || typeof p !== "object") return null;
  const id = String(p.id || "").trim().toLowerCase();
  if (!VALID_IDS.has(id)) return null;
  const ref = MAQAM_REFERENCE.find((m) => m.id === id);
  const conf = clampInt(p.confidence, 0, 100);
  const alts = Array.isArray(p.alternatives)
    ? p.alternatives
        .map((a) => {
          const aid = String(a?.id || "").trim().toLowerCase();
          const aref = MAQAM_REFERENCE.find((m) => m.id === aid);
          if (!aref) return null;
          return { id: aid, maqam: aref.name, confidence: clampInt(a?.confidence, 0, 100) };
        })
        .filter(Boolean)
        .slice(0, 3)
    : [];
  return {
    id,
    primaryMaqam: String(p.primaryMaqam || ref.name).slice(0, 40) || ref.name,
    confidence: conf,
    isUncertain: Boolean(p.isUncertain) || conf < 45,
    detectedTonic: String(p.detectedTonic || "").slice(0, 24),
    alternatives: alts,
    reasoning: String(p.reasoning || "").slice(0, 400),
  };
}

function clampInt(v, lo, hi) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function toInlineData(dataUrl) {
  const m = dataUrl.match(/^data:(audio\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  return {
    mime_type: m ? m[1] : "audio/webm",
    data: m ? m[2] : "",
  };
}

function extractText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((p) => String(p?.text || "")).join("").trim();
}

async function listGeminiGenerateModels(geminiKey) {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(geminiKey)}`;
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

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
