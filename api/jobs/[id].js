/**
 * Minimal job status endpoint (skeleton).
 *
 * GET /api/jobs/:id
 */

const jobs = globalThis.__musician_jobs || (globalThis.__musician_jobs = new Map());

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }

    const id = getId(req);
    if (!id) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Missing id" }));
      return;
    }

    const job = jobs.get(id);
    if (!job) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify(job));
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: e?.message || String(e) }));
  }
};

function getId(req) {
  const url = new URL(req.url, "http://localhost");
  // Vercel routes /api/jobs/<id> to this file
  const parts = url.pathname.split("/").filter(Boolean);
  return parts[parts.length - 1] || "";
}

