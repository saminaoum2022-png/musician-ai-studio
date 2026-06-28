/**
 * POST /api/coach
 * Body: { message: string, history?: [{ role: "user"|"assistant", text: string }] }
 * Returns: { ok: true, reply: string }
 *
 * Nabad Coach — an in-app guide assistant. PRIVACY BY DESIGN:
 * - The model (Gemini) is stateless and has NO database access.
 * - This endpoint NEVER sends any user PII (email, user id, account data) or any
 *   other user's data into the prompt. It only sends our static app guide plus
 *   the user's own typed message/history. So it cannot reveal account or
 *   personal data — it never receives any.
 * - We verify the JWT only for abuse/rate-limiting, not to fetch user data.
 * - Defense in depth: emails / long tokens in user input are redacted before
 *   they ever reach the model.
 */

const { verifyUser, sendJson, setCors, readJsonBody } = require("./_lib/credits-auth");
const { COACH_SYSTEM_PROMPT } = require("./_lib/coach-knowledge");

const MAX_MESSAGE_CHARS = 1000;
const MAX_HISTORY_TURNS = 8;
const MAX_HISTORY_CHARS = 700;

// Best-effort per-user rate limit. Serverless instances are not shared, so this
// caps abuse within a warm instance; combined with auth + input caps it keeps
// Gemini cost bounded. Harden with a DB counter later if needed.
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_MAX = 30;
const _rate = new Map(); // userId -> number[] (timestamps)

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
    // prevent unbounded growth on a long-lived instance
    for (const k of _rate.keys()) { _rate.delete(k); if (_rate.size <= 4000) break; }
  }
  return false;
}

/** Strip things that look like secrets so they never reach the model. */
function redactSensitive(input) {
  let s = String(input || "");
  s = s.replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, "[redacted email]");
  // Long opaque tokens / JWTs / api keys (20+ of base64-ish/hex chars).
  s = s.replace(/\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[redacted token]");
  s = s.replace(/\b[A-Za-z0-9]{32,}\b/g, "[redacted token]");
  return s;
}

function cleanMessage(v) {
  return redactSensitive(String(v || "").trim().slice(0, MAX_MESSAGE_CHARS)).trim();
}

function normalizeHistory(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw.slice(-MAX_HISTORY_TURNS)) {
    const role = item?.role === "assistant" || item?.role === "model" ? "model" : "user";
    const text = redactSensitive(String(item?.text || item?.body || "").trim().slice(0, MAX_HISTORY_CHARS)).trim();
    if (text) out.push({ role, text });
  }
  return out;
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

async function askGemini({ geminiKey, history, message }) {
  const discovered = await listGeminiGenerateModels(geminiKey);
  const preferred = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash"];
  const models = [...preferred, ...discovered].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
  const contents = [
    ...history.map((h) => ({ role: h.role, parts: [{ text: h.text }] })),
    { role: "user", parts: [{ text: message }] },
  ];
  let lastError = discovered.length ? "unknown" : "no generateContent models discovered";
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiKey)}`;
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { role: "system", parts: [{ text: COACH_SYSTEM_PROMPT }] },
          contents,
          generationConfig: { temperature: 0.4, maxOutputTokens: 600 },
        }),
      });
      const text = await r.text().catch(() => "");
      const data = safeJson(text) || {};
      if (!r.ok) {
        lastError = data?.error?.message || text || `HTTP ${r.status}`;
        continue;
      }
      const out = extractGeminiText(data).trim();
      if (out) return { ok: true, reply: out, model };
      lastError = "empty response";
    } catch (e) {
      lastError = String(e?.message || e);
    }
  }
  return { ok: false, error: String(lastError).slice(0, 280) };
}

function extractGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts
    .map((p) => (typeof p?.text === "string" ? p.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function safeJson(txt) {
  try { return JSON.parse(txt); } catch { return null; }
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.end();
  if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "Method not allowed" });

  const user = await verifyUser(req);
  if (!user) return sendJson(res, 401, { ok: false, error: "Not signed in" });

  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  if (!geminiKey) return sendJson(res, 503, { ok: false, error: "Coach is unavailable right now." });

  if (rateLimited(user.userId)) {
    return sendJson(res, 429, { ok: false, error: "You've reached the Coach limit for now. Please try again later." });
  }

  const body = await readJsonBody(req);
  const message = cleanMessage(body?.message);
  if (!message) return sendJson(res, 400, { ok: false, error: "Message required" });
  const history = normalizeHistory(body?.history);

  const result = await askGemini({ geminiKey, history, message });
  if (!result.ok) {
    return sendJson(res, 502, { ok: false, error: "Coach couldn't respond. Please try again." });
  }
  return sendJson(res, 200, { ok: true, reply: result.reply });
};
