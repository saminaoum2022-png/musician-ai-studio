/**
 * POST /api/coach-song-plan-extract
 * Body: { message, step, known: {path,topic,occasionId,language,dialect,
 *         dedicatedTo,recipientName,songTitle}, occasionOptions: [{id,label}] }
 * Returns: { ok: true, extracted: {...fields the model could confidently read
 *            from the message...}, ack: "short natural one-liner" }
 *
 * Song Plan — Phase 1 (AI-assisted slot filling). Nabad Coach's Song plan used
 * to understand each step with plain regex, so a combined free-text answer
 * ("a love song in Arabic for my mom named Lina") only ever filled the single
 * field the current step's regex was built for and silently dropped the rest.
 * This endpoint does real language understanding of the WHOLE message against
 * every field still worth asking, using a closed set of allowed values per
 * field (same options the chip UI itself offers) — the model never invents a
 * value outside those options, and the caller still owns all step ordering
 * and transition logic; this only ever fills values, never decides flow.
 *
 * PRIVACY: same posture as /api/coach — no DB access, no other-user data ever
 * enters the prompt, JWT verified for auth/rate-limit only.
 */

const { verifyUser, sendJson, setCors, readJsonBody } = require("./_lib/credits-auth");
const { queueLogProviderUsage } = require("./_lib/provider-usage-log");

const MAX_MESSAGE_CHARS = 600;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX = 120; // generous — this fires at most once per song-plan step
const _rate = new Map();

function rateLimited(userId) {
  const now = Date.now();
  const arr = (_rate.get(userId) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) {
    _rate.set(userId, arr);
    return true;
  }
  arr.push(now);
  _rate.set(userId, arr);
  if (_rate.size > 5000) {
    for (const k of _rate.keys()) { _rate.delete(k); if (_rate.size <= 4000) break; }
  }
  return false;
}

function redactSensitive(input) {
  let s = String(input || "");
  s = s.replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, "[redacted email]");
  s = s.replace(/\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[redacted token]");
  s = s.replace(/\b[A-Za-z0-9]{32,}\b/g, "[redacted token]");
  return s;
}

const LANGUAGE_OPTIONS = ["auto", "english", "arabic", "french"];
const DIALECT_OPTIONS = ["lebanese", "egyptian", "gulf", "syrian", "palestinian", "iraqi"];
const DEDICATED_OPTIONS = ["her", "him", "anyone"];
const TOPIC_OPTIONS = ["love", "apology", "dabke", "custom"];
const PATH_OPTIONS = ["occasion", "vibe"];

function safeJson(txt) {
  try { return JSON.parse(txt); } catch { return null; }
}

function buildExtractionPrompt({ known, occasionOptions, step }) {
  const knownLines = Object.entries(known || {})
    .filter(([, v]) => String(v || "").trim())
    .map(([k, v]) => `  - ${k}: ${v}`)
    .join("\n") || "  (nothing yet)";
  const occasionList = (occasionOptions || []).map((o) => `${o.id} (${o.label})`).join(", ");
  return `
You are a precise field-extraction engine for Nabad Coach's "Song plan" — a short guided setup that collects a few facts about a song the user wants to make, one step at a time. The app already knows how to ask each remaining question; your ONLY job is to read the user's one message and report which of these fields it clearly answers. You are not choosing what to ask next and you are not writing lyrics.

FIELDS AND THEIR ONLY ALLOWED VALUES (never invent a value outside this list for a given field; if unsure, omit the field):
- path: ${PATH_OPTIONS.join(" | ")}
- topic: ${TOPIC_OPTIONS.join(" | ")} (use "custom" + customTopicLabel for any vibe not in this list, e.g. "friendship", "graduation")
- customTopicLabel: short free text, only meaningful when topic = custom
- occasionId: one of: ${occasionList}
- language: ${LANGUAGE_OPTIONS.join(" | ")}
- dialect: ${DIALECT_OPTIONS.join(" | ")} (only relevant if language is arabic)
- dedicatedTo: ${DEDICATED_OPTIONS.join(" | ")}
- recipientName: a short free-text name (e.g. "Lina"), only if the user names a specific person
- songTitle: a short free-text title, only if the user clearly states what the song should be called (not the same as a person's name)

ALREADY KNOWN (do not re-extract these — they are already set; only report NEW information the message adds):
${knownLines}

The app is currently waiting on the "${String(step || "")}" step, but the user may have answered several fields at once — extract every field you can confidently support from the message, not just that one.

Reply with ONLY a JSON object, no prose, no markdown fences, shaped exactly like:
{"extracted": {"<field>": "<value>", ...}, "ack": "<short natural one-sentence reaction, 1 sentence, in the SAME language the user wrote in, acknowledging what you understood — do not ask a question, the app asks the next question itself>"}

If you cannot confidently extract anything new, return {"extracted": {}, "ack": ""}.
`.trim();
}

