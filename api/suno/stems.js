/**
 * Suno API proxy: request vocal/instrument separation.
 *
 * POST /api/suno/stems
 * Body:
 * - { taskId, audioId, type: "separate_vocal" | "split_stem" }
 * - { action:"add_instrumental", fileBase64, fileName?, fileType?, style?, title?, model? }
 *
 * Env:
 * - SUNO_API_KEY
 */

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

    const apiKey = process.env.SUNO_API_KEY;
    if (!apiKey) return json(res, 500, { error: "Missing SUNO_API_KEY on server" });

    const { host, proto } = getHostProto(req);
    const callBackUrl = `${proto}://${host}/api/suno/callback`;
    const body = await readJson(req);
    const action = String(body?.action || "").trim();

    if (action === "add_instrumental") {
      const fileBase64 = String(body?.fileBase64 || "").trim();
      if (!fileBase64) return json(res, 400, { error: "Missing fileBase64" });
      const fileName = String(body?.fileName || "vocal-reference.webm").trim();
      const fileType = String(body?.fileType || "audio/webm").trim();
      const style = String(body?.style || "").trim();
      const title = String(body?.title || "").trim();
      const model = String(body?.model || "V4_5ALL").trim();

      const out = new FormData();
      const bytes = Buffer.from(fileBase64, "base64");
      out.set("file", new Blob([bytes], { type: fileType }), fileName);
      if (style) out.set("style", style);
      if (title) out.set("title", title);
      out.set("model", model);
      out.set("callBackUrl", callBackUrl);

      const r = await fetch("https://api.sunoapi.org/api/v1/generate/add-instrumental", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: out,
      });
      const text = await r.text().catch(() => "");
      const data = safeJson(text);
      if (!r.ok) {
        const detailMsg =
          data?.message ||
          data?.error ||
          data?.msg ||
          (typeof text === "string" ? text.slice(0, 400) : "unknown upstream error");
        return json(res, 502, {
          error: `Upstream Suno error (${r.status})`,
          status: r.status,
          detailMessage: detailMsg,
          details: data || text,
        });
      }
      return json(res, 200, data || { raw: text });
    }

    const taskId = String(body?.taskId || "").trim();
    const audioId = String(body?.audioId || "").trim();
    const type = body?.type === "split_stem" ? "split_stem" : "separate_vocal";
    if (!taskId || !audioId) return json(res, 400, { error: "Missing taskId or audioId" });

    const payload = { taskId, audioId, type, callBackUrl };

    const r = await fetch("https://api.sunoapi.org/api/v1/vocal-removal/generate", {
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
    if (data && typeof data === "object" && "code" in data && data.code !== 200) {
      return json(res, 502, { error: "Suno rejected request", details: data });
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
