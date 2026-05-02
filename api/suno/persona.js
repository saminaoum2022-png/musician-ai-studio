/**
 * Suno API proxy: create/get persona from an existing taskId.
 *
 * Env:
 * - SUNO_API_KEY
 */
module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
    const apiKey = process.env.SUNO_API_KEY;
    if (!apiKey) return json(res, 500, { error: "Missing SUNO_API_KEY on server" });

    const body = await readJson(req);
    const taskId = String(body?.taskId || "").trim();
    if (!taskId) return json(res, 400, { error: "Missing taskId" });

    const payload = { taskId };
    const endpoints = [
      "https://api.sunoapi.org/api/v1/generate/persona",
      "https://api.sunoapi.org/api/v1/persona/generate",
      "https://api.sunoapi.org/api/v1/persona",
    ];

    let lastError = null;
    for (const url of endpoints) {
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        const text = await r.text().catch(() => "");
        const data = safeJson(text);
        if (!r.ok) {
          lastError = { status: r.status, details: data || text, endpoint: url };
          continue;
        }
        const personaId =
          data?.data?.personaId ||
          data?.data?.persona_id ||
          data?.personaId ||
          data?.persona_id ||
          "";
        return json(res, 200, { ...(data || { raw: text }), personaId, endpoint: url });
      } catch (e) {
        lastError = { error: e?.message || String(e), endpoint: url };
      }
    }

    return json(res, 502, { error: "Persona endpoint failed", lastError });
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
async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}
function safeJson(txt) {
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
}