async function callGeminiJson({ geminiKey, systemPrompt, message }) {
  const models = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-lite"];
  let lastError = "no model responded";
  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiKey)}`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { role: "system", parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: message }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 400, responseMimeType: "application/json" },
        }),
      });
      const text = await r.text().catch(() => "");
      const data = safeJson(text) || {};
      if (!r.ok) { lastError = data?.error?.message || text || `HTTP ${r.status}`; continue; }
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const out = parts.map((p) => (typeof p?.text === "string" ? p.text : "")).join("").trim();
      if (!out) { lastError = "empty response"; continue; }
      const parsed = safeJson(out);
      if (!parsed || typeof parsed !== "object") { lastError = "unparseable JSON"; continue; }
      return { ok: true, parsed };
    } catch (e) {
      lastError = String(e?.message || e);
    }
  }
  return { ok: false, error: lastError };
}

/** Defense in depth: never trust the model's output directly — only ever
 *  forward values that are exactly one of the options we gave it. */
function sanitizeExtracted(raw, { occasionOptions }) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  const occasionIds = new Set((occasionOptions || []).map((o) => String(o.id)));
  const str = (v) => (typeof v === "string" ? v.trim() : "");

  if (PATH_OPTIONS.includes(str(raw.path))) out.path = str(raw.path);
  if (TOPIC_OPTIONS.includes(str(raw.topic))) {
    out.topic = str(raw.topic);
    if (out.topic === "custom") {
      const label = str(raw.customTopicLabel).slice(0, 80);
      if (label) out.customTopicLabel = label;
    }
  }
  if (raw.occasionId && occasionIds.has(str(raw.occasionId))) out.occasionId = str(raw.occasionId);
  if (LANGUAGE_OPTIONS.includes(str(raw.language).toLowerCase())) out.language = str(raw.language).toLowerCase();
  if (DIALECT_OPTIONS.includes(str(raw.dialect).toLowerCase())) out.dialect = str(raw.dialect).toLowerCase();
  if (DEDICATED_OPTIONS.includes(str(raw.dedicatedTo).toLowerCase())) out.dedicatedTo = str(raw.dedicatedTo).toLowerCase();
  const name = str(raw.recipientName).slice(0, 40);
  if (name) out.recipientName = name;
  const title = str(raw.songTitle).slice(0, 80);
  if (title) out.songTitle = title;
  return out;
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.end();
  if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "Method not allowed" });

  const user = await verifyUser(req);
  if (!user) return sendJson(res, 401, { ok: false, error: "Not signed in" });

  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  if (!geminiKey) return sendJson(res, 200, { ok: true, extracted: {}, ack: "" });

  if (rateLimited(user.userId)) return sendJson(res, 200, { ok: true, extracted: {}, ack: "" });

  const body = await readJsonBody(req);
  const message = redactSensitive(String(body?.message || "").trim().slice(0, MAX_MESSAGE_CHARS));
  if (!message) return sendJson(res, 400, { ok: false, error: "Message required" });
  const step = String(body?.step || "").trim().slice(0, 40);
  const known = body?.known && typeof body.known === "object" ? body.known : {};
  const occasionOptions = Array.isArray(body?.occasionOptions)
    ? body.occasionOptions.slice(0, 40).map((o) => ({ id: String(o?.id || "").slice(0, 60), label: String(o?.label || "").slice(0, 80) })).filter((o) => o.id)
    : [];

  const systemPrompt = buildExtractionPrompt({ known, occasionOptions, step });
  const result = await callGeminiJson({ geminiKey, systemPrompt, message });
  if (!result.ok) {
    // Fail soft — the caller falls back to its existing side-help path.
    return sendJson(res, 200, { ok: true, extracted: {}, ack: "" });
  }
  const extracted = sanitizeExtracted(result.parsed.extracted, { occasionOptions });
  const ack = String(result.parsed.ack || "").trim().slice(0, 240);
  queueLogProviderUsage({ provider: "gemini", kind: "coach-song-plan-extract", userId: user.userId });
  return sendJson(res, 200, { ok: true, extracted, ack });
};
