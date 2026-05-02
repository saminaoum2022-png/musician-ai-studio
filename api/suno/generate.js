/**
 * Suno API proxy: Generate full songs (2 variations).
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
    const {
      prompt = "",
      style = "",
      instruments = "",
      songKey = "",
      voiceTimbre = "",
      title = "",
      customMode = true,
      instrumental = false,
      model = "V4_5ALL",
      negativeTags = "",
      vocalGender,
      styleWeight,
      weirdnessConstraint,
      personaId,
    } = body || {};

    const { host, proto } = getHostProto(req);
    const callBackUrl = `${proto}://${host}/api/suno/callback`;

    const styleBits = [String(style || "").trim()];
    if (songKey) styleBits.push(`Key: ${String(songKey).trim()}`);
    if (instruments) styleBits.push(`Instruments: ${String(instruments).trim()}`);
    if (voiceTimbre) styleBits.push(`Voice timbre: ${String(voiceTimbre).trim()}`);
    const mergedStyle = styleBits.filter(Boolean).join(", ");

    const payload = {
      customMode: Boolean(customMode),
      instrumental: Boolean(instrumental),
      callBackUrl,
      model: String(model || "V4_5ALL"),
      ...(prompt ? { prompt: String(prompt) } : {}),
      ...(mergedStyle ? { style: mergedStyle } : {}),
      ...(title ? { title: String(title) } : {}),
      ...(negativeTags ? { negativeTags: String(negativeTags) } : {}),
      ...(vocalGender === "m" || vocalGender === "f" ? { vocalGender } : {}),
      ...(personaId ? { personaId: String(personaId).trim() } : {}),
      ...(Number.isFinite(Number(styleWeight)) ? { styleWeight: clamp01(Number(styleWeight)) } : {}),
      ...(Number.isFinite(Number(weirdnessConstraint))
        ? { weirdnessConstraint: clamp01(Number(weirdnessConstraint)) }
        : {}),
    };

    const r = await fetch("https://api.sunoapi.org/api/v1/generate", {
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
      return json(res, 502, { error: "Upstream Suno error", status: r.status, details: data || text });
    }

    return json(res, 200, data || { raw: text });
  } catch (e) {
    return json(res, 500, { error: e?.message || String(e) });
  }
};

function getHostProto(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  const proto = req.headers["x-forwarded-proto"] || "https";
  return { host, proto };
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

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}
