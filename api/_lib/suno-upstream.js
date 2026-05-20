/**
 * Thin helpers for proxying requests to api.sunoapi.org.
 */
const SUNO_BASE = "https://api.sunoapi.org";

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

function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

/**
 * @param {string} path - e.g. "/api/v1/voice/validate"
 * @param {{ method?: string, apiKey: string, body?: object, query?: Record<string,string> }} opts
 */
async function sunoJsonRequest(path, opts) {
  const method = opts.method || "GET";
  const url = new URL(path, SUNO_BASE);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v != null && String(v).trim() !== "") url.searchParams.set(k, String(v));
    }
  }
  const headers = {
    Authorization: `Bearer ${opts.apiKey}`,
    "Content-Type": "application/json",
  };
  const init = { method, headers };
  if (method !== "GET" && method !== "HEAD" && opts.body != null) {
    init.body = JSON.stringify(opts.body);
  }
  const r = await fetch(url.toString(), init);
  const text = await r.text().catch(() => "");
  const data = safeJson(text);
  const code =
    data && typeof data === "object" && "code" in data ? Number(data.code) : r.ok ? 200 : r.status;
  return { ok: r.ok && code === 200, httpStatus: r.status, code, data, text };
}

module.exports = { readJson, safeJson, sendJson, sunoJsonRequest, SUNO_BASE };
