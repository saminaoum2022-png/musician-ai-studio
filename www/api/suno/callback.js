/**
 * Optional callback receiver for Suno API.
 * We don't rely on this yet (we poll), but Suno requires a callback URL.
 */

module.exports = async function handler(req, res) {
  try {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({ ok: true }));
  } catch {
    res.statusCode = 200;
    res.end("ok");
  }
};

