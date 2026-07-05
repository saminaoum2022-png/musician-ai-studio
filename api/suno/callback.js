/**
 * Optional callback receiver for Suno API.
 * Registers completion push alerts for watched tasks.
 */

const { handleSunoCallback } = require("../_lib/suno-generation-watch");

module.exports = async function handler(req, res) {
  try {
    if (req.method === "POST") {
      const body = await readJson(req);
      try {
        await handleSunoCallback(body);
      } catch (e) {
        console.warn("[suno/callback]", e?.message || e);
      }
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({ ok: true }));
  } catch {
    res.statusCode = 200;
    res.end("ok");
  }
};

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
