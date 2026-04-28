/**
 * Suno API proxy: get remaining credits.
 *
 * GET /api/suno/credits
 *
 * Env:
 * - SUNO_API_KEY
 */

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });

    const apiKey = process.env.SUNO_API_KEY;
    if (!apiKey) return json(res, 500, { error: "Missing SUNO_API_KEY on server" });

    const r = await fetch("https://api.sunoapi.org/api/v1/generate/credit", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const text = await r.text().catch(() => "");
    const data = safeJson(text);
    if (!r.ok) return json(res, 502, { error: "Upstream Suno error", status: r.status, details: data || text });
    return json(res, 200, data || { raw: text });
  } catch (e) {
    return json(res, 500, { error: e?.message || String(e) });
  }
};

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

function safeJson(txt) {
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

