/**
 * AI maqam verification (provider-neutral path).
 *
 * POST /api/music/detect-maqam   { features: {...} }
 *   <- { primaryMaqam, id, confidence, alternatives, isUncertain, detectedTonic, reasoning, provider }
 *
 * The phone does the DSP (microtonal pitch → cents → tonic cues → interval
 * sizes) and sends ONLY those numbers here — never the raw voice. Gemini Flash
 * then makes the final musicological call (it knows the maqam repertoire, neutral
 * thirds, sayr, etc.). Cheap (text-only, ~$0.001/call) and private. The client
 * falls back to its own local ranking if this fails or the user is offline.
 */
const { verifyUser } = require("../_lib/credits-auth");
const { applyCors } = require("../_lib/cors");
const { readJson, sendJson } = require("../_lib/suno-upstream");

const COOLDOWN_MS = 1500;
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
    const features = body?.features;
    if (!features || typeof features !== "object") {
      return sendJson(res, 400, { error: "Missing analysis features." });
    }

    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
    if (!geminiKey) {
      return sendJson(res, 502, { error: "Maqam verification unavailable (missing GEMINI_API_KEY)." });
    }

    const out = await tryGeminiMaqam({ geminiKey, features });
    if (!out?.ok) {
      return sendJson(res, 502, { error: out?.error || "Could not verify maqam — try again." });
    }
    return sendJson(res, 200, { ...out.result, provider: `gemini:${out.model || "unknown"}` });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};

function buildPrompt(features) {
  const ref = MAQAM_REFERENCE.map((m) => `- ${m.id} (${m.name}): ${m.sig}`).join("\n");
  return [
    "You are an expert in Arabic maqam theory analyzing a SUNG vocal phrase.",
    "The phone already measured the pitch content with microtonal precision and",
    "gives you the extracted numbers below (no audio). All intervals are in CENTS",
    "relative to the detected tonic (100¢ = one equal-tempered semitone;",
    "~150¢ and ~350¢ indicate quarter-tone / neutral degrees).",
    "",
    "Choose the SINGLE best-fitting maqam family from this fixed list (use the id):",
    ref,
    "",
    "Rules:",
    "- Judge primarily by the measured 2nd and 3rd interval sizes and the tonic stability.",
    "- A neutral/half-flat 2nd (~150¢) suggests Bayati/Saba/Sikah; a minor 2nd (~100¢) suggests Kurd/Hijaz; a whole 2nd (~200¢) suggests Nahawand/Rast/Ajam.",
    "- Distinguish by the 3rd: ~300 minor, ~350 neutral (Rast/Sikah), ~400 major/augmented.",
    "- Saba ONLY if the 4th is lowered (~400¢) with little perfect-4th (~500¢) energy.",
    "- If the tonic confidence is low or the cues disagree, set isUncertain true and lower the confidence.",
    "- Do NOT invent a maqam outside the list. Do NOT force a confident answer from weak evidence.",
    "",
    "Extracted features (JSON):",
    JSON.stringify(features),
    "",
    "Respond with ONLY this JSON shape:",
    '{"id":"<one of the ids>","primaryMaqam":"<display name>","confidence":<0-100 integer>,"isUncertain":<true|false>,"detectedTonic":"<note name>","alternatives":[{"id":"<id>","maqam":"<name>","confidence":<0-100>}],"reasoning":"<one or two sentences citing the measured intervals>"}',
  ].join("\n");
}

async function tryGeminiMaqam({ geminiKey, features }) {
  const discovered = await listGeminiGenerateModels(geminiKey);
  const preferred = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash"];
  const models = [...preferred, ...discovered].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
  let lastError = discovered.length ? "unknown" : "no generateContent models discovered";
  const prompt = buildPrompt(features);

  for (const model of models) {
    let r;
    try {
      r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
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
