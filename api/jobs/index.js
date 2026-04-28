/**
 * Minimal job API (skeleton).
 *
 * NOTE: This stores jobs in-memory per server instance. It's only a stepping stone
 * toward Vercel KV/Postgres + object storage.
 */

const jobs = globalThis.__musician_jobs || (globalThis.__musician_jobs = new Map());

module.exports = async function handler(req, res) {
  try {
    if (req.method === "POST") return await handleCreate(req, res);
    if (req.method === "GET") return await handleList(req, res);

    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Method not allowed" }));
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: e?.message || String(e) }));
  }
};

async function handleCreate(req, res) {
  const body = await readJson(req);
  const id = randomId();
  const createdAt = Date.now();
  const job = {
    id,
    createdAt,
    status: "queued",
    input: {
      lyrics: String(body?.lyrics || ""),
      params: body?.params || {},
      melody: body?.melody || null,
    },
    result: null,
    error: null,
  };
  jobs.set(id, job);

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(job));
}

async function handleList(_req, res) {
  const list = Array.from(jobs.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 25)
    .map((j) => ({ id: j.id, createdAt: j.createdAt, status: j.status }));
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify({ jobs: list }));
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function randomId() {
  // short, readable id
  return Math.random().toString(16).slice(2, 10) + Math.random().toString(16).slice(2, 6);
}

