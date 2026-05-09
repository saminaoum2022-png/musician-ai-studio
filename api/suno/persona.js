/**
 * Suno API proxy: create a persona from an existing taskId + audioId.
 *
 * Documented endpoint:
 *   POST https://api.sunoapi.org/api/v1/generate/generate-persona
 *   Required body: { taskId, audioId, name, description }
 *   Optional:      { vocalStart, vocalEnd, style }
 *   Requirements:  source must be a completed V4+ generation, and each
 *                  audioId can only generate a Persona once.
 *
 * Env:
 *   SUNO_API_KEY
 */
module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

    const apiKey = process.env.SUNO_API_KEY;
    if (!apiKey) return json(res, 500, { error: "Missing SUNO_API_KEY on server" });

    const body = await readJson(req);
    const taskId = String(body?.taskId || "").trim();
    const audioId = String(body?.audioId || "").trim();
    const name = String(body?.name || "").trim().slice(0, 64);
    const description = String(body?.description || "").trim().slice(0, 600);
    const style = String(body?.style || "").trim().slice(0, 80);
    const vocalStart = numOrUndefined(body?.vocalStart);
    const vocalEnd = numOrUndefined(body?.vocalEnd);

    if (!taskId) return json(res, 400, { error: "Missing taskId" });
    if (!audioId) return json(res, 400, { error: "Missing audioId" });
    if (!name) return json(res, 400, { error: "Missing name" });
    if (!description) return json(res, 400, { error: "Missing description" });

    const payload = {
      taskId,
      audioId,
      name,
      description,
      ...(style ? { style } : {}),
      ...(typeof vocalStart === "number" ? { vocalStart } : {}),
      ...(typeof vocalEnd === "number" ? { vocalEnd } : {}),
    };

    const url = "https://api.sunoapi.org/api/v1/generate/generate-persona";
    let r;
    try {
      r = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      return json(res, 502, { error: "Persona request failed", details: e?.message || String(e) });
    }

    const text = await r.text().catch(() => "");
    const data = safeJson(text);

    if (!r.ok) {
      return json(res, r.status, {
        error: "Upstream Suno persona error",
        status: r.status,
        details: data || text,
      });
    }

    const code = data && typeof data === "object" && "code" in data ? Number(data.code) : 200;
    if (code !== 200) {
      const friendly = mapPersonaCode(code, data?.msg);
      return json(res, 502, {
        error: friendly,
        code,
        details: data,
      });
    }

    const personaId =
      data?.data?.personaId ||
      data?.data?.persona_id ||
      data?.personaId ||
      data?.persona_id ||
      "";

    return json(res, 200, {
      ...(data || { raw: text }),
      personaId,
      endpoint: url,
    });
  } catch (e) {
    return json(res, 500, { error: e?.message || String(e) });
  }
};

function mapPersonaCode(code, msg) {
  switch (Number(code)) {
    case 401: return "Suno authentication failed (check SUNO_API_KEY).";
    case 402: return "Suno account is out of credits for persona creation.";
    case 404: return "That song isn't ready or audioId is wrong. Wait until the song fully finishes, then try again.";
    case 409: return "A persona was already created from this song. Each audio can be turned into a persona only once.";
    case 422: return msg || "Persona request failed validation. Check the song info and try again.";
    case 429: return "Too many persona requests right now. Wait a moment and retry.";
    case 451: return "Suno couldn't fetch this song's audio. Try again in a minute.";
    case 455: return "Suno is under maintenance. Try again shortly.";
    case 500: return "Suno hit an internal error. Try again.";
    default:  return msg || `Persona failed (code ${code})`;
  }
}

function numOrUndefined(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

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
